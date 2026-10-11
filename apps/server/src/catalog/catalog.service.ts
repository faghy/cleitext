import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { SDK_VERSION } from '@cleitext/plugin-sdk';
import {
  catalogSchema,
  type CatalogEntryView,
  type CatalogItem,
  type CatalogView,
} from '@cleitext/shared';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import semver from 'semver';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { PluginHost } from '../plugins/plugin-host.service.js';
import { packageRoot, runCli, unpackPackage } from '../plugins/package-upload.js';
import { installedThemes } from '../public/themes.js';
import { UpdatesService } from '../updates/updates.service.js';

/** How long the index is kept before asking again. */
const TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20_000;
const MAX_PACKAGE_BYTES = 50 * 1024 * 1024;

/**
 * The plugin and theme catalog (RF-PLG-07/09/11): a JSON index signed with
 * Ed25519, read from CATALOG_URL. Packages are checked against the SHA-256 of
 * the signed index, then installed by the CLI like an upload.
 */
@Injectable()
export class CatalogService {
  private cached: { items: CatalogItem[]; at: number } | null = null;
  private lastError: string | null = null;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly plugins: PluginHost,
    private readonly updates: UpdatesService,
  ) {}

  get enabled(): boolean {
    return this.config.catalog.url !== '';
  }

  /** The verified index, from memory for an hour. */
  async items(refresh = false): Promise<CatalogItem[]> {
    if (!this.enabled) return [];
    if (!refresh && this.cached && Date.now() - this.cached.at < TTL_MS) return this.cached.items;
    try {
      const [body, signature] = await Promise.all([
        this.fetch(this.config.catalog.url),
        this.fetch(`${this.config.catalog.url}.sig`),
      ]);
      const key = createPublicKey({
        key: Buffer.from(this.config.catalog.publicKey, 'base64'),
        format: 'der',
        type: 'spki',
      });
      if (!verify(null, body, key, Buffer.from(signature.toString('utf8').trim(), 'base64'))) {
        throw new Error('The signature of the catalog does not match: it was not used.');
      }
      const parsed = catalogSchema.parse(JSON.parse(body.toString('utf8')));
      this.cached = { items: parsed.items, at: Date.now() };
      this.lastError = null;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      // The last good index stays usable until a new one can be read.
      if (!this.cached) return [];
    }
    return this.cached.items;
  }

  /** The catalog with what this site has installed. */
  async view(refresh = false): Promise<CatalogView> {
    const items = await this.items(refresh);
    return {
      enabled: this.enabled,
      items: items.map((item) => this.entry(item)),
      error: this.lastError,
      checkedAt: this.cached ? new Date(this.cached.at).toISOString() : null,
    };
  }

  /** Installed plugins and themes with a newer compatible version in the catalog. */
  async available(): Promise<CatalogEntryView[]> {
    return (await this.view()).items.filter((item) => item.update && item.compatible);
  }

  private entry(item: CatalogItem): CatalogEntryView {
    const installed =
      item.type === 'plugin'
        ? (this.plugins.get(item.slug)?.version ?? null)
        : (installedThemes().find((t) => !t.bundled && t.theme.slug === item.slug)?.theme.version ??
          null);
    const compatible =
      item.type === 'plugin'
        ? !item.apiVersion || semver.satisfies(SDK_VERSION, item.apiVersion)
        : !item.requires ||
          semver.satisfies(semver.coerce(this.updates.current) ?? '0.0.0', item.requires);
    return {
      ...item,
      installed,
      update: Boolean(installed && semver.valid(installed) && semver.gt(item.version, installed)),
      compatible,
    };
  }

  /** Downloads, checks and installs (or updates) an item; the CLI does the rest. */
  async install(
    type: 'plugin' | 'theme',
    slug: string,
  ): Promise<{ version: string; message: string }> {
    if (!this.enabled)
      throw new ServiceUnavailableException('The catalog is turned off on this server.');
    const item = (await this.items()).find((i) => i.type === type && i.slug === slug);
    if (!item) throw new NotFoundException(`"${slug}" is not in the catalog.`);
    const entry = this.entry(item);
    if (!entry.compatible) {
      throw new BadRequestException(
        `${item.name} ${item.version} does not work with this version of Cleitext: update Cleitext first.`,
      );
    }
    if (entry.installed && !entry.update) {
      throw new BadRequestException(`${item.name} ${entry.installed} is already installed.`);
    }
    const data = await this.fetch(item.download, MAX_PACKAGE_BYTES);
    const digest = createHash('sha256').update(data).digest('hex');
    if (digest !== item.sha256) {
      throw new BadRequestException(
        'The downloaded package does not match the catalog (SHA-256): it was not installed.',
      );
    }
    const dir = await unpackPackage(data, `${slug}.zip`);
    try {
      const manifestName = type === 'plugin' ? 'cleitext.plugin.json' : 'theme.json';
      const root = await packageRoot(dir, manifestName);
      const manifest = JSON.parse(await readFile(path.join(root, manifestName), 'utf8')) as {
        slug?: string;
      };
      if (manifest.slug !== slug)
        throw new BadRequestException('The package is not the one expected.');
      const message = await runCli([`${type}:install`, root], this.config);
      return { version: item.version, message };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private async fetch(url: string, maxBytes = 5 * 1024 * 1024): Promise<Buffer> {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'user-agent': `Cleitext/${this.updates.current}` },
    });
    if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}.`);
    const length = Number(res.headers.get('content-length') ?? 0);
    if (length > maxBytes) throw new Error('The file is too large.');
    const data = Buffer.from(await res.arrayBuffer());
    if (data.length > maxBytes) throw new Error('The file is too large.');
    return data;
  }
}
