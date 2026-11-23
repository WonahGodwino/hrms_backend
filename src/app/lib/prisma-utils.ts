// src/app/lib/prisma-utils.ts
import { Prisma } from '@prisma/client'

/** `raw` when it is one of the enum's values, otherwise null (query-string filters). */
export function enumValueOrNull<T extends string>(values: Record<string, T>, raw: string | null | undefined): T | null {
  return raw && (Object.values(values) as string[]).includes(raw) ? (raw as T) : null
}

export function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return value
  if (typeof value === 'object' && 'toNumber' in value) {
    return (value as Prisma.Decimal).toNumber()
  }
  return Number(value)
}

/** Like decimalToNumber, but keeps null (an unset amount stays unset). */
export function decimalOrNull(value: Prisma.Decimal | number | null | undefined): number | null {
  return value === null || value === undefined ? null : decimalToNumber(value)
}

/**
 * A Decimal (or number, or numeric string) as a plain number; null and
 * undefined pass through unchanged, so `?? fallback` and `=== undefined`
 * checks keep working. Used where Decimal amounts are read (DB-004): JSON
 * would otherwise send them as strings and `+` would concatenate them.
 */
export function asNumber(value: Prisma.Decimal | number): number
export function asNumber(value: Prisma.Decimal | number | null): number | null
export function asNumber(value: Prisma.Decimal | number | string | null | undefined): number | null | undefined
export function asNumber(value: Prisma.Decimal | number | string | null | undefined): number | null | undefined {
  if (value === null || value === undefined) return value
  if (typeof value === 'number') return value
  return decimalToNumber(value as Prisma.Decimal)
}

/** A copy of a record with the named Decimal fields as numbers (for API responses). */
export function withNumberFields<T extends object, K extends keyof T>(record: T, keys: readonly K[]): Omit<T, K> & { [P in K]: number | null }
export function withNumberFields<T extends object, K extends keyof T>(record: T | null, keys: readonly K[]): (Omit<T, K> & { [P in K]: number | null }) | null
export function withNumberFields<T extends object, K extends keyof T>(record: T | null, keys: readonly K[]) {
  if (!record) return null
  const out: Record<string, unknown> = { ...(record as Record<string, unknown>) }
  for (const k of keys) out[k as string] = asNumber(record[k] as Prisma.Decimal | number | null | undefined) ?? null
  return out
}

/** Decimal columns of the AI cost tables (DB-004 step 2). */
export const TOKEN_COST_DECIMALS = ['costPerUnit', 'providerCostPerUnit'] as const
export const AI_SETTINGS_DECIMALS = ['monthlyBudget', 'costPerReview'] as const

