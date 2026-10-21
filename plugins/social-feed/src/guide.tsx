/**
 * The step-by-step guide to the Meta app, in English and Italian, on the
 * settings page. Kept apart from the translations: whole paragraphs read
 * better written in each language than looked up sentence by sentence.
 */
import type { ReactNode } from 'react';

interface Section {
  title: string;
  steps: ReactNode[];
}

function sections(it: boolean, uri: ReactNode): Section[] {
  const code = (text: string) => <code className="rounded bg-slate-100 px-1">{text}</code>;
  if (it)
    return [
      {
        title: 'Instagram (consigliato: Instagram Login)',
        steps: [
          <>
            L’account Instagram deve essere <strong>professionale</strong> (Azienda o Creator): in
            Instagram, Impostazioni → Tipo di account e strumenti.
          </>,
          <>
            Su <strong>developers.facebook.com</strong> → Le mie app → Crea app. Scegli il caso
            d’uso <em>Gestisci messaggi e contenuti su Instagram</em> (API Instagram) e il tipo{' '}
            <em>Business</em>.
          </>,
          <>
            Nell’app: Instagram → <em>Configurazione API con login aziendale di Instagram</em> →{' '}
            <em>Configura il login aziendale di Instagram</em> → Impostazioni: in{' '}
            <em>URI di reindirizzamento OAuth</em> incolla {uri} e salva.
          </>,
          <>
            Nella stessa pagina copia <strong>ID app Instagram</strong> e{' '}
            <strong>chiave segreta app Instagram</strong> nei campi qui accanto, poi Salva.
          </>,
          <>
            Il permesso usato è solo {code('instagram_business_basic')}. Finché l’app è in modalità
            sviluppo, collega un account che abbia un ruolo nell’app (aggiungilo in Ruoli app →
            Tester di Instagram e accetta l’invito in Instagram → Impostazioni → Autorizzazioni sito
            web → App e siti web).
          </>,
          <>
            Premi <strong>Collega con Instagram</strong>, accedi e consenti. Il token dura 60 giorni
            e il plugin lo rinnova da solo prima che scada.
          </>,
        ],
      },
      {
        title: 'Facebook (Pagina) e Instagram tramite la Pagina',
        steps: [
          <>
            Crea un’app <em>Business</em> (o usa la stessa) e aggiungi il prodotto{' '}
            <strong>Facebook Login for Business</strong>.
          </>,
          <>
            Facebook Login for Business → Impostazioni: attiva <em>Login OAuth client</em> e{' '}
            <em>Login OAuth web</em>, incolla {uri} in <em>URI di reindirizzamento OAuth validi</em>{' '}
            e salva.
          </>,
          <>
            Impostazioni app → Di base: aggiungi il dominio del sito in <em>Domini app</em>, l’URL
            della privacy policy, e copia <strong>ID app</strong> e <strong>chiave segreta</strong>{' '}
            nei campi di Facebook.
          </>,
          <>
            Permessi richiesti: {code('pages_show_list')}, {code('pages_read_engagement')},{' '}
            {code('pages_read_user_content')}; con Instagram tramite la Pagina anche{' '}
            {code('instagram_basic')}. Per le tue Pagine basta l’accesso standard: la revisione
            dell’app serve solo per Pagine di altri.
          </>,
          <>
            Premi <strong>Collega con Facebook</strong>, scegli la Pagina e consenti. I token delle
            Pagine non scadono, ma Meta chiede di accedere di nuovo ogni 90 giorni circa: il plugin
            lo segnala qui.
          </>,
        ],
      },
      {
        title: 'Senza accesso: incolla un token',
        steps: [
          <>
            Instagram: nell’app, Instagram → Configurazione API → <em>Genera token di accesso</em> →
            aggiungi l’account e copia il token. Il plugin lo rinnova come gli altri.
          </>,
          <>
            Facebook: in Graph API Explorer scegli l’app, ottieni un token utente con i permessi
            sopra (meglio se esteso con il Debugger dei token) o il token della Pagina. Con un token
            utente il plugin ti fa scegliere la Pagina.
          </>,
        ],
      },
    ];
  return [
    {
      title: 'Instagram (recommended: Instagram Login)',
      steps: [
        <>
          The Instagram account must be a <strong>professional</strong> one (Business or Creator):
          in Instagram, Settings → Account type and tools.
        </>,
        <>
          On <strong>developers.facebook.com</strong> → My Apps → Create app. Choose the use case{' '}
          <em>Manage messaging & content on Instagram</em> (Instagram API) and the type{' '}
          <em>Business</em>.
        </>,
        <>
          In the app: Instagram → <em>API setup with Instagram business login</em> →{' '}
          <em>Set up Instagram business login</em> → Business login settings: paste {uri} in{' '}
          <em>OAuth redirect URIs</em> and save.
        </>,
        <>
          On the same page copy the <strong>Instagram app ID</strong> and the{' '}
          <strong>Instagram app secret</strong> into the fields beside, then Save.
        </>,
        <>
          The only permission used is {code('instagram_business_basic')}. While the app is in
          development mode, connect an account with a role in the app (add it in App roles →
          Instagram testers, and accept the invitation in Instagram → Settings → Website permissions
          → Apps and websites).
        </>,
        <>
          Click <strong>Connect with Instagram</strong>, sign in and allow. The token lasts 60 days
          and the plugin renews it by itself before it expires.
        </>,
      ],
    },
    {
      title: 'Facebook (Page) and Instagram through the Page',
      steps: [
        <>
          Create a <em>Business</em> app (or use the same one) and add the{' '}
          <strong>Facebook Login for Business</strong> product.
        </>,
        <>
          Facebook Login for Business → Settings: turn on <em>Client OAuth login</em> and{' '}
          <em>Web OAuth login</em>, paste {uri} in <em>Valid OAuth redirect URIs</em> and save.
        </>,
        <>
          App settings → Basic: add the site’s domain to <em>App domains</em> and a privacy policy
          URL, and copy the <strong>App ID</strong> and the <strong>App secret</strong> into the
          Facebook fields.
        </>,
        <>
          Permissions asked: {code('pages_show_list')}, {code('pages_read_engagement')},{' '}
          {code('pages_read_user_content')}; with Instagram through the Page also{' '}
          {code('instagram_basic')}. Standard access is enough for your own Pages: App Review is
          needed only for other people’s Pages.
        </>,
        <>
          Click <strong>Connect with Facebook</strong>, choose the Page and allow. Page tokens do
          not expire, but Meta asks to sign in again about every 90 days: the plugin tells you here.
        </>,
      ],
    },
    {
      title: 'Without the sign-in: paste a token',
      steps: [
        <>
          Instagram: in the app, Instagram → API setup → <em>Generate access tokens</em> → add the
          account and copy the token. The plugin renews it like the others.
        </>,
        <>
          Facebook: in the Graph API Explorer choose the app and get a user token with the
          permissions above (better extended with the Access Token Debugger) or the Page’s token.
          With a user token the plugin lets you choose the Page.
        </>,
      ],
    },
  ];
}

export function GuideSteps({ language, redirectUri }: { language: string; redirectUri: string }) {
  const uri = <code className="break-all rounded bg-slate-100 px-1">{redirectUri}</code>;
  return (
    <div className="space-y-2 text-sm">
      {sections(language.startsWith('it'), uri).map((section, index) => (
        <details key={section.title} open={index === 0} className="rounded border border-slate-200">
          <summary className="cursor-pointer px-3 py-2 font-medium">{section.title}</summary>
          <ol className="list-decimal space-y-2 px-3 pb-3 pl-8">
            {section.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </details>
      ))}
    </div>
  );
}
