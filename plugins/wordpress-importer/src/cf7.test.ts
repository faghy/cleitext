import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CxdBlock } from '@cleitext/blocks';
import { convertCf7, fieldName, parseTags } from './cf7';
import { wxrToDocument } from './wxr';

const fixtures = new URL('../../../apps/server/test/fixtures/wxr/', import.meta.url);
const read = (name: string) => readFileSync(new URL(name, fixtures), 'utf8');

describe('Contact Form 7 tags', () => {
  it('are read with their options, values and enclosed text', () => {
    const [text, acceptance, submit] = parseTags(
      '[text* your-name class:big placeholder "Name"] [acceptance ok optional] I agree [/acceptance] [submit "Go"]',
    );
    expect(text).toMatchObject({
      type: 'text',
      required: true,
      name: 'your-name',
      options: ['class:big', 'placeholder'],
      values: ['Name'],
    });
    expect(acceptance).toMatchObject({
      type: 'acceptance',
      options: ['optional'],
      content: ' I agree ',
    });
    expect(submit).toMatchObject({ type: 'submit', values: ['Go'] });
    expect(fieldName('Your Name!')).toBe('your-name');
  });

  it('become Forms fields, with labels from the markup around them', () => {
    const { attrs, warnings } = convertCf7(
      {
        id: 1,
        title: 'Hotel',
        hash: '',
        template:
          '<p>Name*<br />[text* name]</p><p>[email* email placeholder "Email*"]</p><label>Notes [textarea notes]Hello[/textarea]</label><p>Checks</p>[checkbox opt default:2 "A" "B"][hidden secret "x"][submit]',
        mail: {
          subject: '[_site_title] – [name] [_remote_ip]',
          recipient: '[_site_admin_email]',
          additional_headers: '',
        },
        mail2: null,
        messages: null,
      },
      'Hotel Aurora',
    );
    expect(attrs).toEqual({
      formName: 'Hotel',
      buttonLabel: 'Send',
      fields: [
        { name: 'name', type: 'text', label: 'Name', width: 'full', required: true },
        {
          name: 'email',
          type: 'email',
          label: '',
          width: 'full',
          required: true,
          placeholder: 'Email*',
        },
        { name: 'notes', type: 'textarea', label: 'Notes', width: 'full', value: 'Hello' },
        {
          name: 'opt',
          type: 'checkbox',
          label: 'Checks',
          width: 'full',
          options: 'A\nB',
          value: 'B',
        },
      ],
      subject: 'Hotel Aurora – {name}',
    });
    expect(warnings).toEqual(['the field [hidden secret] has no equivalent and was left out']);
  });

  it('turn a menu with several choices into checkboxes', () => {
    const { attrs, warnings } = convertCf7({
      id: 1,
      title: 'X',
      hash: '',
      template: '[select* rooms multiple "Single|s" "Double|d"]',
      mail: null,
      mail2: null,
      messages: null,
    });
    expect((attrs.fields as unknown[])[0]).toMatchObject({
      type: 'checkbox',
      options: 's|Single\nd|Double',
    });
    expect(warnings[0]).toContain('became checkboxes');
  });
});

describe('a site with Contact Form 7', () => {
  const { document, warnings } = wxrToDocument(read('cf7.xml'), { locale: 'en' });
  const forms = (ref: string) =>
    document
      .entries!.find((e) => e.ref === ref)!
      .document.blocks.filter((b): b is CxdBlock => (b as CxdBlock).type === 'forms/contact');

  it('shows Forms blocks where the shortcodes were, by id, title or hash', () => {
    const [booking] = forms('post:70');
    expect(booking!.attrs).toMatchObject({
      formName: 'Booking',
      buttonLabel: 'Send request',
      subject: 'Rooms by the sea booking from {your-name}',
      replyTo: 'your-email',
      successMessage: 'Thank you, we will reply within a day.',
      submitInline: true,
    });
    const fields = booking!.attrs.fields as { name: string; type: string; label: string }[];
    expect(fields.map((f) => [f.name, f.type, f.label])).toEqual([
      ['your-name', 'text', 'Your name'],
      ['your-email', 'email', 'Your email'],
      ['your-phone', 'tel', 'Phone'],
      ['your-site', 'url', 'Website'],
      ['guests', 'number', 'Guests'],
      ['arrival', 'date', 'Arrival'],
      ['room', 'select', 'Room'],
      ['extras', 'checkbox', 'Extras'],
      ['contact-by', 'radio', 'Contact me by'],
      ['your-message', 'textarea', 'Your message'],
      ['privacy', 'acceptance', 'I accept the <a href="/privacy-policy">privacy policy</a>'],
    ]);
    expect(fields[4]).toMatchObject({ min: '1', max: '8', value: '2' });
    expect(fields[6]).toMatchObject({
      placeholder: 'Choose a room',
      options: 'single|Single\ndouble|Double',
      value: 'double',
    });
    // By title, and by CF7 5.8's hash.
    expect(forms('post:71').map((b) => b.attrs.formName)).toEqual(['Newsletter', 'Booking']);
    expect(forms('post:71')[0]!.attrs.fields).toEqual([
      {
        name: 'news-email',
        type: 'email',
        label: '',
        width: 'full',
        required: true,
        placeholder: 'Your email',
      },
      { name: 'consent', type: 'checkbox', label: 'Send me news', width: 'full' },
    ]);
  });

  it('reports what Forms cannot do, and the forms missing from the export', () => {
    const report = warnings.join('\n');
    expect(report).toContain('Contact Form 7 form "Booking": the quiz "capital" was left out');
    expect(report).toContain('the file upload "cv" was left out');
    expect(report).toContain('the field [dynamictext source] has no equivalent');
    expect(report).toContain('its messages went to bookings@rooms.example.com');
    expect(report).toContain('its autoresponder (Mail (2)) was left out');
    expect(report).toContain('3 Contact Form 7 shortcode(s) became Forms blocks (2 form(s))');
    expect(report).toContain(
      '[contact-form-7 id="99" title="Gone"]: the form is not in the export',
    );
    expect(forms('post:72')).toEqual([]);
  });
});
