import { prisma } from '@/app/lib/db'

export function scopedPrisma(companyId: string) {
  return {
    staffRecord: {
      findMany: (args: any = {}) =>
        prisma.staffRecord.findMany({
          ...args,
          where: { ...(args.where || {}), companyId },
        }),
      findFirst: (args: any = {}) =>
        prisma.staffRecord.findFirst({
          ...args,
          where: { ...(args.where || {}), companyId },
        }),
      create: (args: any) =>
        prisma.staffRecord.create({
          ...args,
          data: { ...args.data, companyId },
        }),
      updateMany: (args: any) =>
        prisma.staffRecord.updateMany({
          ...args,
          where: { ...(args.where || {}), companyId },
        }),
    },

    payroll: {
      findMany: (args: any = {}) =>
        prisma.payroll.findMany({
          ...args,
          where: { ...(args.where || {}), companyId },
        }),
      upsert: async (args: any) => {
        // Payroll no longer has a unique (staffRecordId, month, year, companyId)
        // constraint, so avoid DB-level ON CONFLICT upsert for this model.
        const where = args?.where || {}

        if (where.id) {
          const existing = await prisma.payroll.findUnique({ where: { id: where.id } })
          if (existing) {
            return prisma.payroll.update({
              where: { id: where.id },
              data: { ...(args.update || {}), companyId },
            })
          }
          return prisma.payroll.create({
            data: { ...(args.create || {}), companyId },
          })
        }

        return prisma.payroll.create({
          data: { ...(args.create || {}), companyId },
        })
      },
    },

    payslip: {
      findFirst: (args: any = {}) =>
        prisma.payslip.findFirst({
          ...args,
          where: { ...(args.where || {}), companyId },
        }),
      create: (args: any) =>
        prisma.payslip.create({
          ...args,
          data: { ...args.data, companyId },
        }),
    },

    payrollUpload: {
      create: (args: any) =>
        prisma.payrollUpload.create({
          ...args,
          data: { ...args.data, companyId },
        }),
    },

    staffUpload: {
      create: (args: any) =>
        prisma.staffUpload.create({
          ...args,
          data: { ...args.data, companyId },
        }),
    },
  }
}
