/**
 * A site built with Elementor, imported with the WordPress Importer into a
 * site with Fresco (plugin API 1.28): its pages become Fresco pages, its kit
 * joins Fresco's site settings through `import.pluginData`, and what needs
 * Fresco Pro (templates, site CSS) is reported when Fresco Pro is missing.
 */
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import { PluginServicesProvider } from '../src/plugins/plugin-services.service.js';
import { ownerDatabase, seedSite, seedUser, startTestApp, TestClient } from './helpers.js';

const PASSWORD = 'correct horse battery staple';
const pluginsRoot = fileURLToPath(new URL('../../../plugins', import.meta.url));

let app: NestFastifyApplication;
let owner: DatabaseClient;
let admin: TestClient;
let visitor: TestClient;

const meta = (key: string, value: string) =>
  `<wp:postmeta><wp:meta_key>${key}</wp:meta_key><wp:meta_value><![CDATA[${value}]]></wp:meta_value></wp:postmeta>`;
const php = (value: string) => `s:${Buffer.byteLength(value)}:"${value}";`;

/** A kit with a brand color and font, a header template and a page, as WordPress exports them. */
const wxr = `<?xml version="1.0"?>
<rss version="2.0" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel><title>Studio</title><link>https://studio.example</link><wp:wxr_version>1.2</wp:wxr_version><wp:base_blog_url>https://studio.example</wp:base_blog_url>
<item><title>Default Kit</title><dc:creator>ann</dc:creator><wp:post_id>2</wp:post_id><wp:post_name>default-kit</wp:post_name><wp:post_type>elementor_library</wp:post_type><wp:status>publish</wp:status>
${meta('_elementor_template_type', 'kit')}${meta(
  '_elementor_page_settings',
  `a:3:{${php('system_colors')}a:1:{i:0;a:3:{${php('_id')}${php('primary')}${php('title')}${php('Primary')}${php('color')}${php('#7a1fa2')}}}${php('custom_colors')}a:1:{i:0;a:3:{${php('_id')}${php('c0ffee1')}${php('title')}${php('Coffee')}${php('color')}${php('#6f4e37')}}}${php('container_width')}a:2:{${php('unit')}${php('px')}${php('size')}i:1200;}}`,
)}</item>
<item><title>Header</title><dc:creator>ann</dc:creator><wp:post_id>3</wp:post_id><wp:post_name>header</wp:post_name><wp:post_type>elementor_library</wp:post_type><wp:status>publish</wp:status>
${meta('_elementor_template_type', 'header')}${meta('_elementor_conditions', `a:1:{i:0;${php('include/general')}}`)}${meta('_elementor_edit_mode', 'builder')}${meta('_elementor_data', '[]')}</item>
<item><title>Welcome</title><link>https://studio.example/welcome/</link><dc:creator>ann</dc:creator><wp:post_id>10</wp:post_id><wp:post_name>welcome</wp:post_name><wp:post_type>page</wp:post_type><wp:status>publish</wp:status>
<content:encoded><![CDATA[<p>Old content</p>]]></content:encoded>
${meta('_elementor_edit_mode', 'builder')}${meta(
  '_elementor_data',
  JSON.stringify([
    {
      id: 'k1',
      elType: 'container',
      settings: {
        __globals__: { background_color: 'globals/colors?id=c0ffee1' },
        background_background: 'classic',
      },
      elements: [
        {
          id: 'w1',
          elType: 'widget',
          widgetType: 'heading',
          settings: {
            title: 'Fresh from Elementor',
            typography_typography: 'custom',
            typography_font_family: 'Abel',
          },
        },
      ],
    },
  ]),
)}</item>
</channel></rss>`;

async function finished(): Promise<{
  status: string;
  report?: { warnings: string[]; errors: string[] };
  error?: string;
}> {
  for (let i = 0; i < 300; i++) {
    const { job } = (await admin.get('/api/v1/ext/wordpress-importer/status')).json();
    if (job.status !== 'running') return job;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('The import did not finish.');
}

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  for (const slug of ['wordpress-importer', 'fresco']) {
    await buildPlugin(join(pluginsRoot, slug));
    const source = join(await mkdtemp(join(tmpdir(), `${slug}-src-`)), slug);
    await cp(join(pluginsRoot, slug), source, {
      recursive: true,
      filter: (file) => !file.includes('node_modules'),
    });
    await installPlugin(owner.db, {
      source,
      pluginsPath,
      appRole: new URL(inject('appUrl')).username,
    });
  }
  app = await startTestApp({ pluginsPath });
  // No request leaves the tests: Fresco's copies of Google fonts are not made.
  vi.spyOn(app.get(PluginServicesProvider), 'httpSend').mockResolvedValue({
    status: 503,
    type: 'text/plain',
    text: '',
  });
  const site = await seedSite(owner, 'elementor-import');
  await seedUser(owner, {
    email: 'admin@eli.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.48.0.1');
  visitor = new TestClient(app, site.host, '10.48.0.2');
  await admin.login('admin@eli.test', PASSWORD);
  for (const slug of ['fresco', 'wordpress-importer']) {
    expect((await admin.post(`/api/v1/plugins/${slug}/activate`)).statusCode).toBe(200);
  }
}, 240_000);

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('Elementor sites into Fresco', () => {
  it('imports pages as Fresco pages and the kit into Fresco', async () => {
    const started = await admin.upload(
      '/api/v1/ext/wordpress-importer/imports?locale=en',
      'elementor.xml',
      Buffer.from(wxr),
      'text/xml',
    );
    expect(started.statusCode).toBe(202);
    const job = await finished();
    expect(job.error ?? job.status).toBe('done');
    expect(job.report!.errors).toEqual([]);
    const report = job.report!.warnings.join('\n');
    // Fresco took its data; Fresco Pro's (templates, site settings) needs Fresco Pro.
    expect(report).toContain(
      'Fresco site settings (global colors and fonts, layout, theme style) were updated',
    );
    expect(report).toContain('1 entry of the type "fresco_template" was not imported');
    expect(report).toContain('Settings for the plugin "fresco-pro" were not imported');

    const kit = (await admin.get('/api/v1/ext/fresco/kit')).json();
    expect(kit.colors).toEqual(
      expect.arrayContaining([
        { id: 'primary', title: 'Primary', value: '#7a1fa2' },
        { id: 'c0ffee1', title: 'Coffee', value: '#6f4e37' },
      ]),
    );
    expect(kit.containerWidth).toEqual({ size: 1200, unit: 'px' });
    expect(kit.googleFonts).toContain('Abel');

    const html = (await visitor.get('/welcome')).body;
    expect(html).toContain('Fresh from Elementor');
    expect(html).toContain('--fr-c-c0ffee1:#6f4e37');
    expect(html).toContain('background-color:var(--fr-c-c0ffee1)');
    // Google fonts are kept on the site (Fresco 2.8): no link to Google.
    expect(html).not.toContain('fonts.googleapis.com');
  });
});
