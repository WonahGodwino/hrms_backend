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
      upsert: (args: any) =>
        prisma.payroll.upsert({
          ...args,
          create: { ...args.create, companyId },
          update: { ...args.update, companyId },
        }),
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
