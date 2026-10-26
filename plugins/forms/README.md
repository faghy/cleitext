# Forms

The official Cleitext plugin for contact forms. It comes with Cleitext: activate it in **Plugins**.

## What it does

The **Contact form** block works without JavaScript. Every message is kept in **Messages** in the admin and, when you set an address in **Settings → Forms**, sent to you by email, with Reply-To set to the visitor's address so you can simply answer.

Out of the box the form asks for name, email and message (and the phone, if you want). From version 1.3.0 you can build your own form instead, as you would with Contact Form 7:

- **Fields of your own**, in the order you want: text, email, phone, web address (1.5.0), number, date, long text, drop-down menu, checkboxes, radio buttons and **consent** (a required checkbox, e.g. "I accept the [privacy policy](/privacy-policy)").
- Each field has a **label**, a **placeholder**, a **required** switch and a **width on desktop**: full, 1/2, 1/3, 1/4 or 1/6. On tablets fields take half or a third of the row; on phones they are one below the other. An extra CSS class is there for your theme.
- Numbers and dates can have a **minimum and maximum** (dates as `2027-07-10`).
- A **default value** (1.5.0): the text a field starts with, or the option(s) chosen at first in menus, checkboxes and radio buttons (one per line). Contact Form 7's forms imported by the WordPress Importer (1.28.0) become these fields.
- Options of menus, checkboxes and radio buttons go one per line, as `value|label` or just the text.
- The **consent and the button on one row**, if you like.
- The **email subject** is yours: `{form}` is the form name and `{field-name}` the value of a field, e.g. `Booking from {your-name}`. Left empty, it stays `[form name] name`.
- **Reply-To** is the visitor's email field: the first one, or the one you name.
- The email lists every field with its label, in the form's order, and **Messages** shows them the same way.

The server checks every message again, whatever the browser did: required fields, email addresses, numbers and dates within their limits, options that exist, lengths. Fields the form does not have are ignored. Spam is kept out by a hidden field, by a limit of five messages every ten minutes per visitor and, with the **Captcha** plugin, by Turnstile or reCAPTCHA. With the **Antispam** plugin, messages it takes for spam are kept in its spam queue instead of being sent; **Not spam** there stores and emails them as if they had just arrived.

With the **NewLetter** plugin active and connected to an email-marketing service, the form can offer an unchecked **Subscribe me to the newsletter** box (opt-in only, Forms 1.6.0): the visitor is subscribed only when they tick it and the message is delivered (not when it is held as spam, until it is released).

The messages are part of the site's privacy tools: **Privacy → Requests** exports and erases them by email address.

## How to use it

1. Activate **Forms** in **Plugins** and set the address that receives the messages in **Settings → Forms**.
2. Add the **Contact form** block to a page.
3. To make your own form, open **Fields** in the block and click **Add** for each field. Use the arrows to change their order.

An example, a hotel's booking request:

| Label / placeholder                            | Name        | Type      | Width | Required |
| ---------------------------------------------- | ----------- | --------- | ----- | -------- |
| Name                                           | `your-name` | Text      | 1/6   | yes      |
| Email                                          | `email`     | Email     | 1/6   | yes      |
| Phone                                          | `phone`     | Phone     | 1/6   |          |
| Guests                                         | `guests`    | Number    | 1/6   |          |
| Arrival                                        | `arrival`   | Date      | 1/6   | yes      |
| Departure                                      | `departure` | Date      | 1/6   | yes      |
| Special requests                               | `requests`  | Long text | full  | yes      |
| I accept the [privacy policy](/privacy-policy) | `privacy`   | Consent   |       |          |

With **Consent and button on one row** on, the button "Send the request" and the subject `Hotel website`, the six fields sit on one row on a computer, the requests below, then the consent beside the button.

## For developers

- Block `forms/contact`. Attributes: `formName`, `buttonLabel`, `askPhone`, `successMessage`, `privacyUrl`, and from 1.3.0 `fields` (a list of `{ name, type, label, placeholder, required, width, options, min, max, className }`, and `value` from 1.5.0; type `url` from 1.5.0), `subject`, `replyTo`, `submitInline`. Without `fields` the block renders the classic form exactly as before.
- The fields reach the server signed (HMAC-SHA256 with a key of the site kept in the plugin's secrets) in the hidden `_spec` field, so a request cannot change what is checked or the subject. The recipient comes only from the settings.
- Messages are in the `plg_forms.submissions` table; `data` (jsonb, 1.3.0) holds every field of a custom form as `{ name, label, type, value }`, in order. `GET /api/v1/ext/forms/submissions` returns it as `fields`.
- The grid: the form has the class `cf-grid` (twelve columns from 1024px), each field `cf-field cf-<type> cf-w-<width>` (e.g. `cf-w-1-6`), and the consent and button row `cf-submit-row`.
- Plugin API 1.43: list attributes in the block editor.
