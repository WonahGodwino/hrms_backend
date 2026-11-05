// src/app/lib/prisma-utils.ts
import { Prisma } from '@prisma/client'

export function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return value
  if (typeof value === 'object' && 'toNumber' in value) {
    return (value as Prisma.Decimal).toNumber()
  }
  return Number(value)
}

