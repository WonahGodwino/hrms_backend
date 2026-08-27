// /src/app/api/leaves/[id]/attachment/route.ts
//
// GET — streams the document attached to a leave request, for preview
// (default, inline) or download (?download=1, attachment). Access mirrors
// GET /api/leaves/details/:id: STAFF/MANAGER may only access their own leave
// request's attachment; HR/ADMIN/SUPER_ADMIN may access any within their
// company scope.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { readFile } from 'fs/promises'
import path from 'path'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['STAFF', 'MANAGER', 'HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params

    const leave = await prisma.leaveRequest.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        staffRecordId: true,
        fileName: true,
        attachmentMimeType: true,
        attachmentSize: true,
        attachmentData: true,
        attachmentUrl: true,
        hasAttachment: true,
      },
    })

    if (!leave) {
      return withCors(ApiResponse.error('Leave request not found', 404), origin)
    }

    const isElevatedRole = ['HR', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)

    if (!isElevatedRole) {
      const currentStaff = await prisma.staffRecord.findFirst({
        where: { email: user.email, isActive: true },
        select: { id: true },
      })

      if (!currentStaff) {
        return withCors(ApiResponse.error('Staff record not found', 404), origin)
      }

      if (leave.staffRecordId !== currentStaff.id) {
        return withCors(ApiResponse.error('You are not authorized to view this leave request', 403), origin)
      }
    } else if (user.role !== 'SUPER_ADMIN') {
      const userAssignment = await prisma.userCompany.findFirst({
        where: {
          userId: user.userId,
          companyId: leave.companyId,
          role: { in: ['HR', 'ADMIN', 'ALL'] },
        },
      })

      if (!userAssignment) {
        return withCors(ApiResponse.error('You do not have access to this leave request', 403), origin)
      }
    }

    const forceDownload = new URL(request.url).searchParams.get('download') === '1'
    const disposition = forceDownload ? 'attachment' : 'inline'
    const fileName = leave.fileName || 'leave-attachment'

    if (leave.attachmentData) {
      return withCors(
        new NextResponse(leave.attachmentData as any, {
          status: 200,
          headers: {
            'Content-Type': leave.attachmentMimeType || 'application/octet-stream',
            'Content-Disposition': `${disposition}; filename="${fileName}"`,
            'Cache-Control': 'private, no-cache',
            'Content-Length': String(leave.attachmentSize ?? (leave.attachmentData as Buffer).length),
          },
        }),
        origin
      )
    }

    // Legacy fallback: some older leave requests stored the file on local
    // disk instead of in the database. Best-effort read; may 404 if that
    // file only ever existed on a different server instance.
    if (leave.attachmentUrl) {
      try {
        const relativePath = leave.attachmentUrl.replace(/^\/+/, '')
        const absolutePath = path.join(process.cwd(), 'public', relativePath)
        const fileBuffer = await readFile(absolutePath)

        return withCors(
          new NextResponse(fileBuffer as any, {
            status: 200,
            headers: {
              'Content-Type': 'application/octet-stream',
              'Content-Disposition': `${disposition}; filename="${fileName}"`,
              'Cache-Control': 'private, no-cache',
            },
          }),
          origin
        )
      } catch (err: any) {
        if (err?.code === 'ENOENT') {
          return withCors(
            ApiResponse.error('This attachment was uploaded to a different server instance and is no longer available.', 404),
            origin
          )
        }
        throw err
      }
    }

    return withCors(ApiResponse.error('No document attached to this leave request.', 404), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
