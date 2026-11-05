// src/app/lib/staff/upload-access.ts
//
// Who may upload staff, and into which company. Shared by the validate and import routes.
import { NextRequest } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { prisma } from '@/app/lib/db'

export type StaffUploadContext =
  | { ok: true; authUser: ReturnType<typeof requireRole>; companyId: string; company: { id: string; companyName: string }; file: File }
  | { ok: false; message: string; status: number }

const ALLOWED_TYPES = ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv']

export async function resolveStaffUploadContext(request: NextRequest, formData: FormData): Promise<StaffUploadContext> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return { ok: false, message: 'Authorization header missing', status: 401 }

  const authUser = requireRole(authHeader.replace('Bearer ', ''), ['HR', 'SUPER_ADMIN', 'ADMIN'])
  const companyId = formData.get('companyId') as string | null
  const file = formData.get('file') as File | null

  if (!companyId) {
    return { ok: false, message: authUser.role === 'HR' ? 'Company selection is required' : 'Company selection is required for administrators', status: 400 }
  }

  // HR and ADMIN must be assigned to the company; SUPER_ADMIN may pick any.
  if (authUser.role === 'HR' || authUser.role === 'ADMIN') {
    const hasAccess = await prisma.userCompany.findFirst({
      where: { userId: authUser.userId, companyId, role: { in: authUser.role === 'HR' ? ['HR', 'ALL'] : ['ADMIN', 'ALL'] } },
    })
    if (!hasAccess) {
      return {
        ok: false,
        message: authUser.role === 'HR' ? 'You do not have HR access for this company' : 'You do not have access to upload staff for this company',
        status: 403,
      }
    }
  }

  const company = await prisma.company.findFirst({ where: { id: companyId, archived: 0 }, select: { id: true, companyName: true } })
  if (!company) return { ok: false, message: 'Company not found or is archived', status: 404 }

  if (!file) return { ok: false, message: 'No file uploaded', status: 400 }

  const extension = file.name.split('.').pop()?.toLowerCase() || ''
  if (!ALLOWED_TYPES.includes(file.type) && !['xlsx', 'xls', 'csv'].includes(extension)) {
    return { ok: false, message: 'Invalid file type. Please upload Excel or CSV files.', status: 400 }
  }

  return { ok: true, authUser, companyId, company, file }
}
