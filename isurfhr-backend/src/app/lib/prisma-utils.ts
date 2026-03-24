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

export function safeSubtract(...values: (Prisma.Decimal | number | null | undefined)[]): number {
  // Fix: Add explicit type annotation for accumulator
  return values.reduce<number>((acc, val) => acc - decimalToNumber(val), 0)
}

export function formatDecimal(value: Prisma.Decimal | number | null | undefined, decimals: number = 2): string {
  const num = decimalToNumber(value)
  return num.toFixed(decimals)
}

export function isDecimal(value: any): value is Prisma.Decimal {
  return value && typeof value === 'object' && 'toNumber' in value
}

export function toDecimal(value: number | string): Prisma.Decimal {
  return new Prisma.Decimal(value)
}

export function sumDecimals(values: (Prisma.Decimal | number | null | undefined)[]): number {
  // Fix: Add explicit type annotation for accumulator
  return values.reduce<number>((acc, val) => acc + decimalToNumber(val), 0)
}

export function averageDecimals(values: (Prisma.Decimal | number | null | undefined)[]): number {
  if (values.length === 0) return 0
  const sum = sumDecimals(values)
  return sum / values.length
}

export function safeDivide(
  numerator: Prisma.Decimal | number | null | undefined,
  denominator: Prisma.Decimal | number | null | undefined
): number {
  const num = decimalToNumber(numerator)
  const den = decimalToNumber(denominator)
  
  if (den === 0) return 0
  return num / den
}

export function decimalsEqual(
  a: Prisma.Decimal | number | null | undefined,
  b: Prisma.Decimal | number | null | undefined,
  tolerance: number = 0.0001
): boolean {
  const numA = decimalToNumber(a)
  const numB = decimalToNumber(b)
  return Math.abs(numA - numB) <= tolerance
}

// New utility functions for common decimal operations
export function minDecimal(...values: (Prisma.Decimal | number | null | undefined)[]): number {
  const numbers = values.map(v => decimalToNumber(v))
  return Math.min(...numbers)
}

export function maxDecimal(...values: (Prisma.Decimal | number | null | undefined)[]): number {
  const numbers = values.map(v => decimalToNumber(v))
  return Math.max(...numbers)
}

export function roundDecimal(
  value: Prisma.Decimal | number | null | undefined, 
  decimals: number = 0
): number {
  const num = decimalToNumber(value)
  const factor = Math.pow(10, decimals)
  return Math.round(num * factor) / factor
}

export function floorDecimal(
  value: Prisma.Decimal | number | null | undefined, 
  decimals: number = 0
): number {
  const num = decimalToNumber(value)
  const factor = Math.pow(10, decimals)
  return Math.floor(num * factor) / factor
}

export function ceilDecimal(
  value: Prisma.Decimal | number | null | undefined, 
  decimals: number = 0
): number {
  const num = decimalToNumber(value)
  const factor = Math.pow(10, decimals)
  return Math.ceil(num * factor) / factor
}

export function isPositive(value: Prisma.Decimal | number | null | undefined): boolean {
  return decimalToNumber(value) > 0
}

export function isNegative(value: Prisma.Decimal | number | null | undefined): boolean {
  return decimalToNumber(value) < 0
}

export function isZero(value: Prisma.Decimal | number | null | undefined): boolean {
  return decimalToNumber(value) === 0
}

export function compareDecimals(
  a: Prisma.Decimal | number | null | undefined,
  b: Prisma.Decimal | number | null | undefined
): number {
  const numA = decimalToNumber(a)
  const numB = decimalToNumber(b)
  
  if (numA < numB) return -1
  if (numA > numB) return 1
  return 0
}

export function absDecimal(value: Prisma.Decimal | number | null | undefined): number {
  return Math.abs(decimalToNumber(value))
}