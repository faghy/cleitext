import { NAME } from '../config';
import { fill } from './strings';

/**
 * The program's emails, in English and Italian (by the affiliate's language;
 * the administrators get the site's): plain text, short.
 */
export type EmailKind = 'application' | 'approved' | 'referral' | 'payout';

export interface EmailValues {
  site: string;
  name: string;
  /** The affiliate area or the admin page. */
  link: string;
  code?: string;
  amount?: string;
  what?: string;
  note?: string;
  email?: string;
}

const TEXTS: Record<EmailKind, Record<'en' | 'it', { subject: string; body: string }>> = {
  application: {
    en: {
      subject: '{site}: new affiliate application from {name}',
      body: '{name} ({email}) applied to the affiliate program of {site}.\n\nReview the application: {link}',
    },
    it: {
      subject: '{site}: nuova richiesta di affiliazione da {name}',
      body: '{name} ({email}) ha chiesto di entrare nel programma di affiliazione di {site}.\n\nValuta la richiesta: {link}',
    },
  },
  approved: {
    en: {
      subject: '{site}: welcome to the affiliate program',
      body: 'Hello {name},\n\nyour application was approved: welcome to the affiliate program of {site}!\n\nYour code is {code}. Your link, your visits and your earnings are in your affiliate area: {link}',
    },
    it: {
      subject: '{site}: benvenuto nel programma di affiliazione',
      body: 'Ciao {name},\n\nla tua richiesta è stata approvata: benvenuto nel programma di affiliazione di {site}!\n\nIl tuo codice è {code}. Il tuo link, le visite e i guadagni sono nella tua area affiliato: {link}',
    },
  },
  referral: {
    en: {
      subject: '{site}: a new commission of {amount}',
      body: 'Hello {name},\n\nsomeone you brought converted ({what}): a commission of {amount}, approved once the refund window is over.\n\nYour affiliate area: {link}',
    },
    it: {
      subject: '{site}: una nuova commissione di {amount}',
      body: 'Ciao {name},\n\nuna persona che hai portato ha convertito ({what}): una commissione di {amount}, approvata alla fine del periodo per i rimborsi.\n\nLa tua area affiliato: {link}',
    },
  },
  payout: {
    en: {
      subject: '{site}: payment of {amount} made',
      body: 'Hello {name},\n\nwe paid you {amount} for your commissions.{note}\n\nThank you! Your affiliate area: {link}',
    },
    it: {
      subject: '{site}: pagamento di {amount} effettuato',
      body: 'Ciao {name},\n\nti abbiamo pagato {amount} per le tue commissioni.{note}\n\nGrazie! La tua area affiliato: {link}',
    },
  },
};

export function emailText(
  kind: EmailKind,
  locale: string,
  values: EmailValues,
): { subject: string; text: string } {
  const lang = locale.toLowerCase().startsWith('it') ? 'it' : 'en';
  const texts = TEXTS[kind][lang];
  const all: Record<string, string> = {
    ...(values as unknown as Record<string, string>),
    note: values.note ? `\n\n${values.note}` : '',
  };
  return {
    subject: fill(texts.subject, all)
      .replace(/[\r\n]+/g, ' ')
      .slice(0, 250),
    text: `${fill(texts.body, all)}\n\n— ${values.site} · ${lang === 'it' ? NAME.it : NAME.en}`,
  };
}
