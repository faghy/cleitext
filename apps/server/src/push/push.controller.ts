import { pushDevices, withContext, type DatabaseClient } from '@cleitext/db';
import {
  MAX_PUSH_DEVICES,
  PUSH_EVENT_IDS,
  registerPushDeviceSchema,
  updatePushDeviceSchema,
  type PushDeviceView,
  type PushEvent,
  type PushPlatform,
  type PushStatusView,
} from '@cleitext/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { CurrentAuth, CurrentSite } from '../common/decorators.js';
import { parseBody } from '../common/problem.js';
import type { AuthContext, SiteContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';
import { PushService } from './push.service.js';

type DeviceRow = typeof pushDevices.$inferSelect;

function view(row: DeviceRow): PushDeviceView {
  return {
    id: row.id,
    platform: row.platform as PushPlatform,
    name: row.name,
    events: row.events.filter((e): e is PushEvent => (PUSH_EVENT_IDS as string[]).includes(e)),
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
  };
}

/**
 * Push notifications of the official app: each person registers their
 * phones on the site (with a Bearer token from the app's sign-in, or the
 * admin's session) and sees and changes only their own.
 */
@Controller('push')
export class PushController {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly push: PushService,
  ) {}

  private run<T>(site: SiteContext, auth: AuthContext, fn: Parameters<typeof withContext<T>>[2]) {
    return withContext(this.database.db, { siteId: site.id, userId: auth.userId }, fn);
  }

  @Get('status')
  status(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
  ): Promise<PushStatusView> {
    return this.push.status(site.id, auth);
  }

  @Get('devices')
  async list(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
  ): Promise<PushDeviceView[]> {
    const rows = await this.run(site, auth, (tx) =>
      tx
        .select()
        .from(pushDevices)
        .where(eq(pushDevices.userId, auth.userId))
        .orderBy(asc(pushDevices.createdAt)),
    );
    return rows.map(view);
  }

  /**
   * Registers the phone, or refreshes it when the token is known (the app
   * calls it at every start). A token of another person's account on the
   * site moves to this one, with every event again.
   */
  @Post('devices')
  async register(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
  ): Promise<PushDeviceView> {
    const input = parseBody(registerPushDeviceSchema, body);
    const row = await this.run(site, auth, async (tx) => {
      const [saved] = await tx
        .insert(pushDevices)
        .values({
          siteId: site.id,
          userId: auth.userId,
          token: input.token,
          platform: input.platform,
          name: input.name ?? '',
          events: [...PUSH_EVENT_IDS],
        })
        .onConflictDoUpdate({
          target: [pushDevices.siteId, pushDevices.token],
          set: {
            platform: input.platform,
            ...(input.name !== undefined ? { name: input.name } : {}),
            lastSeenAt: new Date(),
            events: sql`case when ${pushDevices.userId} = ${auth.userId}::uuid then ${pushDevices.events} else excluded.events end`,
            userId: auth.userId,
          },
        })
        .returning();
      // The oldest phones go beyond the limit.
      const mine = await tx
        .select({ id: pushDevices.id })
        .from(pushDevices)
        .where(eq(pushDevices.userId, auth.userId))
        .orderBy(sql`${pushDevices.lastSeenAt} desc`);
      for (const old of mine.slice(MAX_PUSH_DEVICES)) {
        await tx.delete(pushDevices).where(eq(pushDevices.id, old.id));
      }
      return saved!;
    });
    return view(row);
  }

  /** The events this phone receives. */
  @Put('devices/:id')
  async update(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ): Promise<PushDeviceView> {
    const input = parseBody(updatePushDeviceSchema, body);
    const [row] = await this.run(site, auth, (tx) =>
      tx
        .update(pushDevices)
        .set({ events: [...new Set(input.events)] })
        .where(and(eq(pushDevices.id, id), eq(pushDevices.userId, auth.userId)))
        .returning(),
    );
    if (!row) throw new NotFoundException('This device is not registered.');
    return view(row);
  }

  @Delete('devices/:id')
  @HttpCode(204)
  async remove(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    const removed = await this.run(site, auth, (tx) =>
      tx
        .delete(pushDevices)
        .where(and(eq(pushDevices.id, id), eq(pushDevices.userId, auth.userId)))
        .returning({ id: pushDevices.id }),
    );
    if (removed.length === 0) throw new NotFoundException('This device is not registered.');
  }
}
