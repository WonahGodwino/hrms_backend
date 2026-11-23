// POST /api/payslips/bulk-download  { ids: string[] }
// Streams the selected payslip PDFs as one ZIP. One payslip is downloaded
// through /api/payslips/[id]/download instead (a plain PDF).
import { NextRequest } from 'next/server'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { getCorsHeaders, handleCorsOptions, withCors } from '@/app/lib/cors'
import { attachmentDisposition } from '@/app/lib/excel/sheet-theme'
import {
  BulkDownloadError,
  downloadableCompanyIds,
  findDownloadablePayslips,
  parseBulkDownloadIds,
  payslipZipName,
  streamPayslipZip,
} from '@/app/lib/payroll/payslips/bulk-download'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    if (!token) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const user = await requireModuleAccess(token, 'PAYROLL', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const ids = parseBulkDownloadIds(await request.json().catch(() => null))
    const companyIds = await downloadableCompanyIds(user)
    const { items, skipped } = await findDownloadablePayslips(ids, companyIds)
    if (items.length === 0) {
      return withCors(ApiResponse.error('None of the selected payslips has a PDF you can download', 404), origin)
    }

    // Not wrapped in withCors: that helper buffers the whole body, and this
    // response is streamed so large selections never sit in memory.
    const cors = getCorsHeaders(origin)
    return new Response(streamPayslipZip(items), {
      status: 200,
      headers: {
        ...cors,
        'Access-Control-Expose-Headers': `${cors['Access-Control-Expose-Headers']}, X-Payslip-Count, X-Payslip-Skipped`,
        'Content-Type': 'application/zip',
        'Content-Disposition': attachmentDisposition(payslipZipName(items)),
        'Cache-Control': 'no-store',
        'X-Payslip-Count': String(items.length),
        'X-Payslip-Skipped': String(skipped),
      },
    })
  } catch (error) {
    if (error instanceof BulkDownloadError) return withCors(ApiResponse.error(error.message, error.status), origin)
    return withCors(handleApiError(error), origin)
  }
}
