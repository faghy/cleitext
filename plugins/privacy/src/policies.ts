import {
  htmlToInline,
  labelText,
  type CxdBlock,
  type CxdDocument,
  type TrackerDeclaration,
} from '@cleitext/plugin-sdk';
import type { PrivacyConfig } from './config';

/**
 * Privacy and cookie policies (GDPR art. 13, Italian Privacy Code art. 122
 * and the Garante's 2021 cookie guidelines), written from the settings as
 * ordinary blocks: the site owner reviews and edits them in the editor.
 */

export type PolicyKind = 'privacy' | 'cookies';

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const id = () => globalThis.crypto.randomUUID();
const heading = (html: string, level = 2): CxdBlock => ({
  id: id(),
  type: 'core/heading',
  v: 1,
  attrs: { level },
  content: htmlToInline(html),
});
const paragraph = (html: string): CxdBlock => ({
  id: id(),
  type: 'core/paragraph',
  v: 1,
  attrs: {},
  content: htmlToInline(html),
});
const list = (items: string[]): CxdBlock => ({
  id: id(),
  type: 'core/list',
  v: 1,
  attrs: {},
  children: items.map((html) => ({
    id: id(),
    type: 'core/list-item',
    v: 1,
    attrs: {},
    content: htmlToInline(html),
  })),
});
const pluginBlock = (type: string): CxdBlock => ({ id: id(), type, v: 1, attrs: {} });

function controllerLines(config: PrivacyConfig, it: boolean): string[] {
  const c = config.controller;
  const missing = it ? '[da completare]' : '[to complete]';
  return [
    `<strong>${escape(c.name || missing)}</strong>`,
    c.address ? escape(c.address) : '',
    c.vat ? `${it ? 'P. IVA / C.F.' : 'VAT number'}: ${escape(c.vat)}` : '',
    `Email: ${c.email ? `<a href="mailto:${escape(c.email)}">${escape(c.email)}</a>` : missing}`,
    c.phone ? `${it ? 'Telefono' : 'Phone'}: ${escape(c.phone)}` : '',
  ].filter(Boolean);
}

export function policy(
  kind: PolicyKind,
  config: PrivacyConfig,
  locale: string,
  site: { name: string; url: string },
  links: { privacy?: string; cookies?: string },
  trackers: TrackerDeclaration[] = [],
): { title: string; slug: string; document: CxdDocument } {
  const it = locale.toLowerCase().startsWith('it');
  const today = new Date().toLocaleDateString(it ? 'it-IT' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const blocks =
    kind === 'privacy'
      ? privacyPolicy(config, it, site, links, trackers)
      : cookiePolicy(config, it, site, links);
  blocks.push(paragraph(`<em>${it ? 'Ultimo aggiornamento' : 'Last updated'}: ${today}</em>`));
  return {
    title: kind === 'privacy' ? 'Privacy policy' : 'Cookie policy',
    slug: kind === 'privacy' ? 'privacy-policy' : 'cookie-policy',
    document: { schema: 1, blocks } as CxdDocument,
  };
}

function privacyPolicy(
  config: PrivacyConfig,
  it: boolean,
  site: { name: string; url: string },
  links: { cookies?: string },
  trackers: TrackerDeclaration[],
): CxdBlock[] {
  const p = config.processing;
  const c = config.controller;
  const siteName = escape(site.name);
  const cookieLink = links.cookies
    ? `<a href="${escape(links.cookies)}">cookie policy</a>`
    : 'cookie policy';
  const blocks: CxdBlock[] = [];

  if (it) {
    blocks.push(
      paragraph(
        `Questa informativa spiega come vengono trattati i dati personali di chi visita <strong>${siteName}</strong> (${escape(site.url)}), ai sensi dell’art. 13 del Regolamento (UE) 2016/679 (GDPR).`,
      ),
      heading('Titolare del trattamento'),
      paragraph(controllerLines(config, true).join('<br>')),
    );
    if (c.dpoEmail)
      blocks.push(
        paragraph(
          `Responsabile della protezione dei dati (DPO): <a href="mailto:${escape(c.dpoEmail)}">${escape(c.dpoEmail)}</a>`,
        ),
      );
    blocks.push(heading('Quali dati trattiamo e perché'));
    blocks.push(heading('Dati di navigazione', 3));
    blocks.push(
      paragraph(
        'I sistemi che fanno funzionare il sito registrano alcuni dati tecnici, come l’indirizzo IP, il browser, le pagine visitate e l’orario. Servono a far funzionare il sito e a proteggerlo da abusi, sulla base del legittimo interesse del titolare (art. 6.1.f GDPR), e vengono conservati per il tempo strettamente necessario.',
      ),
    );
    if (p.contactForms)
      blocks.push(
        heading('Moduli di contatto', 3),
        paragraph(
          'Se ci scrivi con un modulo, usiamo nome, email, eventuale telefono e il messaggio solo per risponderti, sulla base della tua richiesta (art. 6.1.b GDPR). I messaggi sono conservati per il tempo necessario a gestirli e comunque non oltre 24 mesi.',
        ),
      );
    if (p.accounts)
      blocks.push(
        heading('Account', 3),
        paragraph(
          'Chi ha un account fornisce email e nome; la password è conservata solo in forma cifrata. I dati servono a dare accesso al servizio (art. 6.1.b GDPR) e sono conservati finché l’account esiste.',
        ),
      );
    if (p.newsletter)
      blocks.push(
        heading('Newsletter', 3),
        paragraph(
          'Con il tuo consenso (art. 6.1.a GDPR) usiamo la tua email per inviarti la newsletter, finché non ti cancelli con il link presente in ogni messaggio.',
        ),
      );
    if (p.analytics && trackers.length === 0)
      blocks.push(
        heading('Statistiche', 3),
        paragraph(
          `Solo con il tuo consenso usiamo <strong>${escape(p.analytics)}</strong> per misurare in forma aggregata come viene usato il sito (art. 6.1.a GDPR). I dettagli sono nella ${cookieLink}.`,
        ),
      );
    if (p.embeds)
      blocks.push(
        heading('Contenuti di altri siti', 3),
        paragraph(
          `Alcune pagine includono contenuti di altri siti, come video o mappe. Vengono caricati solo con il tuo consenso alla categoria “Marketing”, perché questi siti possono raccogliere dati su di te. I dettagli sono nella ${cookieLink}.`,
        ),
      );
    blocks.push(...trackerBlocks(trackers, true));
    blocks.push(
      heading('Cookie'),
      paragraph(
        `Usiamo cookie tecnici, necessari al funzionamento, e solo con il tuo consenso altri cookie. Trovi l’elenco e puoi cambiare le tue scelte nella ${cookieLink}.`,
      ),
      heading('A chi comunichiamo i dati'),
      paragraph(
        `I dati sono trattati da persone autorizzate dal titolare e da fornitori che ci aiutano a gestire il sito${p.hosting ? `, come il fornitore di hosting <strong>${escape(p.hosting)}</strong>` : ''}, nominati responsabili del trattamento (art. 28 GDPR). Non vendiamo i dati e non li diffondiamo. Se un fornitore si trova fuori dall’Unione europea, il trasferimento avviene solo con le garanzie previste dagli artt. 44–49 GDPR, come una decisione di adeguatezza o le clausole contrattuali standard.`,
      ),
      heading('I tuoi diritti'),
      paragraph('In qualsiasi momento puoi chiedere al titolare:'),
      list([
        'l’accesso ai tuoi dati e una loro copia (art. 15)',
        'la rettifica dei dati inesatti (art. 16)',
        'la cancellazione dei dati (art. 17)',
        'la limitazione del trattamento (art. 18)',
        'la portabilità dei dati in un formato leggibile (art. 20)',
        'di opporti al trattamento basato sul legittimo interesse (art. 21)',
        'di revocare il consenso dato, senza conseguenze sui trattamenti precedenti (art. 7.3)',
      ]),
      paragraph(
        `Per esercitarli scrivi a ${c.email ? `<a href="mailto:${escape(c.email)}">${escape(c.email)}</a>` : 'l’indirizzo email indicato sopra'}: rispondiamo entro un mese. Hai anche il diritto di proporre reclamo al Garante per la protezione dei dati personali (<a href="https://www.garanteprivacy.it">www.garanteprivacy.it</a>) o all’autorità del Paese in cui vivi.`,
      ),
      heading('Altre informazioni'),
      paragraph(
        'Fornire i dati è facoltativo, ma senza alcuni di essi non possiamo rispondere alle tue richieste. Non prendiamo decisioni basate unicamente su trattamenti automatizzati. Questa informativa può cambiare: la data dell’ultima modifica è indicata qui sotto.',
      ),
    );
  } else {
    blocks.push(
      paragraph(
        `This notice explains how the personal data of visitors of <strong>${siteName}</strong> (${escape(site.url)}) is processed, under Article 13 of Regulation (EU) 2016/679 (GDPR).`,
      ),
      heading('Data controller'),
      paragraph(controllerLines(config, false).join('<br>')),
    );
    if (c.dpoEmail)
      blocks.push(
        paragraph(
          `Data protection officer (DPO): <a href="mailto:${escape(c.dpoEmail)}">${escape(c.dpoEmail)}</a>`,
        ),
      );
    blocks.push(heading('What data we process and why'));
    blocks.push(heading('Browsing data', 3));
    blocks.push(
      paragraph(
        'The systems running the site record some technical data, such as the IP address, the browser, the pages visited and the time. It is used to run the site and protect it from abuse, on the basis of the controller’s legitimate interest (Art. 6(1)(f) GDPR), and kept only as long as needed.',
      ),
    );
    if (p.contactForms)
      blocks.push(
        heading('Contact forms', 3),
        paragraph(
          'If you write to us through a form, we use your name, email, phone (if given) and message only to reply to you, at your request (Art. 6(1)(b) GDPR). Messages are kept as long as needed to handle them, and no longer than 24 months.',
        ),
      );
    if (p.accounts)
      blocks.push(
        heading('Accounts', 3),
        paragraph(
          'People with an account give their email and name; the password is only stored encrypted. The data gives access to the service (Art. 6(1)(b) GDPR) and is kept while the account exists.',
        ),
      );
    if (p.newsletter)
      blocks.push(
        heading('Newsletter', 3),
        paragraph(
          'With your consent (Art. 6(1)(a) GDPR) we use your email to send you the newsletter, until you unsubscribe with the link in every message.',
        ),
      );
    if (p.analytics && trackers.length === 0)
      blocks.push(
        heading('Statistics', 3),
        paragraph(
          `Only with your consent we use <strong>${escape(p.analytics)}</strong> to measure, in aggregate, how the site is used (Art. 6(1)(a) GDPR). Details are in the ${cookieLink}.`,
        ),
      );
    if (p.embeds)
      blocks.push(
        heading('Content from other sites', 3),
        paragraph(
          `Some pages include content from other sites, such as videos or maps. It is loaded only with your consent to the “Marketing” category, since those sites may collect data about you. Details are in the ${cookieLink}.`,
        ),
      );
    blocks.push(...trackerBlocks(trackers, false));
    blocks.push(
      heading('Cookies'),
      paragraph(
        `We use technical cookies, needed for the site to work, and other cookies only with your consent. The list, and the way to change your choices, are in the ${cookieLink}.`,
      ),
      heading('Who receives the data'),
      paragraph(
        `The data is processed by people authorized by the controller and by providers helping us run the site${p.hosting ? `, such as the hosting provider <strong>${escape(p.hosting)}</strong>` : ''}, appointed as processors (Art. 28 GDPR). We do not sell or publish the data. If a provider is outside the European Union, the transfer only happens with the safeguards of Articles 44–49 GDPR, such as an adequacy decision or standard contractual clauses.`,
      ),
      heading('Your rights'),
      paragraph('At any time you can ask the controller for:'),
      list([
        'access to your data and a copy of it (Art. 15)',
        'correction of inaccurate data (Art. 16)',
        'erasure of your data (Art. 17)',
        'restriction of processing (Art. 18)',
        'your data in a portable, readable format (Art. 20)',
        'to object to processing based on legitimate interest (Art. 21)',
        'to withdraw your consent, without affecting earlier processing (Art. 7(3))',
      ]),
      paragraph(
        `Write to ${c.email ? `<a href="mailto:${escape(c.email)}">${escape(c.email)}</a>` : 'the email address above'}: we answer within one month. You also have the right to lodge a complaint with a supervisory authority, such as the one of the country where you live.`,
      ),
      heading('Other information'),
      paragraph(
        'Giving your data is optional, but without some of it we cannot answer your requests. We take no decisions based solely on automated processing. This notice may change: the date of the last change is below.',
      ),
    );
  }
  return blocks;
}

function cookiePolicy(
  config: PrivacyConfig,
  it: boolean,
  site: { name: string },
  links: { privacy?: string },
): CxdBlock[] {
  const siteName = escape(site.name);
  const privacyLink = links.privacy
    ? `<a href="${escape(links.privacy)}">privacy policy</a>`
    : 'privacy policy';
  const offered = config.banner.categories;
  if (it) {
    return [
      paragraph(
        `I cookie sono piccoli file che un sito salva nel browser per ricordare informazioni. Questa pagina spiega quali cookie e strumenti simili usa <strong>${siteName}</strong> e come puoi scegliere. Per il resto del trattamento dei dati vedi la ${privacyLink}.`,
      ),
      heading('Tipi di cookie'),
      list([
        '<strong>Necessari</strong>: servono al funzionamento del sito, per esempio per ricordare le tue scelte sui cookie. Non richiedono consenso (art. 122 del Codice privacy).',
        ...(offered.includes('preferences')
          ? [
              '<strong>Preferenze</strong>: ricordano opzioni come la lingua. Solo con il tuo consenso.',
            ]
          : []),
        ...(offered.includes('statistics')
          ? [
              '<strong>Statistiche</strong>: misurano in forma aggregata come viene usato il sito. Solo con il tuo consenso.',
            ]
          : []),
        ...(offered.includes('marketing')
          ? [
              '<strong>Marketing</strong>: mostrano pubblicità personalizzata o contenuti di altri siti, come video e mappe. Solo con il tuo consenso.',
            ]
          : []),
      ]),
      heading('Cookie usati da questo sito'),
      pluginBlock('privacy/cookie-table'),
      heading('Come scegliere'),
      paragraph(
        'Alla prima visita un banner ti chiede di accettare, rifiutare o scegliere le categorie; chiudendolo con la X continui senza accettare. La scelta vale per 6 mesi, ma puoi cambiarla quando vuoi:',
      ),
      pluginBlock('privacy/preferences'),
      paragraph(
        'Puoi anche cancellare o bloccare i cookie dalle impostazioni del browser; in questo caso alcune funzioni del sito potrebbero non funzionare.',
      ),
      heading('Cookie di terze parti'),
      paragraph(
        'I cookie dei servizi di altre aziende sono gestiti da loro secondo le rispettive informative, indicate nella tabella sopra dal nome del fornitore. Vengono attivati solo dopo il tuo consenso alla categoria corrispondente.',
      ),
    ];
  }
  return [
    paragraph(
      `Cookies are small files a site saves in the browser to remember information. This page explains which cookies and similar tools <strong>${siteName}</strong> uses and how you can choose. For the rest of the processing of your data see the ${privacyLink}.`,
    ),
    heading('Types of cookies'),
    list([
      '<strong>Necessary</strong>: needed for the site to work, for example to remember your cookie choices. They need no consent.',
      ...(offered.includes('preferences')
        ? [
            '<strong>Preferences</strong>: remember options such as the language. Only with your consent.',
          ]
        : []),
      ...(offered.includes('statistics')
        ? [
            '<strong>Statistics</strong>: measure, in aggregate, how the site is used. Only with your consent.',
          ]
        : []),
      ...(offered.includes('marketing')
        ? [
            '<strong>Marketing</strong>: show personalized ads or content from other sites, such as videos and maps. Only with your consent.',
          ]
        : []),
    ]),
    heading('Cookies used by this site'),
    pluginBlock('privacy/cookie-table'),
    heading('How to choose'),
    paragraph(
      'On your first visit a banner asks you to accept, reject or pick categories; closing it with the X continues without accepting. Your choice lasts 6 months, but you can change it at any time:',
    ),
    pluginBlock('privacy/preferences'),
    paragraph(
      'You can also delete or block cookies in your browser settings; some features of the site may then not work.',
    ),
    heading('Third-party cookies'),
    paragraph(
      'Cookies of services of other companies are managed by them under their own policies, named in the table above by provider. They are only turned on after your consent to their category.',
    ),
  ];
}

/** One section per tracking service added by a plugin (Analytics…), with its rules. */
function trackerBlocks(trackers: TrackerDeclaration[], it: boolean): CxdBlock[] {
  const category = (t: TrackerDeclaration) =>
    it
      ? { preferences: 'Preferenze', statistics: 'Statistiche', marketing: 'Marketing' }[t.category]
      : { preferences: 'Preferences', statistics: 'Statistics', marketing: 'Marketing' }[
          t.category
        ];
  return trackers.flatMap((t) => {
    const parts = [
      escape(labelText(t.purpose, it ? 'it' : 'en')),
      it
        ? `Il servizio è fornito da <strong>${escape(t.provider)}</strong>.`
        : `The service is provided by <strong>${escape(t.provider)}</strong>.`,
      t.requiresConsent
        ? it
          ? `Viene attivato solo con il tuo consenso alla categoria “${category(t)}” (art. 6.1.a GDPR), che puoi revocare in qualsiasi momento dalle preferenze cookie.`
          : `It is turned on only with your consent to the “${category(t)}” category (Art. 6(1)(a) GDPR), which you can withdraw at any time from the cookie preferences.`
        : it
          ? 'Funziona senza cookie e in forma anonima, solo per statistiche aggregate su questo sito, sulla base del legittimo interesse del titolare (art. 6.1.f GDPR).'
          : 'It works without cookies and anonymously, only for aggregate statistics about this site, on the basis of the controller’s legitimate interest (Art. 6(1)(f) GDPR).',
      t.transfersOutsideEu
        ? it
          ? 'I dati possono essere trasferiti fuori dallo Spazio economico europeo, anche negli Stati Uniti, con le garanzie previste dal GDPR (EU-U.S. Data Privacy Framework o clausole contrattuali standard).'
          : 'Data may be transferred outside the European Economic Area, including to the United States, with the safeguards of the GDPR (EU-U.S. Data Privacy Framework or standard contractual clauses).'
        : '',
      t.privacyPolicyUrl
        ? `${it ? 'Informativa del fornitore' : 'Provider’s privacy policy'}: <a href="${escape(t.privacyPolicyUrl)}">${escape(t.privacyPolicyUrl)}</a>.`
        : '',
    ].filter(Boolean);
    return [heading(escape(t.name), 3), paragraph(parts.join(' '))];
  });
}
