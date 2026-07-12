//api/recruitment/jobs/[id]/edit/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { sanitizeOfferDefaults } from '@/app/lib/jobs/offer-defaults'

type UpdateJobBody = {
	title?: string
	description?: string
	department?: string
	position?: string
	expirationDate?: string | null
	offerDefaults?: Record<string, unknown>
	employmentType?: string | null
	workplaceType?: string | null
	experienceLevel?: string | null
	salaryRange?: string | null
	locations?: unknown
	status?: string
	designationId?: string | null
	departmentId?: string | null
}

const ALLOWED_STATUSES = ['ACTIVE', 'DRAFT', 'CLOSED', 'EXPIRED']

function extractBearerToken(authHeader: string | null): string | null {
	if (!authHeader) return null
	const match = authHeader.match(/^Bearer\s+(.+)$/i)
	return match?.[1]?.trim() || null
}

function mapAuthErrorStatus(message: string): number {
	return message.toLowerCase().includes('insufficient permissions') ? 403 : 401
}

function parseDate(value?: string | null): Date | null {
	if (value === undefined || value === null) return null
	const trimmed = value.trim()
	if (!trimmed) return null
	const parsed = new Date(trimmed)
	return Number.isNaN(parsed.getTime()) ? null : parsed
}

async function checkJobPermission(user: any, companyId: string): Promise<boolean> {
	if (user.role === 'SUPER_ADMIN') return true

	if (user.role === 'ADMIN') {
		const userCompany = await prisma.userCompany.findFirst({
			where: {
				userId: user.userId,
				companyId,
				role: { in: ['ADMIN', 'ALL'] },
			},
			select: { id: true },
		})
		return !!userCompany
	}

	if (user.role === 'HR') {
		return user.companyId === companyId
	}

	return false
}

export async function OPTIONS(request: NextRequest) {
	return handleCorsOptions(request)
}

// Edit one job at a time.
export async function PUT(
	request: NextRequest,
	{ params }: { params: { id: string } }
) {
	const origin = request.headers.get('origin')
	const jobId = params.id

	try {
		const token = extractBearerToken(request.headers.get('authorization'))
		if (!token) {
			return withCors(ApiResponse.error('Invalid or missing Authorization header', 401), origin)
		}

		let user
		try {
			user = await requireModuleAccess(token, 'RECRUITMENT', ['HR', 'ADMIN', 'SUPER_ADMIN'])
		} catch (authError) {
			const message = formatError(authError)
			return withCors(ApiResponse.error(message, mapAuthErrorStatus(message)), origin)
		}

		let body: UpdateJobBody
		try {
			body = (await request.json()) as UpdateJobBody
		} catch {
			return withCors(ApiResponse.error('Invalid JSON body', 400), origin)
		}

		const job = await prisma.job.findFirst({
			where: {
				id: jobId,
				company: { archived: 0 },
			},
			select: {
				id: true,
				companyId: true,
				status: true,
				_count: {
					select: { applications: true },
				},
			},
		})

		if (!job) {
			return withCors(ApiResponse.error('Job not found', 404), origin)
		}

		const hasPermission = await checkJobPermission(user, job.companyId)
		if (!hasPermission) {
			return withCors(ApiResponse.error('You cannot update this job', 403), origin)
		}

		const data: Record<string, unknown> = {
			updatedBy: user.userId,
			updatedAt: new Date(),
		}

		// Resolve the designation this vacancy recruits for. Its name is the
		// fallback title/position when the author leaves the title blank.
		let designationTitle: string | null = null
		if (body.designationId !== undefined) {
			const desigId = body.designationId ? String(body.designationId).trim() : ''
			if (desigId) {
				const designation = await (prisma as any).designation.findFirst({
					where: { id: desigId, companyId: job.companyId },
					select: { id: true, title: true },
				})
				if (!designation) {
					return withCors(ApiResponse.error('Selected designation was not found for this company', 400), origin)
				}
				data.designationId = desigId
				designationTitle = designation.title
			} else {
				data.designationId = null
			}
		}

		if (typeof body.title === 'string') {
			const title = body.title.trim()
			if (!title) {
				// Blank title falls back to the designation name (if one is set).
				if (!designationTitle) {
					return withCors(ApiResponse.error('Enter a job title or select a designation', 400), origin)
				}
				data.title = designationTitle
			} else {
				data.title = title
			}
			// Keep position aligned with the title unless one is explicitly provided.
			if (typeof body.position !== 'string' || !body.position.trim()) {
				data.position = data.title
			}
		}

		if (typeof body.description === 'string') {
			const description = body.description.trim()
			if (!description) {
				return withCors(ApiResponse.error('Description cannot be empty', 400), origin)
			}
			data.description = description
		}

		if (typeof body.department === 'string') {
			const department = body.department.trim()
			if (!department) {
				return withCors(ApiResponse.error('Department cannot be empty', 400), origin)
			}
			data.department = department
		}

		// Keep the department FK in sync — prefer an explicit id, else resolve by
		// the (new or existing) department name within the company.
		if (body.departmentId !== undefined || typeof body.department === 'string') {
			let deptId: string | null = null
			const requestedDeptId = body.departmentId ? String(body.departmentId).trim() : ''
			if (requestedDeptId) {
				const dep = await prisma.department.findFirst({
					where: { id: requestedDeptId, companyId: job.companyId },
					select: { id: true },
				})
				deptId = dep?.id || null
			} else if (typeof body.department === 'string' && body.department.trim()) {
				const dep = await prisma.department.findFirst({
					where: { companyId: job.companyId, name: { equals: body.department.trim(), mode: 'insensitive' } },
					select: { id: true },
				})
				deptId = dep?.id || null
			}
			data.departmentId = deptId
		}

		if (typeof body.position === 'string') {
			const position = body.position.trim()
			if (!position) {
				return withCors(ApiResponse.error('Position cannot be empty', 400), origin)
			}
			data.position = position
		}

		if (body.expirationDate !== undefined) {
			if (body.expirationDate === null || body.expirationDate.trim() === '') {
				data.expirationDate = null
			} else {
				const parsedDate = parseDate(body.expirationDate)
				if (!parsedDate) {
					return withCors(ApiResponse.error('Invalid expirationDate. Use a valid date string.', 400), origin)
				}
				data.expirationDate = parsedDate
			}
		}

		if (body.offerDefaults !== undefined) {
			// Merge the whitelisted employment-term defaults for the offer letter.
			data.offerDefaults = sanitizeOfferDefaults(body.offerDefaults) ?? undefined
		}

		// Optional string fields — empty string clears them to null.
		const optionalStrings: Array<keyof UpdateJobBody> = [
			'employmentType',
			'workplaceType',
			'experienceLevel',
			'salaryRange',
		]
		for (const field of optionalStrings) {
			const value = body[field]
			if (value !== undefined) {
				data[field] = typeof value === 'string' && value.trim() ? value.trim() : null
			}
		}

		if (body.locations !== undefined) {
			// Persist the postings array as-is (Json column); strip any UI-only keys.
			if (Array.isArray(body.locations)) {
				data.locations = body.locations
					.map((loc: any) => ({ state: loc?.state ?? '', lga: loc?.lga ?? '' }))
					.filter((loc: any) => loc.state || loc.lga)
			} else {
				data.locations = body.locations ?? null
			}
		}

		if (body.status !== undefined) {
			const status = String(body.status).trim().toUpperCase()
			if (!ALLOWED_STATUSES.includes(status)) {
				return withCors(ApiResponse.error('Invalid status value', 400), origin)
			}
			data.status = status
		}

		if (Object.keys(data).length === 2) {
			return withCors(ApiResponse.error('No editable fields were provided', 400), origin)
		}

		const updatedJob = await prisma.job.update({
			where: { id: jobId },
			data,
			select: {
				id: true,
				title: true,
				description: true,
				department: true,
				position: true,
				companyId: true,
				status: true,
				expirationDate: true,
				updatedAt: true,
				updatedBy: true,
				company: {
					select: {
						id: true,
						companyName: true,
					},
				},
			},
		})

		return withCors(
			ApiResponse.success(
				{
					...updatedJob,
					applicationCount: job._count.applications,
					editedBy: user.userId,
					editedAt: updatedJob.updatedAt,
				},
				'Job updated successfully'
			),
			origin
		)
	} catch (error) {
		const message = formatError(error)
		console.error('[JOB_EDIT] Error:', error)
		return withCors(ApiResponse.error(message, 500), origin)
	}
}