// GET/POST/DELETE /api/admin/settings/handbook
// Manage the company's handbook PDF, shown to candidates during pre-offer
// onboarding. Stored on disk (public/company/<id>/handbook/...) — PDFs are
// too large for the base64-in-DB pattern used for the signature image.
import { NextRequest } from 'next/server'
import { promises as fs } from 'fs'
import * as path from 'path'
import { requireRole } from '@/app/lib/auth'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { getAccessibleCompanyIds, pickTargetCompanyId, mapCompanyAccessError, CompanyAccessUser } from '@/app/lib/company/company-access'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

function mapErr(error: any, origin: string | null) {
	const mapped = mapCompanyAccessError(error, origin)
	if (mapped) return mapped
	return withCors(handleApiError(error), origin)
}

export async function GET(req: NextRequest) {
	const origin = req.headers.get('origin')
	try {
		const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
		const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR']) as CompanyAccessUser
		const requested = new URL(req.url).searchParams.get('companyId')
		const accessible = await getAccessibleCompanyIds(user)
		const companyId = pickTargetCompanyId(user, accessible, requested)

		const company = await prisma.company.findUnique({
			where: { id: companyId },
			select: { handbookPath: true, handbookFileName: true, handbookUpdatedAt: true },
		})

		return withCors(ApiResponse.success(company || { handbookPath: null, handbookFileName: null, handbookUpdatedAt: null }), origin)
	} catch (e) { return mapErr(e, origin) }
}

export async function POST(req: NextRequest) {
	const origin = req.headers.get('origin')
	try {
		const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
		const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR']) as CompanyAccessUser
		const requested = new URL(req.url).searchParams.get('companyId')
		const accessible = await getAccessibleCompanyIds(user)
		const companyId = pickTargetCompanyId(user, accessible, requested)

		const form = await req.formData()
		const file = form.get('file') as File | null
		if (!file) return withCors(ApiResponse.error('No file provided', 400), origin)

		const ext = (file.name.split('.').pop() || '').toLowerCase()
		const isPdf = ext === 'pdf' || file.type === 'application/pdf'
		if (!isPdf) return withCors(ApiResponse.error('The company handbook must be a PDF', 400), origin)
		if (file.size > MAX_SIZE) return withCors(ApiResponse.error('Handbook file must be under 10 MB', 400), origin)

		const buffer = Buffer.from(await file.arrayBuffer())
		const uploadDir = path.join(process.cwd(), 'public', 'company', companyId, 'handbook')
		await fs.mkdir(uploadDir, { recursive: true })
		const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
		const fileName = `${Date.now()}_${safeName}`
		await fs.writeFile(path.join(uploadDir, fileName), buffer)
		const relativePath = `/company/${companyId}/handbook/${fileName}`

		// Best-effort cleanup of the previous file — never block the upload on this.
		const previous = await prisma.company.findUnique({ where: { id: companyId }, select: { handbookPath: true } })
		if (previous?.handbookPath) {
			fs.unlink(path.join(process.cwd(), 'public', previous.handbookPath)).catch(() => {})
		}

		const now = new Date()
		await prisma.company.update({
			where: { id: companyId },
			data: { handbookPath: relativePath, handbookFileName: file.name, handbookUpdatedAt: now },
		})

		return withCors(ApiResponse.success({ handbookPath: relativePath, handbookFileName: file.name, handbookUpdatedAt: now }, 'Handbook uploaded'), origin)
	} catch (e) { return mapErr(e, origin) }
}

export async function DELETE(req: NextRequest) {
	const origin = req.headers.get('origin')
	try {
		const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
		const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR']) as CompanyAccessUser
		const requested = new URL(req.url).searchParams.get('companyId')
		const accessible = await getAccessibleCompanyIds(user)
		const companyId = pickTargetCompanyId(user, accessible, requested)

		const company = await prisma.company.findUnique({ where: { id: companyId }, select: { handbookPath: true } })
		if (company?.handbookPath) {
			fs.unlink(path.join(process.cwd(), 'public', company.handbookPath)).catch(() => {})
		}

		await prisma.company.update({
			where: { id: companyId },
			data: { handbookPath: null, handbookFileName: null, handbookUpdatedAt: null },
		})

		return withCors(ApiResponse.success(null, 'Handbook removed'), origin)
	} catch (e) { return mapErr(e, origin) }
}
