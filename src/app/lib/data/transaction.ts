// Interactive transactions for routes (ARCH-001, ADR-001).
//
// forCompany() scopes model calls only, so transactions run on the plain client.
// Routes call withTransaction() instead of importing the shared client, which keeps
// them off eslint.prisma-routes-baseline.txt. Inside the callback, scope each query
// to the company yourself (the `tx` client is not company-scoped).
import type { Prisma } from '@prisma/client'
import { prisma } from '@/app/lib/db'

export function withTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn)
}
