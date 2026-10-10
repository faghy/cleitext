import { resolveEmbed } from '@cleitext/blocks';
import { BadRequestException, Controller, Get, NotFoundException, Query } from '@nestjs/common';
import { RequireCapability } from '../common/decorators.js';

/** oEmbed response, in the shape of WordPress's `/oembed/1.0/proxy`. */
export interface OEmbedResponse {
  version: '1.0';
  type: 'video' | 'rich';
  provider_name: string;
  html: string;
  width: number;
  height: number;
}

/**
 * Embed previews for the editor (RF-EDT-02). Known providers are resolved
 * from the address itself: no request leaves the server (no SSRF surface).
 */
@Controller('oembed')
@RequireCapability('edit_entries')
export class OEmbedController {
  @Get()
  get(@Query('url') url: unknown): OEmbedResponse {
    if (typeof url !== 'string' || !url || url.length > 2_000) {
      throw new BadRequestException('Give the address to embed in "url".');
    }
    const embed = resolveEmbed(url);
    if (!embed) throw new NotFoundException('This address cannot be embedded.');
    const src = embed.src.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
    return {
      version: '1.0',
      type: embed.type,
      provider_name: embed.providerName,
      width: embed.width,
      height: embed.height,
      html:
        `<iframe src="${src}" title="${embed.providerName}" width="${embed.width}" ` +
        `height="${embed.height}" frameborder="0" loading="lazy" ` +
        `allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" ` +
        `allowfullscreen></iframe>`,
    };
  }
}
