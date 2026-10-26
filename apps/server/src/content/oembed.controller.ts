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
    const attr = (value: string) =>
      value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
    if (embed.layout === 'card') {
      // No frame for this address (a profile): the card the page shows.
      const shown = embed.src.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
      return {
        version: '1.0',
        type: 'rich',
        provider_name: embed.providerName,
        width: 480,
        height: 110,
        html:
          `<a href="${attr(embed.src)}" target="_blank" rel="noopener noreferrer" ` +
          `style="display:flex;flex-direction:column;gap:2px;max-width:30rem;padding:14px 18px;` +
          `border:1px solid #ccc;border-left:4px solid #555;border-radius:8px;color:inherit;` +
          `text-decoration:none;font:15px/1.4 system-ui,sans-serif">` +
          `<span style="font-size:12px;font-weight:600;text-transform:uppercase;opacity:.7">${attr(embed.providerName)}</span>` +
          `<strong>${attr(embed.handle ?? embed.title)}</strong>` +
          `<span style="font-size:13px;text-decoration:underline">${attr(shown)}</span></a>`,
      };
    }
    return {
      version: '1.0',
      type: embed.type === 'video' ? 'video' : 'rich',
      provider_name: embed.providerName,
      width: embed.width,
      height: embed.height,
      html:
        `<iframe src="${attr(embed.src)}" title="${attr(embed.title)}" width="${embed.width}" ` +
        `height="${embed.height}" frameborder="0" loading="lazy" ` +
        // A fixed frame is as wide as the preview, up to its own width.
        (embed.layout === 'fixed' ? 'style="display:block;width:100%;max-width:100%" ' : '') +
        `allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture; web-share" ` +
        `allowfullscreen></iframe>`,
    };
  }
}
