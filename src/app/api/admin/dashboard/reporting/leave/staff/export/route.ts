// src/app/api/admin/dashboard/reporting/leave/staff/export/route.ts
//
// GET — Excel export of a single staff member's leave report + breakdown for a
// given year (the Individual tab's "Export" action). Mirrors the on-screen
// detail from leave/staff/route.ts: KPI summary, balances by leave type, and
// the full request history — built with the same shared workbook builder as
// the full Leave Report so the two exports read as one system.
import { NextRequest, NextResponse } from 'next/server'

import { requireRole } from '@/app/lib/auth'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { decimalToNumber } from '@/app/lib/prisma-utils'
import { prisma } from '@/app/lib/db'
import { getAccessibleCompanies, resolveTargetCompanies } from '@/app/lib/reporting/access'
import { buildReportWorkbook, type ReportColumn } from '@/app/lib/reporting/excel-export'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { attachmentDisposition, safeFileName } from '@/app/lib/excel/sheet-theme'

const APPROVED_STATUSES = ['APPROVED', 'HR_APPROVED']

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = await requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])

    const { searchParams } = new URL(request.url)
    const staffRecordId = searchParams.get('staffRecordId')
    const staffId = searchParams.get('staffId')
    const year = Number(searchParams.get('year') || new Date().getFullYear())
    const requestedCompanyId = searchParams.get('companyId')

    if (!staffRecordId && !staffId) {
      return withCors(ApiResponse.error('staffRecordId or staffId is required', 400), origin)
    }

    const accessibleCompanies = await getAccessibleCompanies(user)
    if (accessibleCompanies.length === 0) {
      return withCors(ApiResponse.error('No companies assigned to your account', 403), origin)
    }
    const { targetCompanyIds, error } = resolveTargetCompanies(user, requestedCompanyId, accessibleCompanies)
    if (error) return withCors(ApiResponse.error(error, 403), origin)

    const staff = await prisma.staffRecord.findFirst({
      where: {
        companyId: { in: targetCompanyIds },
        ...(staffRecordId ? { id: staffRecordId } : { staffId: { equals: staffId as string, mode: 'insensitive' } })
      },
      select: { id: true, staffId: true, firstName: true, lastName: true, email: true, department: true, companyId: true }
    })

    if (!staff) {
      return withCors(ApiResponse.error('Staff member not found or not accessible', 404), origin)
    }

    const [balances, requests] = await Promise.all([
      prisma.staffLeaveBalance.findMany({
        where: { staffRecordId: staff.id, year },
        select: { totalDays: true, usedDays: true, pendingDays: true, carriedOver: true, leaveType: { select: { name: true } } },
        orderBy: { leaveType: { name: 'asc' } }
      }),
      prisma.leaveRequest.findMany({
        where: { staffRecordId: staff.id, startDate: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } },
        select: { id: true, referenceNumber: true, startDate: true, endDate: true, totalDays: true, status: true, currentStep: true, createdAt: true, leaveType: { select: { name: true } } },
        orderBy: { startDate: 'desc' }
      })
    ])

    const balanceRows = balances.map((b) => ({
      leaveType: b.leaveType.name,
      totalDays: b.totalDays,
      usedDays: b.usedDays,
      pendingDays: b.pendingDays,
      carriedOver: b.carriedOver,
      available: b.totalDays - b.usedDays - b.pendingDays
    }))

    const requestRows = requests.map((r) => ({
      referenceNumber: r.referenceNumber || '',
      leaveType: r.leaveType.name,
      startDate: r.startDate.toISOString().split('T')[0],
      endDate: r.endDate.toISOString().split('T')[0],
      totalDays: decimalToNumber(r.totalDays),
      status: r.status.replace(/_/g, ' '),
      stage: r.currentStep || '',
      appliedOn: r.createdAt.toISOString().split('T')[0]
    }))

    const approvedRequests = requests.filter((r) => APPROVED_STATUSES.includes(r.status))
    const totalDaysTaken = Number(approvedRequests.reduce((sum, r) => sum + decimalToNumber(r.totalDays), 0).toFixed(1))
    const pendingCount = requests.filter((r) => r.status === 'PENDING' || r.status === 'MANAGER_APPROVED').length
    const rejectedCount = requests.filter((r) => r.status === 'REJECTED').length

    const staffName = `${staff.firstName} ${staff.lastName}`.trim()
    const companyLabel = accessibleCompanies.find((c) => c.companyId === staff.companyId)?.companyName

    const balanceCols: ReportColumn[] = [
      { header: 'Leave Type', key: 'leaveType', type: 'text', width: 24 },
      { header: 'Entitlement', key: 'totalDays', type: 'number', width: 14 },
      { header: 'Used', key: 'usedDays', type: 'number', width: 12 },
      { header: 'Pending', key: 'pendingDays', type: 'number', width: 12 },
      { header: 'Carried Over', key: 'carriedOver', type: 'number', width: 14 },
      { header: 'Available', key: 'available', type: 'number', width: 12 }
    ]
    const requestCols: ReportColumn[] = [
      { header: 'Reference', key: 'referenceNumber', type: 'text', width: 18 },
      { header: 'Leave Type', key: 'leaveType', type: 'text', width: 20 },
      { header: 'Start', key: 'startDate', type: 'text', width: 14 },
      { header: 'End', key: 'endDate', type: 'text', width: 14 },
      { header: 'Days', key: 'totalDays', type: 'number', width: 10 },
      { header: 'Status', key: 'status', type: 'text', width: 18 },
      { header: 'Stage', key: 'stage', type: 'text', width: 14 },
      { header: 'Applied On', key: 'appliedOn', type: 'text', width: 14 }
    ]
    const profileRows = [
      { field: 'Staff Name', value: staffName },
      { field: 'Staff ID', value: staff.staffId },
      { field: 'Email', value: staff.email || 'N/A' },
      { field: 'Department', value: staff.department || 'No department' },
      { field: 'Report Year', value: String(year) }
    ]

    const buffer = await buildReportWorkbook({
      title: `Leave Report, ${staffName}`,
      subtitle: `${staff.staffId} · ${year}`,
      companyName: companyLabel,
      currency: 'NGN',
      kpis: [
        { label: 'Total Requests', value: requests.length },
        { label: 'Days Taken', value: totalDaysTaken },
        { label: 'Pending', value: pendingCount },
        { label: 'Rejected', value: rejectedCount }
      ],
      sheets: [
        { name: 'Profile', columns: [{ header: 'Field', key: 'field', type: 'text', width: 20 }, { header: 'Value', key: 'value', type: 'text', width: 40 }], rows: profileRows, totals: false },
        { name: 'Balances', columns: balanceCols, rows: balanceRows, totals: false },
        { name: 'Requests', columns: requestCols, rows: requestRows, totals: false }
      ]
    })

    const fileName = `Leave Report (${safeFileName(staffName)}) ${year}.xlsx`

    return withCors(
      new NextResponse(buffer as any, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': attachmentDisposition(fileName)
        }
      }),
      origin
    )
  } catch (err) {
    return withCors(handleApiError(err), origin)
  }
}
