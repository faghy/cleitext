import { describe, expect, it } from 'vitest';
import {
  form,
  formAccept,
  formCheckbox,
  formEmail,
  formHidden,
  formName,
  formPhone,
  formToggle,
} from '../src/blocks/form';
import { renderBlock, text } from './render';

const fakeSource = (html: string) => ({
  html,
  children: [],
  block: (n: string, a: Record<string, unknown>, c?: unknown[]) => ({
    id: 'x',
    type: 'prisma/' + n,
    v: 1,
    attrs: a,
    ...(c ? { children: c } : {}),
  }),
  rich: (h: string) => [{ text: h.replace(/<[^>]+>/g, '') }],
  inner: () => '',
  innerAny: (cls: string) => {
    const m = new RegExp(`<(\\w+)[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)</\\1>`).exec(
      html,
    );
    return m ? m[2]! : '';
  },
});

describe('form', () => {
  it('draws the form, its hidden data, the button and the messages', () => {
    const { html } = renderBlock(form, { submitButtonText: text('Send') }, { id: 'abc123' });
    expect(html).toContain(
      'class="wp-block-prisma-form pr-form pr-form--medium-btn pr-block-abc123"',
    );
    expect(html).toMatch(/<form class="pr-form__form"[^>]*action="\/_prisma\/form" method="post"/);
    expect(html).toContain('name="_pr_form" value="abc123"');
    expect(html).toContain('name="_pr_website"');
    expect(html).toContain('<button type="submit" class="pr-form__submit wp-block-button__link">');
    expect(html).toContain('<div class="pr-form__submit-text">Send</div>');
    expect(html).toContain('id="pr-form-abc123-sent"');
    expect(html).toContain('The form has been submitted Successfully!');
    expect(html).toContain('data-pr-form="{&quot;id&quot;:&quot;abc123&quot;');
    expect(html).not.toMatch(/uagb|spectra/i);
  });

  it('writes Spectra’s CSS: padding by device, legacy input border, button size', () => {
    const { css } = renderBlock(form, { formPaddingTopTab: 10, buttonAlignMobile: 'full' });
    const B = '.pr-block-test0001';
    expect(css).toContain(`${B}.pr-form{padding-top:25px;padding-right:25px`);
    expect(css).toMatch(
      /@media[^{]*976px[^{]*\{[^@]*\.pr-block-test0001\.pr-form\{padding-top:10px/,
    );
    // Boxed inputs: the older single values (1px solid #BDBDBD, radius 3px).
    expect(css).toContain('border-top-width:1px');
    expect(css).toContain('border-top-left-radius:3px');
    expect(css).toContain('border-color:#BDBDBD');
    expect(css).toContain('border-style:solid');
    expect(css).toContain(
      `${B}.pr-form--medium-btn .pr-form__submit-wrap .pr-form__submit{padding:12px 24px}`,
    );
    expect(css).toMatch(/767px[^{]*\{[^@]*\.pr-form__submit-wrap\{display:grid\}/);
    // Label: 15px, bottom margin 10px, shown.
    expect(css).toContain('font-size:15px');
    expect(css).toContain('margin-bottom:10px');
    expect(css).toContain(`${B} .pr-form__label{display:block;text-align:left}`);
    // Switch: 20px dot, 33px high track (plus borders).
    expect(css).toContain('height:calc(1px + 1px + 26px)');
    expect(css).toContain('transform:translateX(30px)');
  });

  it('draws underlined inputs and a gradient button', () => {
    const { css } = renderBlock(form, {
      formStyle: 'underlined',
      fieldBorderBottomWidth: 2,
      fieldBorderStyle: 'solid',
      fieldBorderColor: '#333',
      submitBgType: 'gradient',
      selectGradient: 'advanced',
      gradientAngle: 45,
    });
    expect(css).toContain('border-bottom:2px solid #333');
    expect(css).toContain('background:transparent');
    expect(css).toContain('linear-gradient(45deg, #06558a 0%, #0063A1 100%)');
    expect(css).toContain('background-clip:padding-box');
  });

  it('leaves the button to the theme when asked', () => {
    const { css } = renderBlock(form, { inheritFromTheme: true });
    expect(css).not.toContain('pr-form__submit.wp-block-button__link{');
  });

  it('imports a Spectra form with its button text and messages', () => {
    const html =
      '<div class="wp-block-uagb-forms uagb-forms__outer-wrap uagb-block-f1"><form class="uagb-forms-main-form">' +
      '<div class="uagb-forms-main-submit-button-wrap wp-block-button"><button class="uagb-forms-main-submit-button"><div class="uagb-forms-main-submit-button-text">Send it</div></button></div></form>' +
      '<div class="uagb-forms-success-message-f1 uagb-forms-submit-message-hide"><span>Thanks!</span></div>' +
      '<div class="uagb-forms-failed-message-f1 uagb-forms-submit-message-hide"><span>Oops &amp; sorry</span></div></div>';
    const [block] = form.spectra!['uagb/forms']!(
      { blockId: 'f1', labelloadGoogleFonts: true, afterSubmitToEmail: 'a@b.co' },
      fakeSource(html) as never,
    );
    expect(block!.type).toBe('prisma/form');
    expect(block!.attrs.submitButtonText).toBe('Send it');
    expect(block!.attrs.confirmationMessage).toBe('Thanks!');
    expect(block!.attrs.failedMessage).toBe('Oops & sorry');
    expect(block!.attrs.labelLoadGoogleFonts).toBe(true);
    expect(block!.attrs.afterSubmitToEmail).toBe('a@b.co');
  });
});

describe('form fields', () => {
  it('draws a required name field named by its id', () => {
    const { html } = renderBlock(
      formName,
      { name: text('Your name'), nameRequired: true },
      { id: 'n1' },
    );
    expect(html).toContain(
      'class="wp-block-prisma-form-name pr-form-name pr-form__field pr-block-n1"',
    );
    expect(html).toContain(
      '<div class="pr-form__label pr-form-name__label is-required">Your name</div>',
    );
    expect(html).toContain('placeholder="John Doe" required=""');
    expect(html).toContain('name="n1"');
    expect(html).toContain('autoComplete="name"');
  });

  it('draws an email field', () => {
    const { html } = renderBlock(formEmail, {}, { id: 'e1' });
    expect(html).toContain('type="email"');
    expect(html).toContain('placeholder="example@mail.com"');
  });

  it('draws a phone field with the country menu and the spaced pattern read as spaces', () => {
    const { html } = renderBlock(formPhone, {}, { id: 'p1' });
    expect(html).toContain(
      '<option value="GB" data-code="+44" selected="">United Kingdom (+44)</option>',
    );
    expect(html).toContain('pattern="[0-9]{3}\\s?[0-9]{3}\\s?[0-9]{4}"');
    expect(html).toContain('placeholder="123 456 7890"');
  });

  it('draws checkboxes and a toggle that always sends a value', () => {
    const { html } = renderBlock(
      formCheckbox,
      {
        options: [
          { optiontitle: 'A', optionvalue: 'a' },
          { optiontitle: 'B', optionvalue: 'b' },
        ],
      },
      { id: 'c1' },
    );
    expect(html).toContain(
      '<input type="checkbox" class="pr-form__checkbox" id="pr-checkbox-c1-1" name="c1" value="b"/>',
    );
    expect(html).toContain('<label for="pr-checkbox-c1-1">B</label>');
    const toggle = renderBlock(formToggle, { toggleStatus: true }, { id: 't1' }).html;
    expect(toggle).toContain('<input type="hidden" name="t1" value="off"/>');
    expect(toggle).toContain('checked="" value="on"');
    expect(toggle).toContain('class="pr-form__slider is-round"');
  });

  it('draws the hidden value and the acceptance box with its link', () => {
    expect(renderBlock(formHidden, { hidden_field_value: 'x' }, { id: 'h1' }).html).toContain(
      '<input type="hidden" class="pr-form-hidden__input" name="h1" value="x"/>',
    );
    const { html } = renderBlock(
      formAccept,
      { showLink: true, link: 'javascript:alert(1)', acceptRequired: true },
      { id: 'a1' },
    );
    expect(html).toContain(
      '<a href="#" target="_blank" rel="noopener noreferrer">Privacy Policy</a>',
    );
    expect(html).toContain('class="pr-form-accept__label is-required"');
  });

  it('imports Spectra fields with their labels from the saved HTML', () => {
    const name = formName.spectra!['uagb/forms-name']!(
      { blockId: 'n1', nameRequired: true },
      fakeSource(
        '<div class="uagb-forms-name-label required uagb-forms-input-label" id="n1">First <b>name</b></div>',
      ) as never,
    )[0]!;
    expect(name.type).toBe('prisma/form-name');
    expect(name.attrs.name).toBe('First <b>name</b>');
    expect(name.attrs.nameRequired).toBe(true);
    const accept = formAccept.spectra!['uagb/forms-accept']!(
      {},
      fakeSource(
        '<label class="uagb-forms-accept-label " id="a">I agree &amp; accept</label>',
      ) as never,
    )[0]!;
    expect(accept.attrs.acceptText).toBe('I agree & accept');
  });
});
