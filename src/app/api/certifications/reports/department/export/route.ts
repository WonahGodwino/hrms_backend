import { NextRequest } from 'next/server';

import { getCorsHeaders, handleCorsOptions } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { requireModuleAccess } from '@/app/lib/module-access';
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company';
import { ApiResponse, handleApiError } from '@/app/lib/utils';

export async function OPTIONS(req: NextRequest) {
	return handleCorsOptions(req);
}

// GET /api/certifications/reports/department/export?companyId=&department=&search=&status=
export async function GET(req: NextRequest) {
	const origin = req.headers.get('origin');
	try {
		const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null;
		const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER']);

		const { searchParams } = new URL(req.url);
		const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'));
		if (isCompanyError(resolved)) return new Response(JSON.stringify({ success: false, message: resolved.error.message }), { status: resolved.error.status });
		const { companyId } = resolved;
		const department = searchParams.get('department');
		const search = searchParams.get('search')?.trim();
		const status = searchParams.get('status');

		const where: any = { companyId };
		if (department) where.employee = { department };
		if (status) where.status = status;
		if (search) where.AND = [{ OR: [{ certIdNumber: { contains: search, mode: 'insensitive' } }] }];

		const items = await prisma.certificationRecord.findMany({
			where,
			include: { employee: { select: { firstName: true, lastName: true, email: true, department: true } }, certificationType: { select: { name: true } } },
			orderBy: { issueDate: 'desc' },
			take: 5000,
		});

		// CSV header
		const header = ['id', 'employeeName', 'email', 'department', 'certification', 'issueDate', 'expiryDate', 'status'];
		const rows = items.map((i) => [
			i.id,
			`${i.employee.firstName} ${i.employee.lastName}`,
			i.employee.email,
			i.employee.department || '',
			i.certificationType.name,
			i.issueDate.toISOString(),
			i.expiryDate ? i.expiryDate.toISOString() : '',
			i.status,
		]);

		const csv = [header.join(','), ...rows.map((r) => r.map((c) => String(c).replace(/\n/g, ' ')).join(','))].join('\n');

		const corsHeaders = getCorsHeaders(origin);
		return new Response(csv, {
			status: 200,
			headers: {
				'Content-Type': 'text/csv',
				'Content-Disposition': 'attachment; filename="department_report.csv"',
				...corsHeaders,
			},
		});
	} catch (e) {
		return new Response(JSON.stringify(handleApiError(e)), { status: 500 });
	}
}
