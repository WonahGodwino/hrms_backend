import { NextRequest } from 'next/server';
import validator from 'validator';

import { requireRole } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { ApiResponse, formatError } from '@/app/lib/utils';

type RouteParams = {
	params: {
		id: string;
	};
};

// Helper function to sanitize encoded ID
function sanitizeEncodedId(encodedId: string | null): string | null {
	if (!encodedId) return null;
	// Allow alphanumeric and some special characters, but escape HTML
	const cleaned = encodedId.replace(/[^a-zA-Z0-9\-_]/g, '');
	return validator.escape(cleaned.trim());
}

async function verifyCompanyAccess(user: any, companyId: string): Promise<boolean> {
	if (user.role === 'SUPER_ADMIN') return true;

	try {
		const userCompany = await prisma.userCompany.findFirst({
			where: {
				userId: user.userId,
				companyId: companyId,
				OR: [{ role: user.role }, { role: 'ALL' }],
			},
		});
		return !!userCompany;
	} catch {
		return user.companyId === companyId;
	}
}

export async function OPTIONS(request: NextRequest) {
	return handleCorsOptions(request);
}

// Get a single dynamic template by ID
export async function GET(request: NextRequest, { params }: RouteParams) {
	const origin = request.headers.get('origin');

	try {
		const authHeader = request.headers.get('authorization');
		if (!authHeader) {
			return withCors(ApiResponse.error('Authorization header missing', 401), origin);
		}

		const token = authHeader.replace('Bearer ', '');
		const user = await requireRole(token, ['SUPER_ADMIN', 'HR', 'ADMIN']);

		// Sanitize and validate the ID parameter
		const templateId = sanitizeEncodedId(params.id);
		if (!templateId) {
			return withCors(ApiResponse.error('Invalid template ID', 400), origin);
		}

		// Get query parameters for optional access control
		const { searchParams } = new URL(request.url);
		const companyId = searchParams.get('companyId');

		// Fetch the template
		const template = await prisma.payrollTemplate.findUnique({
			where: {
				id: templateId,
			},
			include: {
				fields: {
					orderBy: { order: 'asc' },
				},
				_count: {
					select: {
						payrolls: true,
						payrollData: true,
						uploads: true,
						payrollUploads: true,
					},
				},
			},
		});

		// Check if template exists
		if (!template) {
			return withCors(ApiResponse.error('Template not found', 404), origin);
		}

		// Verify access to the template
		// System templates are accessible to all, custom templates require company access
		if (!template.isSystem) {
			// If companyId is provided in query, use it for verification
			const targetCompanyId = companyId || template.companyId;

			if (user.role !== 'SUPER_ADMIN') {
				const hasAccess = await verifyCompanyAccess(user, targetCompanyId);
				if (!hasAccess) {
					return withCors(ApiResponse.error('Access denied to this template', 403), origin);
				}
			}

			// Additional check: ensure the template belongs to the user's company
			if (user.role !== 'SUPER_ADMIN' && template.companyId !== targetCompanyId) {
				return withCors(ApiResponse.error('Template does not belong to your company', 403), origin);
			}
		}

		return withCors(ApiResponse.success(template, 'Template retrieved successfully'), origin);
	} catch (error) {
		console.error('Error fetching template:', error);
		return withCors(ApiResponse.error(formatError(error), 500), origin);
	}
}
