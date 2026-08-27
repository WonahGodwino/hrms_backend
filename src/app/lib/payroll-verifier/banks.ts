// src/app/lib/payroll-verifier/banks.ts
//
// Nigerian bank list cache (Flutterwave v3 /banks/NG) + fuzzy bank-name
// resolution. Bank data is platform-wide, not per-company — every company
// resolves against the same Flutterwave bank list — so this cache is a
// single module-level singleton shared across all companies, refreshed at
// most once per hour.
import Fuse from 'fuse.js'

const FLW_BASE_URL = 'https://api.flutterwave.com/v3'
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

export interface FlutterwaveBank {
  id: number
  code: string
  name: string
}

// Common Nigerian bank nicknames/short codes payroll spreadsheets are
// usually filled in with, mapped to their CBN bank codes. Merged into the
// live map AFTER every successful fetch so these always win over whatever
// Flutterwave calls the bank officially.
const ALIASES: Record<string, string> = {
  GTB: '058',
  GTBANK: '058',
  ACCESS: '044',
  ZENITH: '057',
  UBA: '033',
  FIDELITY: '070',
  FCMB: '214',
  FIRSTBANK: '011',
  FBN: '011',
  UNION: '032',
  STANBIC: '221',
  STERLING: '232',
  WEMA: '035',
  ECOBANK: '050',
  KEYSTONE: '082',
  POLARIS: '076',
  JAIZ: '301',
  UNITY: '215',
  PROVIDUS: '101',
  OPAY: '100004',
  KUDA: '090267',
  PALMPAY: '100033',
  MONIEPOINT: '090405',
}

let LIVE_BANK_MAP: Record<string, string> = {}
let LIVE_BANK_LIST: FlutterwaveBank[] = []
let banksFetchedAt = 0

function normalizeBankKey(name: string): string {
  return name.trim().toUpperCase().replace(/\s+/g, ' ')
}

// Fetches and caches the Flutterwave NG bank list. Never throws — a failed
// refresh silently keeps whatever was cached before (including an empty
// cache on the very first call), since a transient Flutterwave outage
// shouldn't take down bank resolution for everyone using an already-warm
// cache.
export async function fetchBanks(): Promise<void> {
  const isFresh = LIVE_BANK_LIST.length > 0 && Date.now() - banksFetchedAt < CACHE_TTL_MS
  if (isFresh) return

  const secretKey = process.env.FLW_SECRET_KEY
  if (!secretKey) {
    console.error('[PAYROLL_VERIFIER] FLW_SECRET_KEY is not set — bank list cannot be fetched')
    return
  }

  try {
    const res = await fetch(`${FLW_BASE_URL}/banks/NG`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    })
    const data = await res.json()

    if (!res.ok || data?.status !== 'success') {
      console.error('[PAYROLL_VERIFIER] Failed to fetch bank list:', data?.message || res.statusText)
      return
    }

    LIVE_BANK_LIST = data.data || []
    const map: Record<string, string> = {}
    for (const bank of LIVE_BANK_LIST) {
      if (bank?.name && bank?.code) {
        map[normalizeBankKey(bank.name)] = String(bank.code)
      }
    }
    // Curated aliases always win over official Flutterwave naming.
    Object.assign(map, ALIASES)

    LIVE_BANK_MAP = map
    banksFetchedAt = Date.now()
    console.log(`[PAYROLL_VERIFIER] Loaded ${LIVE_BANK_LIST.length} banks from Flutterwave`)
  } catch (err) {
    console.error('[PAYROLL_VERIFIER] Error fetching bank list:', err)
  }
}

export function getBankList(): FlutterwaveBank[] {
  return LIVE_BANK_LIST
}

// Resolves a raw, human-typed bank name (e.g. "gtb", "Zenith Bank Plc") to
// its CBN bank code. Exact match against the normalized map first, then a
// fuzzy match (Fuse.js, threshold 0.3 — roughly an 80%+ similarity cutoff)
// against the map's keys.
export function resolveBankCode(rawBank: string | null | undefined): string | null {
  if (!rawBank) return null
  const keys = Object.keys(LIVE_BANK_MAP)
  if (keys.length === 0) return null

  const normalized = normalizeBankKey(rawBank)

  const exact = LIVE_BANK_MAP[normalized]
  if (exact) return exact

  const fuse = new Fuse(keys, { includeScore: true, threshold: 0.3 })
  const [best] = fuse.search(normalized)
  if (best && (best.score ?? 1) <= 0.3) {
    console.log(`[PAYROLL_VERIFIER] Fuzzy-matched bank "${rawBank}" -> "${best.item}" (score ${best.score})`)
    return LIVE_BANK_MAP[best.item]
  }

  return null
}
