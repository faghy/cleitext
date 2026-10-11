import { users, withContext, type DatabaseClient } from '@cleitext/db';
import {
  changePasswordRequestSchema,
  updateProfileRequestSchema,
  type SessionView,
} from '@cleitext/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { AuditService } from '../audit/audit.service.js';
import { hashPassword, verifyPassword } from '../auth/crypto.js';
import { assertPasswordNotBreached } from '../auth/password-policy.js';
import { SessionService } from '../auth/session.service.js';
import { CurrentAuth, CurrentSite } from '../common/decorators.js';
import { parseBody } from '../common/problem.js';
import type { AuthContext, SiteContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';
import { ALLOWED_TYPES, detectType } from '../media/media-types.js';
import { MediaService } from '../media/media.service.js';
import { avatarUrl, processAvatar } from './avatar.js';

/** The signed-in user's own profile and sessions (RF-USR-07). */
@Controller('profile')
export class ProfileController {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
  ) {}

  @Get()
  get(@CurrentAuth() auth: AuthContext) {
    return {
      email: auth.email,
      displayName: auth.displayName,
      locale: auth.locale,
      avatarUrl: auth.avatarUrl,
    };
  }

  /** Sets the profile picture (multipart, `file` field): cropped to a square WebP. */
  @Post('avatar')
  async setAvatar(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
  ): Promise<{ avatarUrl: string | null }> {
    if (!request.isMultipart())
      throw new BadRequestException('Send the image as multipart/form-data.');
    const part = await request.file();
    if (!part || part.fieldname !== 'file') throw new BadRequestException('Missing "file" field.');
    let data: Buffer;
    try {
      data = await part.toBuffer();
    } catch {
      throw new HttpException('The file is too large.', HttpStatus.PAYLOAD_TOO_LARGE);
    }
    const mime = await detectType(data);
    if (!mime || ALLOWED_TYPES[mime]?.kind !== 'image') {
      throw new HttpException(
        'Upload a JPEG, PNG, GIF, WebP or AVIF image.',
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
    }
    let image: Buffer;
    try {
      image = await processAvatar(data);
    } catch {
      throw new BadRequestException('This image could not be read.');
    }
    const key = `avatars/${auth.userId}/${randomUUID()}.webp`;
    await this.media.storage.put(key, image);
    return this.replaceAvatar(site.id, auth, key);
  }

  /** Back to initials. */
  @Delete('avatar')
  removeAvatar(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
  ): Promise<{ avatarUrl: string | null }> {
    return this.replaceAvatar(site.id, auth, null);
  }

  private async replaceAvatar(
    siteId: string,
    auth: AuthContext,
    key: string | null,
  ): Promise<{ avatarUrl: string | null }> {
    const previous = await withContext(
      this.database.db,
      { siteId, userId: auth.userId },
      async (tx) => {
        const [user] = await tx
          .select({ avatarKey: users.avatarKey })
          .from(users)
          .where(eq(users.id, auth.userId));
        await tx.update(users).set({ avatarKey: key }).where(eq(users.id, auth.userId));
        return user?.avatarKey ?? null;
      },
    );
    if (previous && previous !== key) await this.media.storage.delete(previous);
    return { avatarUrl: avatarUrl(key) };
  }

  @Patch()
  async update(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
  ) {
    const input = parseBody(updateProfileRequestSchema, body);
    const [updated] = await withContext(
      this.database.db,
      { siteId: site.id, userId: auth.userId },
      (tx) =>
        tx
          .update(users)
          .set({
            ...(input.displayName ? { displayName: input.displayName } : {}),
            ...(input.locale ? { locale: input.locale } : {}),
          })
          .where(eq(users.id, auth.userId))
          .returning(),
    );
    return {
      email: updated!.email,
      displayName: updated!.displayName,
      locale: updated!.locale,
      avatarUrl: avatarUrl(updated!.avatarKey),
    };
  }

  /** Changes the password and signs out every other session. */
  @Post('password')
  @HttpCode(204)
  async changePassword(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    const input = parseBody(changePasswordRequestSchema, body);
    await withContext(this.database.db, { siteId: site.id, userId: auth.userId }, async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, auth.userId));
      if (!(await verifyPassword(user?.passwordHash ?? null, input.currentPassword))) {
        throw new BadRequestException('The current password is not correct.');
      }
      assertPasswordNotBreached(input.newPassword, 'newPassword');
      await tx
        .update(users)
        .set({ passwordHash: await hashPassword(input.newPassword) })
        .where(eq(users.id, auth.userId));
      await this.audit.record(tx, {
        siteId: site.id,
        userId: auth.userId,
        action: 'user.password.changed',
        ip: request.ip,
      });
    });
    await this.sessions.revokeAll(auth.userId, auth.sessionId);
  }

  @Get('sessions')
  async listSessions(@CurrentAuth() auth: AuthContext): Promise<SessionView[]> {
    const rows = await this.sessions.listForUser(auth.userId);
    return rows.map((s) => ({
      id: s.id,
      current: s.id === auth.sessionId,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      ip: s.ip,
      userAgent: s.userAgent,
    }));
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  async revokeSession(@CurrentAuth() auth: AuthContext, @Param('id') id: string): Promise<void> {
    if (!(await this.sessions.revokeForUser(auth.userId, id))) {
      throw new NotFoundException('Session not found.');
    }
  }
}
