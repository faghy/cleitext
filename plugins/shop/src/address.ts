/**
 * Addresses of customers: countries (names from the runtime, in the page's
 * language), Italian provinces, and the Italian invoice details (codice
 * fiscale, partita IVA, codice destinatario or PEC). Pure.
 */

/** Countries a shop can sell to (ISO 3166-1 alpha-2), Europe first. */
export const COUNTRIES = [
  'IT',
  'AT',
  'BE',
  'BG',
  'CH',
  'CY',
  'CZ',
  'DE',
  'DK',
  'EE',
  'ES',
  'FI',
  'FR',
  'GB',
  'GR',
  'HR',
  'HU',
  'IE',
  'IS',
  'LI',
  'LT',
  'LU',
  'LV',
  'MC',
  'MT',
  'NL',
  'NO',
  'PL',
  'PT',
  'RO',
  'SE',
  'SI',
  'SK',
  'SM',
  'VA',
  'AL',
  'BA',
  'ME',
  'MK',
  'RS',
  'UA',
  'TR',
  'US',
  'CA',
  'MX',
  'BR',
  'AR',
  'CL',
  'AU',
  'NZ',
  'JP',
  'KR',
  'CN',
  'HK',
  'SG',
  'IN',
  'IL',
  'AE',
  'SA',
  'ZA',
  'EG',
  'MA',
  'TN',
] as const;

export function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Italian provinces: code → name (the 107 of ISTAT, plus Sud Sardegna's successors). */
export const IT_PROVINCES: Record<string, string> = {
  AG: 'Agrigento',
  AL: 'Alessandria',
  AN: 'Ancona',
  AO: 'Aosta',
  AP: 'Ascoli Piceno',
  AQ: "L'Aquila",
  AR: 'Arezzo',
  AT: 'Asti',
  AV: 'Avellino',
  BA: 'Bari',
  BG: 'Bergamo',
  BI: 'Biella',
  BL: 'Belluno',
  BN: 'Benevento',
  BO: 'Bologna',
  BR: 'Brindisi',
  BS: 'Brescia',
  BT: 'Barletta-Andria-Trani',
  BZ: 'Bolzano',
  CA: 'Cagliari',
  CB: 'Campobasso',
  CE: 'Caserta',
  CH: 'Chieti',
  CL: 'Caltanissetta',
  CN: 'Cuneo',
  CO: 'Como',
  CR: 'Cremona',
  CS: 'Cosenza',
  CT: 'Catania',
  CZ: 'Catanzaro',
  EN: 'Enna',
  FC: 'Forlì-Cesena',
  FE: 'Ferrara',
  FG: 'Foggia',
  FI: 'Firenze',
  FM: 'Fermo',
  FR: 'Frosinone',
  GE: 'Genova',
  GO: 'Gorizia',
  GR: 'Grosseto',
  IM: 'Imperia',
  IS: 'Isernia',
  KR: 'Crotone',
  LC: 'Lecco',
  LE: 'Lecce',
  LI: 'Livorno',
  LO: 'Lodi',
  LT: 'Latina',
  LU: 'Lucca',
  MB: 'Monza e Brianza',
  MC: 'Macerata',
  ME: 'Messina',
  MI: 'Milano',
  MN: 'Mantova',
  MO: 'Modena',
  MS: 'Massa-Carrara',
  MT: 'Matera',
  NA: 'Napoli',
  NO: 'Novara',
  NU: 'Nuoro',
  OR: 'Oristano',
  PA: 'Palermo',
  PC: 'Piacenza',
  PD: 'Padova',
  PE: 'Pescara',
  PG: 'Perugia',
  PI: 'Pisa',
  PN: 'Pordenone',
  PO: 'Prato',
  PR: 'Parma',
  PT: 'Pistoia',
  PU: 'Pesaro e Urbino',
  PV: 'Pavia',
  PZ: 'Potenza',
  RA: 'Ravenna',
  RC: 'Reggio Calabria',
  RE: 'Reggio Emilia',
  RG: 'Ragusa',
  RI: 'Rieti',
  RM: 'Roma',
  RN: 'Rimini',
  RO: 'Rovigo',
  SA: 'Salerno',
  SI: 'Siena',
  SO: 'Sondrio',
  SP: 'La Spezia',
  SR: 'Siracusa',
  SS: 'Sassari',
  SU: 'Sud Sardegna',
  SV: 'Savona',
  TA: 'Taranto',
  TE: 'Teramo',
  TN: 'Trento',
  TO: 'Torino',
  TP: 'Trapani',
  TR: 'Terni',
  TS: 'Trieste',
  TV: 'Treviso',
  UD: 'Udine',
  VA: 'Varese',
  VB: 'Verbano-Cusio-Ossola',
  VC: 'Vercelli',
  VE: 'Venezia',
  VI: 'Vicenza',
  VR: 'Verona',
  VT: 'Viterbo',
  VV: 'Vibo Valentia',
};

/** "Milano", "mi" or "MI" → "MI"; undefined when it is not a province. */
export function italianProvince(value: string): string | undefined {
  const text = value.trim();
  const code = text.toUpperCase();
  if (IT_PROVINCES[code]) return code;
  const lower = text.toLowerCase();
  return Object.entries(IT_PROVINCES).find(([, name]) => name.toLowerCase() === lower)?.[0];
}

export interface Address {
  firstName: string;
  lastName: string;
  company: string;
  address1: string;
  address2: string;
  city: string;
  postcode: string;
  province: string;
  country: string;
  phone: string;
}

export interface Invoice {
  /** Codice fiscale. */
  taxCode: string;
  /** Partita IVA. */
  vatNumber: string;
  /** Codice destinatario (SDI), 7 characters, or a PEC address. */
  sdi: string;
  pec: string;
}

/** Codice fiscale: 16 characters of a person, or 11 digits of a company. */
export function isItalianTaxCode(value: string): boolean {
  const code = value.trim().toUpperCase();
  return (
    /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(code) ||
    isItalianVat(code)
  );
}

/** Partita IVA: 11 digits with Luhn's check digit (the Italian algorithm). */
export function isItalianVat(value: string): boolean {
  const digits = value.trim().replace(/^IT/i, '');
  if (!/^\d{11}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    let n = Number(digits[i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

/** Postcodes by country where the shape is known; others are free text. */
const POSTCODES: Record<string, RegExp> = {
  IT: /^\d{5}$/,
  SM: /^4789\d$/,
  VA: /^00120$/,
  DE: /^\d{5}$/,
  FR: /^\d{5}$/,
  ES: /^\d{5}$/,
  AT: /^\d{4}$/,
  CH: /^\d{4}$/,
  NL: /^\d{4} ?[A-Z]{2}$/i,
  US: /^\d{5}(-\d{4})?$/,
};

export type AddressErrors = Partial<Record<keyof Address | keyof Invoice | 'email', string>>;

/** What is missing or wrong in an address (messages in English, translated by the page). */
export function checkAddress(address: Address, options: { phoneRequired: boolean }): AddressErrors {
  const errors: AddressErrors = {};
  const required: (keyof Address)[] = [
    'firstName',
    'lastName',
    'address1',
    'city',
    'postcode',
    'country',
  ];
  if (options.phoneRequired) required.push('phone');
  for (const field of required) if (!address[field].trim()) errors[field] = 'Required';
  if (address.country && !(COUNTRIES as readonly string[]).includes(address.country))
    errors.country = 'Not a country we ship to';
  const shape = POSTCODES[address.country];
  if (address.postcode.trim() && shape && !shape.test(address.postcode.trim()))
    errors.postcode = 'Not a valid postcode';
  if (address.country === 'IT') {
    if (!address.province.trim()) errors.province = 'Required';
    else if (!italianProvince(address.province)) errors.province = 'Not an Italian province';
  }
  if (address.phone.trim() && !/^[+()\d\s./-]{6,25}$/.test(address.phone.trim()))
    errors.phone = 'Not a valid phone number';
  return errors;
}

export function checkInvoice(invoice: Invoice): AddressErrors {
  const errors: AddressErrors = {};
  if (invoice.taxCode.trim() && !isItalianTaxCode(invoice.taxCode))
    errors.taxCode = 'Not a valid codice fiscale';
  if (invoice.vatNumber.trim() && !isItalianVat(invoice.vatNumber))
    errors.vatNumber = 'Not a valid partita IVA';
  if (invoice.sdi.trim() && !/^[A-Z0-9]{7}$/i.test(invoice.sdi.trim()))
    errors.sdi = 'Seven letters or digits';
  if (invoice.pec.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invoice.pec.trim()))
    errors.pec = 'Not a valid address';
  return errors;
}

/** The address cleaned up: trimmed, province as its code, postcode upper case. */
export function normalizeAddress(address: Address): Address {
  const clean = Object.fromEntries(
    Object.entries(address).map(([k, v]) => [k, v.trim()]),
  ) as unknown as Address;
  if (clean.country === 'IT') clean.province = italianProvince(clean.province) ?? clean.province;
  clean.postcode = clean.postcode.toUpperCase();
  return clean;
}

/** Lines of an address as printed on a label. */
export function addressLines(address: Address, locale: string): string[] {
  const name = `${address.firstName} ${address.lastName}`.trim();
  const place =
    address.country === 'IT'
      ? `${address.postcode} ${address.city}${address.province ? ` (${address.province})` : ''}`
      : `${address.city}${address.province ? `, ${address.province}` : ''} ${address.postcode}`;
  return [
    name,
    address.company,
    address.address1,
    address.address2,
    place.trim(),
    countryName(address.country, locale),
  ].filter(Boolean);
}
