import { Controller, Get, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { NoCsrf, Public } from '../common/decorators.js';
import { ChatService } from './chat.service.js';

/**
 * `/.well-known/cleitext-ai-relay` (core 0.117): while the site registers
 * with the relay of Chriss base, the SHA-256 of the one-time secret it sent
 * there, so the relay knows the site asking is the one at this address.
 * 404 at any other time.
 */
@Controller()
@Public()
@NoCsrf()
export class AiRelayController {
  constructor(private readonly chat: ChatService) {}

  @Get('.well-known/cleitext-ai-relay')
  async challenge(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    const challenge = request.site ? await this.chat.pendingChallenge(request.site.id) : null;
    void reply.header('cache-control', 'no-store');
    if (!challenge) {
      return reply.code(404).type('application/json').send({ error: 'No registration pending.' });
    }
    return reply.type('application/json').send({ challenge });
  }
}
