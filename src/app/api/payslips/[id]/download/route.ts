// src/app/api/payslips/[id]/download/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireAuth } from '@/app/lib/auth'
import { handleApiError } from '@/app/lib/utils'
import fs from 'fs/promises'
import path from 'path'

interface RouteContext {
  params: { id: string }
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return new Response('Authorization header missing', { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireAuth(token) // { userId, email, role, companyId }

    const { id } = context.params

    // Scope by companyId to respect multi-company boundaries
    const payslip = await prisma.payslip.findFirst({
      where: {
        id,
        companyId: user.companyId,
      },
      include: {
        staffRecord: true,
      },
    })

    if (!payslip) {
      return new Response('Payslip not found', { status: 404 })
    }

    // Access control:
    // - STAFF: can only download their own payslips (match email)
    // - HR / SUPER_ADMIN: can download any within their company
    if (user.role === 'STAFF' && payslip.staffRecord.email !== user.email) {
      return new Response('Forbidden', { status: 403 })
    }

    // Resolve file path (we stored absolute paths in filePath)
    let filePath = payslip.filePath

    // Optional safety: if you ever switch to storing relative paths
    if (!path.isAbsolute(filePath)) {
      filePath = path.join(process.cwd(), filePath)
    }

    const fileBuffer = await fs.readFile(filePath)

    return new Response(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${payslip.fileName}"`,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
