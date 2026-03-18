//api/recruitment/jobs/[id]/edit/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

type UpdateJobBody = {
	title?: string
	description?: string
	department?: string
	position?: string
	expirationDate?: string | null
}

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
			user = requireRole(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
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

		if (typeof body.title === 'string') {
			const title = body.title.trim()
			if (!title) {
				return withCors(ApiResponse.error('Title cannot be empty', 400), origin)
			}
			data.title = title
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