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

/** The languages the policies are written in (others get English). */
type Lang = 'it' | 'es' | 'en';

const langOf = (locale: string): Lang => {
  const lang = locale.toLowerCase().slice(0, 2);
  return lang === 'it' || lang === 'es' ? lang : 'en';
};

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

function controllerLines(config: PrivacyConfig, lang: Lang): string[] {
  const c = config.controller;
  const missing = { it: '[da completare]', es: '[por completar]', en: '[to complete]' }[lang];
  const vat = { it: 'P. IVA / C.F.', es: 'NIF', en: 'VAT number' }[lang];
  const phone = { it: 'Telefono', es: 'Teléfono', en: 'Phone' }[lang];
  return [
    `<strong>${escape(c.name || missing)}</strong>`,
    c.address ? escape(c.address) : '',
    c.vat ? `${vat}: ${escape(c.vat)}` : '',
    `Email: ${c.email ? `<a href="mailto:${escape(c.email)}">${escape(c.email)}</a>` : missing}`,
    c.phone ? `${phone}: ${escape(c.phone)}` : '',
  ].filter(Boolean);
}

export function policy(
  kind: PolicyKind,
  config: PrivacyConfig,
  locale: string,
  site: { name: string; url: string },
  links: { privacy?: string; cookies?: string },
  trackers: TrackerDeclaration[] = [],
  sections: PolicySection[] = [],
): { title: string; slug: string; document: CxdDocument } {
  const lang = langOf(locale);
  const today = new Date().toLocaleDateString({ it: 'it-IT', es: 'es-ES', en: 'en-GB' }[lang], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const blocks =
    kind === 'privacy'
      ? privacyPolicy(config, lang, site, links, trackers, sections)
      : cookiePolicy(config, lang, site, links);
  const updated = { it: 'Ultimo aggiornamento', es: 'Última actualización', en: 'Last updated' }[
    lang
  ];
  blocks.push(paragraph(`<em>${updated}: ${today}</em>`));
  return {
    title: policyTitle(kind, lang),
    slug: kind === 'privacy' ? 'privacy-policy' : 'cookie-policy',
    document: { schema: 1, blocks } as CxdDocument,
  };
}

/** The title of a new policy page (Italian sites call them by their English names). */
function policyTitle(kind: PolicyKind, lang: Lang): string {
  if (lang === 'es') return kind === 'privacy' ? 'Política de privacidad' : 'Política de cookies';
  return kind === 'privacy' ? 'Privacy policy' : 'Cookie policy';
}

function privacyPolicy(
  config: PrivacyConfig,
  lang: Lang,
  site: { name: string; url: string },
  links: { cookies?: string },
  trackers: TrackerDeclaration[],
  sections: PolicySection[] = [],
): CxdBlock[] {
  const p = config.processing;
  const c = config.controller;
  const siteName = escape(site.name);
  const cookieName = lang === 'es' ? 'política de cookies' : 'cookie policy';
  const cookieLink = links.cookies
    ? `<a href="${escape(links.cookies)}">${cookieName}</a>`
    : cookieName;
  const blocks: CxdBlock[] = [];

  if (lang === 'it') {
    blocks.push(
      paragraph(
        `Questa informativa spiega come vengono trattati i dati personali di chi visita <strong>${siteName}</strong> (${escape(site.url)}), ai sensi dell’art. 13 del Regolamento (UE) 2016/679 (GDPR).`,
      ),
      heading('Titolare del trattamento'),
      paragraph(controllerLines(config, 'it').join('<br>')),
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
    blocks.push(...trackerBlocks(trackers, 'it'), ...sectionBlocks(sections));
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
  } else if (lang === 'es') {
    blocks.push(
      paragraph(
        `Esta información explica cómo se tratan los datos personales de quienes visitan <strong>${siteName}</strong> (${escape(site.url)}), según el artículo 13 del Reglamento (UE) 2016/679 (RGPD).`,
      ),
      heading('Responsable del tratamiento'),
      paragraph(controllerLines(config, 'es').join('<br>')),
    );
    if (c.dpoEmail)
      blocks.push(
        paragraph(
          `Delegado de protección de datos (DPD): <a href="mailto:${escape(c.dpoEmail)}">${escape(c.dpoEmail)}</a>`,
        ),
      );
    blocks.push(heading('Qué datos tratamos y por qué'));
    blocks.push(heading('Datos de navegación', 3));
    blocks.push(
      paragraph(
        'Los sistemas que hacen funcionar el sitio registran algunos datos técnicos, como la dirección IP, el navegador, las páginas visitadas y la hora. Sirven para que el sitio funcione y para protegerlo de abusos, sobre la base del interés legítimo del responsable (art. 6.1.f RGPD), y se conservan solo el tiempo necesario.',
      ),
    );
    if (p.contactForms)
      blocks.push(
        heading('Formularios de contacto', 3),
        paragraph(
          'Si nos escribes mediante un formulario, usamos tu nombre, tu email, tu teléfono (si lo indicas) y el mensaje solo para responderte, a petición tuya (art. 6.1.b RGPD). Los mensajes se conservan el tiempo necesario para gestionarlos y, en todo caso, no más de 24 meses.',
        ),
      );
    if (p.accounts)
      blocks.push(
        heading('Cuentas', 3),
        paragraph(
          'Quien tiene una cuenta facilita su email y su nombre; la contraseña solo se guarda cifrada. Los datos sirven para dar acceso al servicio (art. 6.1.b RGPD) y se conservan mientras exista la cuenta.',
        ),
      );
    if (p.newsletter)
      blocks.push(
        heading('Newsletter', 3),
        paragraph(
          'Con tu consentimiento (art. 6.1.a RGPD) usamos tu email para enviarte la newsletter, hasta que te des de baja con el enlace que aparece en cada mensaje.',
        ),
      );
    if (p.analytics && trackers.length === 0)
      blocks.push(
        heading('Estadísticas', 3),
        paragraph(
          `Solo con tu consentimiento usamos <strong>${escape(p.analytics)}</strong> para medir de forma agregada cómo se usa el sitio (art. 6.1.a RGPD). Los detalles están en la ${cookieLink}.`,
        ),
      );
    if (p.embeds)
      blocks.push(
        heading('Contenidos de otros sitios', 3),
        paragraph(
          `Algunas páginas incluyen contenidos de otros sitios, como vídeos o mapas. Solo se cargan con tu consentimiento a la categoría “Marketing”, porque esos sitios pueden recoger datos sobre ti. Los detalles están en la ${cookieLink}.`,
        ),
      );
    blocks.push(...trackerBlocks(trackers, 'es'), ...sectionBlocks(sections));
    blocks.push(
      heading('Cookies'),
      paragraph(
        `Usamos cookies técnicas, necesarias para el funcionamiento, y otras cookies solo con tu consentimiento. La lista, y la forma de cambiar tus elecciones, están en la ${cookieLink}.`,
      ),
      heading('A quién comunicamos los datos'),
      paragraph(
        `Los datos los tratan personas autorizadas por el responsable y proveedores que nos ayudan a gestionar el sitio${p.hosting ? `, como el proveedor de alojamiento <strong>${escape(p.hosting)}</strong>` : ''}, designados encargados del tratamiento (art. 28 RGPD). No vendemos ni difundimos los datos. Si un proveedor está fuera de la Unión Europea, la transferencia solo se realiza con las garantías de los artículos 44–49 RGPD, como una decisión de adecuación o las cláusulas contractuales tipo.`,
      ),
      heading('Tus derechos'),
      paragraph('En cualquier momento puedes pedir al responsable:'),
      list([
        'el acceso a tus datos y una copia de ellos (art. 15)',
        'la rectificación de los datos inexactos (art. 16)',
        'la supresión de los datos (art. 17)',
        'la limitación del tratamiento (art. 18)',
        'la portabilidad de los datos en un formato legible (art. 20)',
        'oponerte al tratamiento basado en el interés legítimo (art. 21)',
        'retirar el consentimiento dado, sin que afecte a los tratamientos anteriores (art. 7.3)',
      ]),
      paragraph(
        `Para ejercerlos escribe a ${c.email ? `<a href="mailto:${escape(c.email)}">${escape(c.email)}</a>` : 'la dirección de email indicada arriba'}: respondemos en el plazo de un mes. También tienes derecho a presentar una reclamación ante la Agencia Española de Protección de Datos (<a href="https://www.aepd.es">www.aepd.es</a>) o ante la autoridad del país en el que vives.`,
      ),
      heading('Otra información'),
      paragraph(
        'Facilitar los datos es voluntario, pero sin algunos de ellos no podemos responder a tus peticiones. No tomamos decisiones basadas únicamente en tratamientos automatizados. Esta información puede cambiar: la fecha de la última modificación figura más abajo.',
      ),
    );
  } else {
    blocks.push(
      paragraph(
        `This notice explains how the personal data of visitors of <strong>${siteName}</strong> (${escape(site.url)}) is processed, under Article 13 of Regulation (EU) 2016/679 (GDPR).`,
      ),
      heading('Data controller'),
      paragraph(controllerLines(config, 'en').join('<br>')),
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
    blocks.push(...trackerBlocks(trackers, 'en'), ...sectionBlocks(sections));
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

/** An external consent manager (Cookiebot, iubenda…) shows its own banner. */
function activeCmpInPolicy(config: PrivacyConfig): boolean {
  return Boolean(config.cmp?.provider) && config.cmp.provider !== 'none';
}

function cookiePolicy(
  config: PrivacyConfig,
  lang: Lang,
  site: { name: string },
  links: { privacy?: string },
): CxdBlock[] {
  const siteName = escape(site.name);
  const privacyName = lang === 'es' ? 'política de privacidad' : 'privacy policy';
  const privacyLink = links.privacy
    ? `<a href="${escape(links.privacy)}">${privacyName}</a>`
    : privacyName;
  const offered = config.banner.categories;
  // Only technical cookies: no banner, no consent to ask, no choice to change.
  const technicalOnly =
    !config.banner.enabled || (offered.length === 0 && !activeCmpInPolicy(config));
  if (technicalOnly && lang === 'es') {
    return [
      paragraph(
        `Las cookies son pequeños archivos que un sitio guarda en el navegador para recordar información. <strong>${siteName}</strong> solo usa cookies técnicas, necesarias para que el sitio funcione: no requieren consentimiento, por eso no aparece ningún banner. Para el resto del tratamiento de tus datos consulta la ${privacyLink}.`,
      ),
      heading('Cookies que usa este sitio'),
      pluginBlock('privacy/cookie-table'),
      paragraph(
        'Puedes borrar o bloquear las cookies desde la configuración del navegador; en ese caso algunas funciones del sitio podrían no funcionar.',
      ),
    ];
  }
  if (technicalOnly) {
    return lang === 'it'
      ? [
          paragraph(
            `I cookie sono piccoli file che un sito salva nel browser per ricordare informazioni. <strong>${siteName}</strong> usa solo cookie tecnici, necessari al funzionamento del sito: non richiedono consenso (art. 122 del Codice privacy), quindi non compare nessun banner. Per il resto del trattamento dei dati vedi la ${privacyLink}.`,
          ),
          heading('Cookie usati da questo sito'),
          pluginBlock('privacy/cookie-table'),
          paragraph(
            'Puoi cancellare o bloccare i cookie dalle impostazioni del browser; in questo caso alcune funzioni del sito potrebbero non funzionare.',
          ),
        ]
      : [
          paragraph(
            `Cookies are small files a site saves in the browser to remember information. <strong>${siteName}</strong> only uses technical cookies, needed for the site to work: they need no consent, so no banner is shown. For the rest of the processing of your data see the ${privacyLink}.`,
          ),
          heading('Cookies used by this site'),
          pluginBlock('privacy/cookie-table'),
          paragraph(
            'You can delete or block cookies in your browser settings; some features of the site may then not work.',
          ),
        ];
  }
  if (lang === 'es') {
    return [
      paragraph(
        `Las cookies son pequeños archivos que un sitio guarda en el navegador para recordar información. Esta página explica qué cookies y herramientas similares usa <strong>${siteName}</strong> y cómo puedes elegir. Para el resto del tratamiento de tus datos consulta la ${privacyLink}.`,
      ),
      heading('Tipos de cookies'),
      list([
        '<strong>Necesarias</strong>: son necesarias para que el sitio funcione, por ejemplo para recordar tus elecciones sobre las cookies. No requieren consentimiento.',
        ...(offered.includes('preferences')
          ? [
              '<strong>Preferencias</strong>: recuerdan opciones como el idioma. Solo con tu consentimiento.',
            ]
          : []),
        ...(offered.includes('statistics')
          ? [
              '<strong>Estadísticas</strong>: miden de forma agregada cómo se usa el sitio. Solo con tu consentimiento.',
            ]
          : []),
        ...(offered.includes('marketing')
          ? [
              '<strong>Marketing</strong>: muestran publicidad personalizada o contenidos de otros sitios, como vídeos y mapas. Solo con tu consentimiento.',
            ]
          : []),
      ]),
      heading('Cookies que usa este sitio'),
      pluginBlock('privacy/cookie-table'),
      heading('Cómo elegir'),
      paragraph(
        'En tu primera visita un banner te pide aceptar, rechazar o elegir las categorías; si lo cierras con la X continúas sin aceptar. Tu elección vale 6 meses, pero puedes cambiarla cuando quieras:',
      ),
      pluginBlock('privacy/preferences'),
      paragraph(
        'También puedes borrar o bloquear las cookies desde la configuración del navegador; en ese caso algunas funciones del sitio podrían no funcionar.',
      ),
      heading('Cookies de terceros'),
      paragraph(
        'Las cookies de los servicios de otras empresas las gestionan ellas según sus propias políticas, indicadas en la tabla de arriba con el nombre del proveedor. Solo se activan después de tu consentimiento a la categoría correspondiente.',
      ),
    ];
  }
  if (lang === 'it') {
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

/**
 * What another plugin does with personal data, for the privacy policy (e.g.
 * Agenda's appointments): plain text, given in the policy's language.
 */
export interface PolicySection {
  title: string;
  text: string;
}

function sectionBlocks(sections: PolicySection[]): CxdBlock[] {
  return sections.flatMap((s) => [heading(escape(s.title), 3), paragraph(escape(s.text))]);
}

/** One section per tracking service added by a plugin (Analytics…), with its rules. */
function trackerBlocks(trackers: TrackerDeclaration[], lang: Lang): CxdBlock[] {
  if (lang === 'es') return trackerBlocksEs(trackers);
  const it = lang === 'it';
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

/** The tracker sections, in Spanish. */
function trackerBlocksEs(trackers: TrackerDeclaration[]): CxdBlock[] {
  const category = (t: TrackerDeclaration) =>
    ({ preferences: 'Preferencias', statistics: 'Estadísticas', marketing: 'Marketing' })[
      t.category
    ];
  return trackers.flatMap((t) => {
    const parts = [
      escape(labelText(t.purpose, 'es')),
      `El servicio lo presta <strong>${escape(t.provider)}</strong>.`,
      t.requiresConsent
        ? `Solo se activa con tu consentimiento a la categoría “${category(t)}” (art. 6.1.a RGPD), que puedes retirar en cualquier momento desde las preferencias de cookies.`
        : 'Funciona sin cookies y de forma anónima, solo para estadísticas agregadas de este sitio, sobre la base del interés legítimo del responsable (art. 6.1.f RGPD).',
      t.transfersOutsideEu
        ? 'Los datos pueden transferirse fuera del Espacio Económico Europeo, también a Estados Unidos, con las garantías del RGPD (EU-U.S. Data Privacy Framework o cláusulas contractuales tipo).'
        : '',
      t.privacyPolicyUrl
        ? `Política de privacidad del proveedor: <a href="${escape(t.privacyPolicyUrl)}">${escape(t.privacyPolicyUrl)}</a>.`
        : '',
    ].filter(Boolean);
    return [heading(escape(t.name), 3), paragraph(parts.join(' '))];
  });
}

/**
 * A policy page kept by iubenda: its policy, in the page's language, with
 * the cookie preferences button under the cookie policy.
 */
export function cmpPolicy(
  kind: PolicyKind,
  locale: string,
): { title: string; slug: string; document: CxdDocument } {
  const lang = langOf(locale);
  const blocks: CxdBlock[] = [{ id: id(), type: 'privacy/cmp-policy', v: 1, attrs: { kind } }];
  if (kind === 'cookies') {
    blocks.push(
      heading({ it: 'Come scegliere', es: 'Cómo elegir', en: 'How to choose' }[lang]),
      paragraph(
        {
          it: 'Puoi cambiare la tua scelta sui cookie in qualsiasi momento:',
          es: 'Puedes cambiar tu elección sobre las cookies en cualquier momento:',
          en: 'You can change your cookie choice at any time:',
        }[lang],
      ),
      pluginBlock('privacy/preferences'),
    );
  }
  return {
    title: policyTitle(kind, lang),
    slug: kind === 'privacy' ? 'privacy-policy' : 'cookie-policy',
    document: { schema: 1, blocks } as CxdDocument,
  };
}
