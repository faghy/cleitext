/** Settings of the SEO page, shared by the server and the admin. */

export interface SeoConfig {
  /** Content types kept out of search results: noindex, and no sitemap. */
  hiddenTypes: string[];
  /** Taxonomies whose archives are kept out of search results. */
  hiddenTaxonomies: string[];
  /** Images of the pages in the XML sitemaps. */
  sitemapImages: boolean;
  /** Title templates by content type, e.g. `%%title%% %%sep%% %%sitename%%`. */
  titles: Record<string, string>;
  /** Who the site represents, for Google's knowledge panel (schema.org). */
  representation: {
    kind: 'organization' | 'person';
    name: string;
    /** Absolute address of the logo (organization) or photo (person). */
    logo: string;
    /** Social profiles and other pages about it. */
    sameAs: string[];
    /**
     * An organization that is a local business (since 2.5.0): `LocalBusiness`
     * or one of its schema.org subtypes (BUSINESS_TYPES); empty for a plain
     * Organization.
     */
    businessType: string;
    business: LocalBusinessData;
  };
}

/** What a local business adds to the Organization (all optional). */
export interface LocalBusinessData {
  telephone: string;
  address: {
    streetAddress: string;
    postalCode: string;
    addressLocality: string;
    addressRegion: string;
    /** Two-letter country code, e.g. IT. */
    addressCountry: string;
  };
  /** Towns served, e.g. ["Savona", "Albisola Superiore"]. */
  areaServed: string[];
  /** schema.org's form, one per line: "Mo-Fr 08:30-18:30", "Sa 09:00-12:30". */
  openingHours: string[];
  /** E.g. "€€" or "€30-€90". */
  priceRange: string;
  vatID: string;
}

export const EMPTY_BUSINESS: LocalBusinessData = {
  telephone: '',
  address: {
    streetAddress: '',
    postalCode: '',
    addressLocality: '',
    addressRegion: '',
    addressCountry: '',
  },
  areaServed: [],
  openingHours: [],
  priceRange: '',
  vatID: '',
};

/**
 * LocalBusiness and the subtypes schema.org defines (schema.org/LocalBusiness,
 * "More specific Types"), grouped as there, with an Italian label. Only real
 * types: e.g. there is no "ApplianceRepair" (repairs at home are
 * HomeAndConstructionBusiness).
 */
export const BUSINESS_TYPES: { type: string; en: string; it: string; group?: string }[] = [
  { type: 'LocalBusiness', en: 'Local business (generic)', it: 'Attività locale (generica)' },
  {
    type: 'HomeAndConstructionBusiness',
    en: 'Home and construction services',
    it: 'Servizi per la casa ed edilizia',
    group: 'home',
  },
  { type: 'Electrician', en: 'Electrician', it: 'Elettricista', group: 'home' },
  { type: 'GeneralContractor', en: 'General contractor', it: 'Impresa edile', group: 'home' },
  {
    type: 'HVACBusiness',
    en: 'Heating and air conditioning',
    it: 'Riscaldamento e climatizzazione',
    group: 'home',
  },
  { type: 'HousePainter', en: 'House painter', it: 'Imbianchino', group: 'home' },
  { type: 'Locksmith', en: 'Locksmith', it: 'Fabbro', group: 'home' },
  { type: 'MovingCompany', en: 'Moving company', it: 'Traslochi', group: 'home' },
  { type: 'Plumber', en: 'Plumber', it: 'Idraulico', group: 'home' },
  { type: 'RoofingContractor', en: 'Roofing contractor', it: 'Coperture e tetti', group: 'home' },
  { type: 'ProfessionalService', en: 'Professional service', it: 'Servizio professionale' },
  { type: 'LegalService', en: 'Legal service', it: 'Servizi legali', group: 'legal' },
  { type: 'Attorney', en: 'Attorney', it: 'Avvocato', group: 'legal' },
  { type: 'Notary', en: 'Notary', it: 'Notaio', group: 'legal' },
  { type: 'FinancialService', en: 'Financial service', it: 'Servizi finanziari', group: 'finance' },
  { type: 'AccountingService', en: 'Accountant', it: 'Commercialista', group: 'finance' },
  { type: 'InsuranceAgency', en: 'Insurance agency', it: 'Agenzia assicurativa', group: 'finance' },
  { type: 'RealEstateAgent', en: 'Real estate agent', it: 'Agenzia immobiliare' },
  { type: 'TravelAgency', en: 'Travel agency', it: 'Agenzia di viaggi' },
  { type: 'EmploymentAgency', en: 'Employment agency', it: 'Agenzia per il lavoro' },
  { type: 'AutomotiveBusiness', en: 'Automotive business', it: 'Settore auto', group: 'auto' },
  { type: 'AutoRepair', en: 'Car repair', it: 'Autofficina', group: 'auto' },
  { type: 'AutoBodyShop', en: 'Body shop', it: 'Carrozzeria', group: 'auto' },
  { type: 'AutoDealer', en: 'Car dealer', it: 'Concessionaria', group: 'auto' },
  { type: 'AutoPartsStore', en: 'Car parts store', it: 'Ricambi auto', group: 'auto' },
  { type: 'AutoRental', en: 'Car rental', it: 'Autonoleggio', group: 'auto' },
  { type: 'AutoWash', en: 'Car wash', it: 'Autolavaggio', group: 'auto' },
  { type: 'MotorcycleRepair', en: 'Motorcycle repair', it: 'Officina moto', group: 'auto' },
  { type: 'FoodEstablishment', en: 'Food establishment', it: 'Ristorazione', group: 'food' },
  { type: 'Restaurant', en: 'Restaurant', it: 'Ristorante', group: 'food' },
  { type: 'BarOrPub', en: 'Bar or pub', it: 'Bar o pub', group: 'food' },
  { type: 'CafeOrCoffeeShop', en: 'Café', it: 'Caffetteria', group: 'food' },
  { type: 'Bakery', en: 'Bakery', it: 'Panetteria', group: 'food' },
  { type: 'IceCreamShop', en: 'Ice cream shop', it: 'Gelateria', group: 'food' },
  { type: 'FastFoodRestaurant', en: 'Fast food', it: 'Fast food', group: 'food' },
  { type: 'Winery', en: 'Winery', it: 'Cantina', group: 'food' },
  { type: 'Brewery', en: 'Brewery', it: 'Birrificio', group: 'food' },
  { type: 'LodgingBusiness', en: 'Lodging', it: 'Alloggio', group: 'lodging' },
  { type: 'Hotel', en: 'Hotel', it: 'Hotel', group: 'lodging' },
  { type: 'BedAndBreakfast', en: 'Bed and breakfast', it: 'Bed and breakfast', group: 'lodging' },
  { type: 'Campground', en: 'Campground', it: 'Campeggio', group: 'lodging' },
  { type: 'Hostel', en: 'Hostel', it: 'Ostello', group: 'lodging' },
  { type: 'Resort', en: 'Resort', it: 'Resort', group: 'lodging' },
  { type: 'VacationRental', en: 'Vacation rental', it: 'Casa vacanze', group: 'lodging' },
  {
    type: 'HealthAndBeautyBusiness',
    en: 'Health and beauty',
    it: 'Salute e bellezza',
    group: 'beauty',
  },
  { type: 'BeautySalon', en: 'Beauty salon', it: 'Centro estetico', group: 'beauty' },
  { type: 'HairSalon', en: 'Hair salon', it: 'Parrucchiere', group: 'beauty' },
  { type: 'NailSalon', en: 'Nail salon', it: 'Onicotecnica', group: 'beauty' },
  { type: 'DaySpa', en: 'Day spa', it: 'Spa', group: 'beauty' },
  { type: 'HealthClub', en: 'Health club', it: 'Centro benessere', group: 'beauty' },
  { type: 'TattooParlor', en: 'Tattoo parlor', it: 'Studio di tatuaggi', group: 'beauty' },
  { type: 'MedicalBusiness', en: 'Medical business', it: 'Attività medica', group: 'medical' },
  { type: 'Dentist', en: 'Dentist', it: 'Dentista', group: 'medical' },
  { type: 'MedicalClinic', en: 'Medical clinic', it: 'Poliambulatorio', group: 'medical' },
  { type: 'Optician', en: 'Optician', it: 'Ottico', group: 'medical' },
  { type: 'Pharmacy', en: 'Pharmacy', it: 'Farmacia', group: 'medical' },
  { type: 'Physician', en: 'Physician', it: 'Medico', group: 'medical' },
  { type: 'SportsActivityLocation', en: 'Sports venue', it: 'Impianto sportivo', group: 'sports' },
  { type: 'ExerciseGym', en: 'Gym', it: 'Palestra', group: 'sports' },
  { type: 'SportsClub', en: 'Sports club', it: 'Società sportiva', group: 'sports' },
  { type: 'GolfCourse', en: 'Golf course', it: 'Campo da golf', group: 'sports' },
  { type: 'Store', en: 'Store', it: 'Negozio', group: 'store' },
  { type: 'BikeStore', en: 'Bike store', it: 'Negozio di bici', group: 'store' },
  { type: 'BookStore', en: 'Bookstore', it: 'Libreria', group: 'store' },
  { type: 'ClothingStore', en: 'Clothing store', it: 'Abbigliamento', group: 'store' },
  { type: 'ComputerStore', en: 'Computer store', it: 'Informatica', group: 'store' },
  { type: 'ElectronicsStore', en: 'Electronics store', it: 'Elettronica', group: 'store' },
  { type: 'Florist', en: 'Florist', it: 'Fiorista', group: 'store' },
  { type: 'FurnitureStore', en: 'Furniture store', it: 'Arredamento', group: 'store' },
  { type: 'GardenStore', en: 'Garden store', it: 'Giardinaggio', group: 'store' },
  { type: 'GroceryStore', en: 'Grocery store', it: 'Alimentari', group: 'store' },
  { type: 'HardwareStore', en: 'Hardware store', it: 'Ferramenta', group: 'store' },
  { type: 'HomeGoodsStore', en: 'Home goods store', it: 'Casalinghi', group: 'store' },
  { type: 'JewelryStore', en: 'Jewelry store', it: 'Gioielleria', group: 'store' },
  { type: 'MobilePhoneStore', en: 'Mobile phone store', it: 'Telefonia', group: 'store' },
  { type: 'PetStore', en: 'Pet store', it: 'Animali', group: 'store' },
  { type: 'ShoeStore', en: 'Shoe store', it: 'Calzature', group: 'store' },
  { type: 'SportingGoodsStore', en: 'Sporting goods', it: 'Articoli sportivi', group: 'store' },
  { type: 'ToyStore', en: 'Toy store', it: 'Giocattoli', group: 'store' },
  { type: 'ChildCare', en: 'Child care', it: 'Asilo nido' },
  { type: 'DryCleaningOrLaundry', en: 'Dry cleaning or laundry', it: 'Lavanderia' },
  { type: 'SelfStorage', en: 'Self storage', it: 'Self storage' },
  { type: 'EntertainmentBusiness', en: 'Entertainment', it: 'Intrattenimento' },
  { type: 'TouristInformationCenter', en: 'Tourist information', it: 'Ufficio turistico' },
];

const BUSINESS_TYPE_SET = new Set(BUSINESS_TYPES.map((t) => t.type));
export const isBusinessType = (value: unknown): value is string =>
  typeof value === 'string' && BUSINESS_TYPE_SET.has(value);

/** The business data as saved: trimmed, short, only valid lines. */
export function cleanBusiness(raw: unknown): LocalBusinessData {
  const b = (raw ?? {}) as Partial<LocalBusinessData> & {
    address?: Partial<LocalBusinessData['address']>;
  };
  const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const lines = (v: unknown, max: number) =>
    (Array.isArray(v) ? v : typeof v === 'string' ? v.split('\n') : [])
      .map((x) => str(x, 100))
      .filter(Boolean)
      .filter((x, i, all) => all.indexOf(x) === i)
      .slice(0, max);
  const a: Partial<LocalBusinessData['address']> = b.address ?? {};
  return {
    telephone: str(b.telephone, 40),
    address: {
      streetAddress: str(a.streetAddress),
      postalCode: str(a.postalCode, 20),
      addressLocality: str(a.addressLocality, 100),
      addressRegion: str(a.addressRegion, 100),
      addressCountry: str(a.addressCountry, 2)
        .toUpperCase()
        .replace(/[^A-Z]/g, ''),
    },
    areaServed: lines(b.areaServed, 100),
    // "Mo-Fr 08:30-18:30", "Sa 09:00-12:30", "Mo,We 15:00-19:00", "Mo-Su": schema.org's form only.
    openingHours: lines(b.openingHours, 14).filter((h) =>
      /^(Mo|Tu|We|Th|Fr|Sa|Su)([-,](Mo|Tu|We|Th|Fr|Sa|Su))*( \d{2}:\d{2}-\d{2}:\d{2})?$/.test(h),
    ),
    priceRange: str(b.priceRange, 100),
    vatID: str(b.vatID, 40),
  };
}

/** The local business's own properties for its schema.org node (only those filled in). */
export function businessProperties(b: LocalBusinessData): Record<string, unknown> {
  const a = b.address;
  const hasAddress = Object.values(a).some(Boolean);
  return {
    ...(b.telephone ? { telephone: b.telephone } : {}),
    ...(hasAddress
      ? {
          address: {
            '@type': 'PostalAddress',
            ...Object.fromEntries(Object.entries(a).filter(([, v]) => v)),
          },
        }
      : {}),
    ...(b.areaServed.length
      ? { areaServed: b.areaServed.map((name) => ({ '@type': 'City', name })) }
      : {}),
    ...(b.openingHours.length ? { openingHours: b.openingHours } : {}),
    ...(b.priceRange ? { priceRange: b.priceRange } : {}),
    ...(b.vatID ? { vatID: b.vatID } : {}),
  };
}

export const DEFAULT_CONFIG: SeoConfig = {
  hiddenTypes: [],
  hiddenTaxonomies: [],
  sitemapImages: true,
  titles: {},
  representation: {
    kind: 'organization',
    name: '',
    logo: '',
    sameAs: [],
    businessType: '',
    business: EMPTY_BUSINESS,
  },
};

export function withDefaults(saved: Partial<SeoConfig> | null): SeoConfig {
  const value = saved ?? {};
  return {
    ...DEFAULT_CONFIG,
    ...value,
    representation: {
      ...DEFAULT_CONFIG.representation,
      ...value.representation,
      business: cleanBusiness(value.representation?.business),
    },
  };
}

export const DEFAULT_TITLE = '%%title%% %%sep%% %%sitename%%';

/** The variables of title templates, as in Yoast SEO. */
export const TITLE_VARIABLES = [
  'title',
  'sep',
  'sitename',
  'excerpt',
  'category',
  'currentyear',
  'page',
] as const;

/**
 * Yoast SEO's `%%page%%` on an archive's later pages: the separator, then
 * "Page 2 of 22" ("Pagina 2 di 22"); nothing on the first page.
 */
export function pageVariable(
  locale: string,
  separator: string,
  page: number | undefined,
  pages: number | undefined,
): string {
  if (!page || page < 2) return '';
  const it = locale.toLowerCase().startsWith('it');
  const of = pages && pages >= page ? ` ${it ? 'di' : 'of'} ${pages}` : '';
  return `${separator} ${it ? 'Pagina' : 'Page'} ${page}${of}`;
}

export function applyTemplate(template: string, values: Record<string, string>): string {
  return (
    template
      .replace(/%%([a-z_]+)%%/g, (_m, name: string) => values[name] ?? '')
      .replace(/\s{2,}/g, ' ')
      // A variable without a value leaves no double separator ("Title – – Site").
      .replace(/(\s[-–—|·:])(?:\s+[-–—|·:])+(?=\s|$)/g, '$1')
      .replace(/^\s*[-–—|·:]\s*|\s*[-–—|·:]\s*$/g, '')
      .trim()
  );
}

/** Typographic characters as typed: ’ and ‘ as ', “ and ” as ", dashes as -, … as ... */
const typed = (value: string): string =>
  value
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/×/g, 'x')
    .replace(/-+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The title for search results and social networks: as written in WordPress
 * (`rawTitle`, kept by the WordPress Importer since 1.35.0) while the entry's
 * title is still the imported one, which has WordPress's curly quotes and
 * dashes; Yoast SEO and Rank Math show the title as written too. The entry's
 * title once an editor changed it.
 */
export function searchTitle(title: string, rawTitle: unknown): string {
  return typeof rawTitle === 'string' && rawTitle.trim() && typed(rawTitle) === typed(title)
    ? rawTitle
    : title;
}
