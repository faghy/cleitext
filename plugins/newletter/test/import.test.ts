import { readFileSync } from 'node:fs';
import { phpMetaValue } from '@cleitext/plugin-sdk';
import { describe, expect, it } from 'vitest';
import { BLOCK_TYPE, SHORTCODE } from '../src/config';
import {
  blockFromShortcode,
  blocksFromImportedBlock,
  collectMc4wpForms,
  type WxrItemLike,
  embeddedForm,
  isNewsletterShortcode,
  refProvider,
} from '../src/import/convert';

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

const mc4wpItems: WxrItemLike[] = [
  {
    id: 12,
    type: 'mc4wp-form',
    title: 'Main form',
    content: fixture('mc4wp-form.html'),
    meta: { _mc4wp_settings: fixture('mc4wp-settings.txt') },
  },
  { id: 13, type: 'page', title: 'About', content: '', meta: {} },
];

describe('WordPress import: newsletter forms', () => {
  it('know which shortcodes are newsletter forms', () => {
    for (const tag of [SHORTCODE, 'newsletter', 'newsletter_form', 'mc4wp_form', 'MailPoet_Form'])
      expect(isNewsletterShortcode(tag)).toBe(true);
    expect(isNewsletterShortcode('contact-form-7')).toBe(false);
  });

  it('read Mailchimp for WP forms (lists from the serialized settings)', () => {
    const forms = collectMc4wpForms(mc4wpItems, phpMetaValue);
    expect([...forms.keys()]).toEqual(['12']);
    expect(forms.get('12')!.lists).toEqual(['f00ba4d1ce', 'abc1234567']);
    expect(forms.get('12')!.title).toBe('Main form');
  });

  it('turn [mc4wp_form] and its block into the signup block with the lists and fields', () => {
    const forms = collectMc4wpForms(mc4wpItems, phpMetaValue);
    expect(blockFromShortcode('mc4wp_form', { id: '12' }, 'b1', { forms })).toEqual({
      id: 'b1',
      type: BLOCK_TYPE,
      v: 1,
      attrs: {
        fields: 'name',
        buttonLabel: 'Join the club',
        lists: 'f00ba4d1ce,abc1234567',
        ref: 'mc4wp:12',
      },
    });
    // Without an id, the default (first) form; a form missing from the export, just the ref.
    expect(blockFromShortcode('mc4wp_form', {}, 'b2', { forms })!.attrs.lists).toBe(
      'f00ba4d1ce,abc1234567',
    );
    expect(blockFromShortcode('mc4wp_form', { id: '99' }, 'b3', { forms })!.attrs).toEqual({
      ref: 'mc4wp:99',
    });
    expect(blocksFromImportedBlock('mailchimp-for-wp/form', { id: 12 }, '', 'b4', forms)).toEqual([
      expect.objectContaining({ attrs: expect.objectContaining({ ref: 'mc4wp:12' }) }),
    ]);
    expect(refProvider('mc4wp:12')).toBe('mailchimp');
  });

  it('turn The Newsletter Plugin’s shortcodes into the signup block, with its fields', () => {
    const page = fixture('tnp-page.html');
    const m = /\[newsletter_form([^\]]*)\]([\s\S]*?)\[\/newsletter_form\]/.exec(page)!;
    const attrs = Object.fromEntries(
      [...m[1]!.matchAll(/(\w+)="([^"]*)"/g)].map((a) => [a[1]!, a[2]!]),
    );
    const block = blockFromShortcode('newsletter_form', attrs, 'b1', { content: m[2] });
    // Its lists are its own (not a service's): not carried.
    expect(block!.attrs).toEqual({ fields: 'name-surname', buttonLabel: 'Go!', ref: 'tnp' });
    expect(page).toContain('[newsletter]');
    expect(blockFromShortcode('newsletter', {}, 'b2')!.attrs).toEqual({
      fields: 'email',
      ref: 'tnp',
    });
    expect(refProvider('tnp')).toBeNull();
  });

  it('turn the plugin’s own shortcode into its block', () => {
    expect(
      blockFromShortcode(
        SHORTCODE,
        { lists: '7, 9', tags: 'web', fields: 'name', layout: 'inline', double_optin: 'yes' },
        'b1',
      )!.attrs,
    ).toEqual({ lists: '7,9', tags: 'web', fields: 'name', layout: 'inline', doubleOptIn: 'on' });
  });

  it('turn MailPoet’s and Brevo’s plugin forms into the block, without lists', () => {
    const page = fixture('mailpoet-page.html');
    expect(page).toContain('"formId":2');
    expect(
      blocksFromImportedBlock('mailpoet/subscription-form-block', { formId: 2 }, '', 'b1'),
    ).toEqual([{ id: 'b1', type: BLOCK_TYPE, v: 1, attrs: { ref: 'mailpoet:2' } }]);
    expect(blockFromShortcode('mailpoet_form', { id: '2' }, 'b2')!.attrs).toEqual({
      ref: 'mailpoet:2',
    });
    expect(blockFromShortcode('sibwp_form', { id: '1' }, 'b3')!.attrs).toEqual({
      ref: 'sibwp:1',
    });
  });

  it('turn a Mailchimp embedded form into the block, with its list', () => {
    const html = fixture('mailchimp-embed.html');
    expect(embeddedForm(html)).toEqual({
      fields: 'name-surname',
      buttonLabel: 'Sign me up',
      heading: 'Subscribe to our news',
      lists: 'f00ba4d1ce',
      ref: 'mailchimp',
    });
    expect(blocksFromImportedBlock('core/html', { content: html }, html, 'b1')![0]).toMatchObject({
      type: BLOCK_TYPE,
      attrs: { lists: 'f00ba4d1ce' },
    });
  });

  it('turn Brevo’s forms and iframes into the block', () => {
    expect(embeddedForm(fixture('brevo-form.html'))).toEqual({
      fields: 'name',
      buttonLabel: 'Iscriviti',
      heading: '',
      ref: 'brevo',
    });
    const iframe = embeddedForm(fixture('brevo-iframe.html'));
    expect(iframe).toEqual({
      fields: 'email',
      buttonLabel: '',
      heading: 'Stay in touch',
      ref: 'brevo',
    });
  });

  it('read MailerLite, Kit and ActiveCampaign forms', () => {
    expect(
      embeddedForm(
        '<div class="ml-embedded" data-form="Ab1"><form action="https://assets.mailerlite.com/jsonp/1/forms/2/subscribe"><input name="fields[email]"><input name="fields[name]"><input type="hidden" name="groups[]" value="1234567"><button type="submit">Join</button></form></div>',
      ),
    ).toMatchObject({ ref: 'mailerlite', lists: '1234567', fields: 'name', buttonLabel: 'Join' });
    expect(
      embeddedForm(
        '<form action="https://app.convertkit.com/forms/4321/subscriptions" data-sv-form="4321"><input name="email_address"></form>',
      ),
    ).toMatchObject({ ref: 'kit', lists: '4321', fields: 'email' });
    expect(
      embeddedForm(
        '<form action="https://acme.activehosted.com/proc.php"><input type="hidden" name="nlbox[]" value="3"><input name="fullname"><input name="email"></form>',
      ),
    ).toMatchObject({ ref: 'activecampaign', lists: '3' });
  });

  it('leave other blocks and HTML to other plugins', () => {
    expect(blocksFromImportedBlock('core/html', { content: '<hr>' }, '<hr>', 'b1')).toBeNull();
    expect(blocksFromImportedBlock('acme/slider', {}, '', 'b1')).toBeNull();
    expect(embeddedForm('<a href="https://x.sibforms.com/serve/1">Sign up</a>')).toBeNull();
    expect(blockFromShortcode('gallery', {}, 'b1')).toBeNull();
  });
});
