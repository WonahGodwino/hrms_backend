import { NextRequest } from 'next/server';

import { getCorsHeaders, handleCorsOptions } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { requireModuleAccess } from '@/app/lib/module-access';
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company';

export async function OPTIONS(req: NextRequest) {
	return handleCorsOptions(req);
}

// GET /api/certifications/reports/risk/export?companyId=&riskLevel=&department=&certType=&search=
export async function GET(req: NextRequest) {
	const origin = req.headers.get('origin');
	try {
		const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null;
		const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER']);

		const { searchParams } = new URL(req.url);
		const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'));
		if (isCompanyError(resolved)) return new Response(resolved.error.message, { status: resolved.error.status, headers: getCorsHeaders(origin) });
		const { companyId } = resolved;
		const riskLevel = searchParams.get('riskLevel');
		const department = searchParams.get('department');
		const certType = searchParams.get('certType');
		const search = searchParams.get('search')?.trim();

		const where: any = { companyId, status: { not: 'Archived' } };
		if (department) where.employee = { department };
		if (certType) where.certificationType = { type: certType };
		if (search) where.AND = [{ OR: [{ certIdNumber: { contains: search, mode: 'insensitive' } }] }];

		const items = await prisma.certificationRecord.findMany({
			where,
			include: { employee: { select: { firstName: true, lastName: true, email: true, department: true } }, certificationType: true, documents: true },
			take: 5000,
		});

		// classify risk for export
		const now = new Date();
		const rows = items.map((i) => {
			const daysToExpiry = i.expiryDate ? Math.ceil((i.expiryDate.getTime() - now.getTime()) / 86_400_000) : null;
			const hasDoc = i.hasDocument || (i.documents && i.documents.length > 0);
			let level = 'Safe';
			if (!hasDoc || (daysToExpiry !== null && daysToExpiry <= 0) || (daysToExpiry !== null && daysToExpiry <= 7)) level = 'Risk';
			else if (daysToExpiry !== null && daysToExpiry <= 30) level = 'Warning';
			return [
				i.id,
				`${i.employee.firstName} ${i.employee.lastName}`,
				i.employee.email,
				i.employee.department || '',
				i.certificationType.name,
				level,
				i.issueDate?.toISOString() ?? '',
				i.expiryDate?.toISOString() ?? '',
				i.status,
			];
		});

		const header = ['id', 'employeeName', 'email', 'department', 'certification', 'riskLevel', 'issueDate', 'expiryDate', 'status'];
		const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');

		const corsHeaders = getCorsHeaders(origin);
		return new Response(csv, { status: 200, headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="risk_report.csv"', ...corsHeaders } });
	} catch (e) {
		return new Response('Internal error', { status: 500 });
	}
}
