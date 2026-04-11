const FALLBACK_CURRENCIES = [
  'AED', 'ARS', 'AUD', 'BDT', 'BRL', 'CAD', 'CHF', 'CLP', 'CNY', 'COP', 'CZK', 'DKK',
  'EGP', 'ETB', 'EUR', 'GBP', 'GHS', 'HKD', 'HUF', 'IDR', 'ILS', 'INR', 'JPY', 'KES', 'KRW',
  'MAD', 'MXN', 'MYR', 'NGN', 'NOK', 'NZD', 'PHP', 'PKR', 'PLN', 'QAR', 'RON', 'RUB',
  'SAR', 'SEK', 'SGD', 'THB', 'TRY', 'TWD', 'UAH', 'UGX', 'USD', 'VND', 'XAF', 'XOF',
  'ZAR'
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

export function getCurrencySymbol(currencyCode: string): string {
  const code = normalizeCurrencyCode(currencyCode)

  try {
    const parts = new Intl.NumberFormat('en', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'symbol'
    }).formatToParts(0)

    const symbolPart = parts.find((part) => part.type === 'currency')
    return symbolPart?.value || code
  } catch {
    return code
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
