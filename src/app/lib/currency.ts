const FALLBACK_CURRENCIES = [
  'AED', 'ARS', 'AUD', 'BDT', 'BRL', 'BWP', 'CAD', 'CHF', 'CLP', 'CNY', 'COP', 'CZK', 'DKK',
  'EGP', 'ETB', 'EUR', 'GBP', 'GHS', 'HKD', 'HUF', 'IDR', 'ILS', 'INR', 'JPY', 'KES', 'KRW',
  'LRD', 'MAD', 'MXN', 'MYR', 'NGN', 'NOK', 'NZD', 'PHP', 'PKR', 'PLN', 'QAR', 'RON', 'RUB',
  'RWF', 'SAR', 'SEK', 'SGD', 'SLL', 'THB', 'TRY', 'TWD', 'TZS', 'UAH', 'UGX', 'USD', 'VND',
  'XAF', 'XOF', 'ZAR', 'ZMW'
]

export function getSupportedCurrencies(): string[] {
  const intlWithSupported = Intl as unknown as {
    supportedValuesOf?: (type: string) => string[]
  }

  const runtimeCurrencies = intlWithSupported.supportedValuesOf?.('currency') || []

  const currencies = runtimeCurrencies.length > 0
    ? runtimeCurrencies
    : FALLBACK_CURRENCIES

  return Array.from(new Set(currencies.map((code) => code.toUpperCase()))).sort()
}

export function isValidCurrencyCode(value: string): boolean {
  if (!value) return false
  const code = value.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(code)) return false
  return getSupportedCurrencies().includes(code)
}

export function normalizeCurrencyCode(value: string, fallback = 'NGN'): string {
  const code = (value || '').trim().toUpperCase()
  return isValidCurrencyCode(code) ? code : fallback
}

// Static symbol fallbacks used when Intl cannot resolve a real symbol.
// Node builds with small-ICU (common on Windows dev hosts and some slim
// containers) only ship a handful of regional locales, so every currency
// formatting attempt degrades to the literal ISO code ("NGN") instead of
// the symbol ("₦") — payslips and emails then print "NGN 430,976.38".
// When Intl DOES resolve a symbol it always wins (stays correct and
// dynamic per CLDR); this map only repairs the degraded case.
const STATIC_CURRENCY_SYMBOLS: Record<string, string> = {
  AED: 'DH', ARS: 'AR$', AUD: 'A$', BDT: '৳', BRL: 'R$', BWP: 'P',
  CAD: 'CA$', CHF: 'CHF', CLP: 'CLP$', CNY: 'CN¥', COP: 'COL$',
  CZK: 'Kč', DKK: 'kr', EGP: 'E£', ETB: 'Br', EUR: '€', GBP: '£',
  GHS: 'GH₵', HKD: 'HK$', HUF: 'Ft', IDR: 'Rp', ILS: '₪', INR: '₹',
  JPY: '¥', KES: 'KSh', KRW: '₩', LRD: 'L$', MAD: 'DH', MXN: 'MX$',
  MYR: 'RM', NGN: '₦', NOK: 'kr', NZD: 'NZ$', PHP: '₱', PKR: 'Rs',
  PLN: 'zł', QAR: 'QR', RON: 'lei', RUB: '₽', RWF: 'FRw', SAR: 'SR',
  SEK: 'kr', SGD: 'S$', SLL: 'Le', THB: '฿', TRY: '₺', TWD: 'NT$',
  TZS: 'TSh', UAH: '₴', UGX: 'USh', USD: '$', VND: '₫', XAF: 'FCFA',
  XOF: 'CFA', ZAR: 'R', ZMW: 'ZK'
}

export function getCurrencySymbol(currencyCode: string): string {
  const code = normalizeCurrencyCode(currencyCode)

  // Node built with small-ICU (common on Windows dev hosts and some slim
  // containers) only ships a handful of regional locales, so plain 'en'
  // returns the raw code ("NGN") instead of the symbol ("₦") for many
  // currencies. Try the currency's home locale first, then fall back to 'en'.
  const homeLocale: Record<string, string> = {
    NGN: 'en-NG',
    GHS: 'en-GH',
    KES: 'en-KE',
    ZAR: 'en-ZA',
    ZMW: 'en-ZM',
    TZS: 'en-TZ',
    UGX: 'en-UG',
    RWF: 'en-RW',
    XOF: 'fr-SN',
    XAF: 'fr-CM',
    EGP: 'ar-EG',
    MAD: 'fr-MA',
    INR: 'en-IN',
    PHP: 'en-PH',
    BDT: 'bn-BD',
    PKR: 'en-PK'
  }

  const formatSymbol = (locale: string): string | undefined => {
    try {
      const parts = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: code,
        currencyDisplay: 'symbol'
      }).formatToParts(0)
      return parts.find((part) => part.type === 'currency')?.value
    } catch {
      return undefined
    }
  }

  try {
    const home = homeLocale[code]
    const symbol = (home ? formatSymbol(home) : undefined) || formatSymbol('en')
    // small-ICU runtimes "resolve" every currency to its ISO code — detect
    // that (symbol === code) and repair it from the static map so payslips
    // print ₦, not "NGN". Currencies absent from the map keep the code.
    const resolved = symbol || code
    if (resolved.toUpperCase() === code.toUpperCase()) {
      return STATIC_CURRENCY_SYMBOLS[code] || code
    }
    return resolved
  } catch {
    return STATIC_CURRENCY_SYMBOLS[code] || code
  }
}

export function getCurrencyName(currencyCode: string): string {
  const code = normalizeCurrencyCode(currencyCode)

  try {
    const displayNames = new Intl.DisplayNames(['en'], { type: 'currency' })
    return displayNames.of(code) || code
  } catch {
    return code
  }
}

export type LiveRateResponse = {
  baseCurrency: string
  quoteCurrency: string
  rate: number
  source: string
  asOf: string
}

export async function fetchLiveRate(baseCurrency: string, quoteCurrency: string): Promise<LiveRateResponse> {
  const base = normalizeCurrencyCode(baseCurrency)
  const quote = normalizeCurrencyCode(quoteCurrency)

  const endpoint = `https://open.er-api.com/v6/latest/${base}`
  const response = await fetch(endpoint, { method: 'GET', cache: 'no-store' })

  if (!response.ok) {
    throw new Error(`Unable to fetch live exchange rate (${response.status})`)
  }

  const payload = await response.json()
  const rate = Number(payload?.rates?.[quote])

  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Live exchange rate not available for ${base}/${quote}`)
  }

  return {
    baseCurrency: base,
    quoteCurrency: quote,
    rate,
    source: 'open.er-api.com',
    asOf: payload?.time_last_update_utc || new Date().toISOString()
  }
}
