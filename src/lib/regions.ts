/**
 * Countries, currencies and timezones for workspace settings.
 * Names come from the browser (Intl), so they are always spelled correctly and need no translation table.
 */

// ISO 3166-1 alpha-2 codes.
const COUNTRY_CODES = (
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
  'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP ' +
  'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT ' +
  'MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW ' +
  'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG ' +
  'UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
).split(' ');

/** Sensible defaults for the markets operators come from most. Anything else falls back to USD + browser zone. */
const DEFAULTS: Record<string, { currency: string; timezone: string }> = {
  AE: { currency: 'AED', timezone: 'Asia/Dubai' },
  SA: { currency: 'SAR', timezone: 'Asia/Riyadh' },
  QA: { currency: 'QAR', timezone: 'Asia/Qatar' },
  OM: { currency: 'OMR', timezone: 'Asia/Muscat' },
  KW: { currency: 'KWD', timezone: 'Asia/Kuwait' },
  BH: { currency: 'BHD', timezone: 'Asia/Bahrain' },
  EG: { currency: 'EGP', timezone: 'Africa/Cairo' },
  IN: { currency: 'INR', timezone: 'Asia/Kolkata' },
  PK: { currency: 'PKR', timezone: 'Asia/Karachi' },
  NG: { currency: 'NGN', timezone: 'Africa/Lagos' },
  KE: { currency: 'KES', timezone: 'Africa/Nairobi' },
  ZA: { currency: 'ZAR', timezone: 'Africa/Johannesburg' },
  US: { currency: 'USD', timezone: 'America/New_York' },
  CA: { currency: 'CAD', timezone: 'America/Toronto' },
  MX: { currency: 'MXN', timezone: 'America/Mexico_City' },
  BR: { currency: 'BRL', timezone: 'America/Sao_Paulo' },
  GB: { currency: 'GBP', timezone: 'Europe/London' },
  IE: { currency: 'EUR', timezone: 'Europe/Dublin' },
  FR: { currency: 'EUR', timezone: 'Europe/Paris' },
  DE: { currency: 'EUR', timezone: 'Europe/Berlin' },
  ES: { currency: 'EUR', timezone: 'Europe/Madrid' },
  PT: { currency: 'EUR', timezone: 'Europe/Lisbon' },
  IT: { currency: 'EUR', timezone: 'Europe/Rome' },
  NL: { currency: 'EUR', timezone: 'Europe/Amsterdam' },
  GR: { currency: 'EUR', timezone: 'Europe/Athens' },
  CH: { currency: 'CHF', timezone: 'Europe/Zurich' },
  TR: { currency: 'TRY', timezone: 'Europe/Istanbul' },
  GE: { currency: 'GEL', timezone: 'Asia/Tbilisi' },
  SG: { currency: 'SGD', timezone: 'Asia/Singapore' },
  MY: { currency: 'MYR', timezone: 'Asia/Kuala_Lumpur' },
  TH: { currency: 'THB', timezone: 'Asia/Bangkok' },
  ID: { currency: 'IDR', timezone: 'Asia/Jakarta' },
  PH: { currency: 'PHP', timezone: 'Asia/Manila' },
  JP: { currency: 'JPY', timezone: 'Asia/Tokyo' },
  AU: { currency: 'AUD', timezone: 'Australia/Sydney' },
  NZ: { currency: 'NZD', timezone: 'Pacific/Auckland' },
};

const FALLBACK_CURRENCIES = ['AED', 'AUD', 'BHD', 'CAD', 'CHF', 'EGP', 'EUR', 'GBP', 'INR', 'JPY', 'KWD', 'NGN', 'OMR', 'QAR', 'SAR', 'SGD', 'USD', 'ZAR'];

function supported(key: 'currency' | 'timeZone'): string[] | null {
  const fn = (Intl as any).supportedValuesOf;
  try { return typeof fn === 'function' ? fn(key) : null; } catch { return null; }
}

function displayNames(type: 'region' | 'currency') {
  try { return new Intl.DisplayNames(['en'], { type }); } catch { return null; }
}

export interface Option { value: string; label: string }

export function countryOptions(): Option[] {
  const names = displayNames('region');
  return COUNTRY_CODES
    .map(code => ({ value: code, label: names?.of(code) ?? code }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function currencyOptions(): Option[] {
  const names = displayNames('currency');
  return (supported('currency') ?? FALLBACK_CURRENCIES)
    .map(code => ({ value: code, label: `${code} · ${names?.of(code) ?? code}` }));
}

export function timezoneOptions(): Option[] {
  // Browsers list some zones under older names (Chrome: Asia/Calcutta), so add every default zone and the
  // browser's own zone too; Postgres accepts both spellings.
  const zones = new Set<string>(['UTC', ...(supported('timeZone') ?? []), browserTimezone(),
    ...Object.values(DEFAULTS).map(d => d.timezone)]);
  return [...zones]
    .sort((a, b) => (a === 'UTC' ? -1 : b === 'UTC' ? 1 : a.localeCompare(b)))
    .map(z => ({ value: z, label: z.replace(/_/g, ' ') }));
}

export function browserTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

const TZ_ALIASES: Record<string, string> = { 'Asia/Calcutta': 'Asia/Kolkata' };

/**
 * Guess the visitor's country: first from the browser timezone (reliable for Dubai, India, London...),
 * then from the browser language region (en-AE → AE). Empty if unknown.
 */
export function guessCountry(): string {
  const tz = TZ_ALIASES[browserTimezone()] ?? browserTimezone();
  const byZone = Object.entries(DEFAULTS).find(([, d]) => d.timezone === tz)?.[0];
  if (byZone) return byZone;
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    return region && COUNTRY_CODES.includes(region) ? region : '';
  } catch { return ''; }
}

export function defaultsFor(country: string): { currency: string; timezone: string } {
  return DEFAULTS[country] ?? { currency: 'USD', timezone: browserTimezone() };
}
