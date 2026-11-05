import ExcelJS from 'exceljs';
import { mkdir, writeFile } from 'fs/promises';
// src/app/api/staff/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

import { requireRole } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { logBulkChange } from '@/app/lib/core-setup/audit';
import { prisma } from '@/app/lib/db';
import { reconcileStaffDepartmentLink } from '@/app/lib/departments/department-sync';
import { buildSubtitle, confidentialFooter, findHeaderRow, toneCell, writeStyledTable, addInstructionsSheet, attachmentDisposition, safeFileName, XLSX_MIME } from '@/app/lib/excel/sheet-theme';
import { STAFF_PENSION_COLUMNS, STAFF_GROSS_COLUMN, PENSION_SAMPLE, PENSION_NOTES } from '@/app/lib/staff/pension-fields';
import { getUserDisplayName } from '@/app/lib/departments/department-utils';
import { reconcileStaffDesignationLink } from '@/app/lib/designations/designation-sync';
import { createNotification, NOTIFICATION_TYPES } from '@/app/lib/notifications/helpers';
import { saveInitialGrossCompensation } from '@/app/lib/staff/gross-compensation';
import { resolveStaffUploadContext } from '@/app/lib/staff/upload-access';
import { parseStaffUpload } from '@/app/lib/staff/upload-parser';
import { missingRequiredColumns, validateStaffRows } from '@/app/lib/staff/upload-validator';
import { ApiResponse, handleApiError } from '@/app/lib/utils';
import { assertStaffCapacity, recordStaffCreated } from '@/app/lib/trial/guard';

function getRelativePath(absolutePath: string): string {
	const projectRoot = process.cwd();
	if (absolutePath.startsWith(projectRoot)) {
		return path.relative(projectRoot, absolutePath);
	}
	return absolutePath;
}

// -----------------------------
// CORS preflight
// -----------------------------
export async function OPTIONS(request: NextRequest) {
	return handleCorsOptions(request);
}

// -----------------------------
// POST – upload staff Excel/CSV and create StaffRecord rows
// -----------------------------
export async function POST(request: NextRequest) {
	const origin = request.headers.get('origin');

	try {
		const formData = await request.formData();
		const ctx = await resolveStaffUploadContext(request, formData);
		if (!ctx.ok) {
			return withCors(ApiResponse.error(ctx.message, ctx.status), origin);
		}
		const { authUser, companyId, company, file } = ctx;

		const bytes = await file.arrayBuffer();
		const buffer = Buffer.from(bytes);

		const parsed = await parseStaffUpload(file.name, file.type, bytes);
		if (!parsed.ok) {
			return withCors(ApiResponse.error(parsed.error, 400), origin);
		}

		const missingColumns = missingRequiredColumns(parsed.columns);
		if (missingColumns.length > 0) {
			return withCors(ApiResponse.error(`Missing required columns: ${missingColumns.join(', ')}. Found columns: ${parsed.columns.join(', ')}`, 400), origin);
		}

		// The same rules the drawer's validate step ran, so nothing slips through if that step was skipped.
		const validated = await validateStaffRows(parsed.rows, companyId);

		// Free trial: a file that takes the company past the staff cap is rejected whole.
		await assertStaffCapacity(companyId, validated.filter((v) => v.errors.length === 0).length);

		const results = {
			successful: 0,
			failed: 0,
			errors: [] as string[],
			failedRecords: [] as any[],
			records: [] as any[],
		};

		const performedByName = await getUserDisplayName(authUser);

		for (const item of validated) {
			const row = item.raw;
			const displayRow = item.sheetRow;
			let errorMessage = '';

			try {
				if (item.errors.length > 0) {
					errorMessage = item.errors.map((e) => e.message).join(' ');
					throw new Error(errorMessage);
				}

				const { staffId, email, firstName, lastName, department, position, phone, bankName, accountNumber, bvn, gross, pension, hireDate, nsitfIdentity } = item.fields;

				const staffRecord = await prisma.staffRecord.create({
					data: {
						staffId,
						email,
						firstName: firstName.trim(),
						lastName: lastName.trim(),
						department: department.trim(),
						position: position.trim(),
						phone: phone ? phone.trim() : undefined,
						bankName: bankName ? bankName.trim() : undefined,
						accountNumber: accountNumber ? accountNumber.trim() : undefined,
						bvn: bvn ? bvn.trim() : undefined,
							...pension,
							...nsitfIdentity,
							companyId: companyId!,
						createdBy: authUser.userId,
						isActive: true,
						// Defaults tenure reporting to "date added to the system" for
						// every new hire going forward when DATE_OF_EMPLOYMENT isn't
						// uploaded — only staff that existed before this field was
						// introduced need backfilling.
						hireDate: hireDate || new Date(),
					},
				});

				await recordStaffCreated(companyId, staffRecord.id);

				// In-app welcome notification for newly onboarded staff.
				await createNotification(
					staffRecord.id,
					NOTIFICATION_TYPES.WELCOME_STAFF,
					`Welcome to ${company.companyName}`,
					`Hi ${staffRecord.firstName} ${staffRecord.lastName}, welcome to ${company.companyName}. We are excited to have you on board.`,
					{
						source: 'STAFF_UPLOAD',
						companyName: company.companyName,
						staffId: staffRecord.staffId,
					},
					companyId as string
				);

				// Staff Management is the source of truth for department — auto-
				// create/link the matching Department. A sync hiccup must never
				// fail the staff creation itself.
				try {
					await reconcileStaffDepartmentLink(
						staffRecord.id,
						companyId!,
						staffRecord.department,
						staffRecord.departmentId,
						staffRecord.position,
						authUser.userId,
						performedByName
					);
					await reconcileStaffDesignationLink({
						staffId: staffRecord.id,
						companyId: companyId!,
						rawPosition: staffRecord.position,
						currentDesignationId: staffRecord.designationId,
					});
				} catch (syncError) {
					console.error('[STAFF_UPLOAD] Department/designation sync error:', syncError);
				}

				// Seed the Compensation profile with Gross when the column was
				// filled in — optional, and a sync hiccup (e.g. no payroll
				// template configured yet) must never fail the row's import.
				try {
					await saveInitialGrossCompensation({
						staffId: staffRecord.id,
						companyId: companyId!,
						gross,
						updatedBy: authUser.userId,
					});
				} catch (grossError) {
					console.error('[STAFF_UPLOAD] Gross compensation seed error:', grossError);
				}

				results.records.push(staffRecord);
				results.successful++;
			} catch (error: any) {
				results.failed++;

				if (!errorMessage) {
					if (error.code === 'P2002') {
						const target = error.meta?.target || [];
						if (target.includes('staffId')) {
							errorMessage = `This Staff ID already exists in the system. Please review the Staff ID and try again.`;
						} else if (target.includes('email')) {
							errorMessage = `This email address is already registered. Please review the email and try again.`;
						} else {
							errorMessage = `A staff record with this information already exists. Please review the details and try again.`;
						}
					} else {
						errorMessage = error?.message || 'An error occurred while processing this record. Please check the data and try again.';
					}
				}

				results.errors.push(`Row ${displayRow}: ${errorMessage}`);

				results.failedRecords.push({
					...row,
					ROW_NUMBER: displayRow,
					ERROR_MESSAGE: errorMessage,
					STATUS: 'FAILED',
				});
			}
		}

		const { baseDir, uploadsDir } = await ensureUploadDirectories();
		const staffDir = path.join(uploadsDir, 'staff');
		await mkdir(staffDir, { recursive: true });

		const fileName = `staff-upload-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
		const savedFilePath = path.join(staffDir, fileName);
		const relativeFilePath = getRelativePath(savedFilePath);

		let failedRecordsFilePath: string | null = null;
		if (results.failedRecords.length > 0) {
			const failedWorkbook = new ExcelJS.Workbook();
			failedWorkbook.creator = '24/7HR';
			const failedWorksheet = failedWorkbook.addWorksheet('Failed Records');

			const headersSet = new Set<string>();
			results.failedRecords.forEach((record) => {
				Object.keys(record).forEach((key) => headersSet.add(key));
			});

			headersSet.add('ROW_NUMBER');
			headersSet.add('ERROR_MESSAGE');
			headersSet.add('STATUS');

			const headers = Array.from(headersSet);
			const errorColIndex = headers.indexOf('ERROR_MESSAGE');
			writeStyledTable(failedWorksheet, {
				title: 'Failed Staff Records',
				subtitle: buildSubtitle([company.companyName, file.name, `${results.failedRecords.length} failed`]),
				columns: headers.map((header) => ({
					header,
					key: header,
					width: header === 'ERROR_MESSAGE' ? 50 : 20,
					align: 'left' as const,
				})),
				rows: results.failedRecords,
				onRow: (row) => toneCell(row.getCell(errorColIndex + 1), 'danger'),
				footer: confidentialFooter(company.companyName),
			});

			const failedFileName = `staff-upload-failed-${Date.now()}.xlsx`;
			const failedFilePath = path.join(staffDir, failedFileName);
			const failedBuffer = await failedWorkbook.xlsx.writeBuffer();
			await writeFile(failedFilePath, Buffer.from(failedBuffer as any));
			failedRecordsFilePath = getRelativePath(failedFilePath);
		}

		const uploadRecord = await prisma.staffUpload.create({
			data: {
				companyId: companyId!,
				fileName: file.name,
				filePath: relativeFilePath,
				processedFilePath: failedRecordsFilePath,
				processedFileName: failedRecordsFilePath ? path.basename(failedRecordsFilePath) : null,
				totalRecords: validated.length,
				successful: results.successful,
				failed: results.failed,
				errors: results.errors,
				uploadedBy: authUser.userId,
				status: 'COMPLETED',
				startedAt: new Date(),
				completedAt: new Date(),
			},
		});

		await writeFile(savedFilePath, buffer);

		if (companyId && (results.successful || results.failed)) {
			await logBulkChange(request, authUser, { companyId, label: 'Staff upload', created: results.successful, skipped: results.failed, area: 'staff' });
		}

		const responseData = {
			results,
			uploadId: uploadRecord.id,
			summary: {
				totalProcessed: validated.length,
				successful: results.successful,
				failed: results.failed,
				userRole: authUser.role,
				companyId: companyId,
				companyName: company.companyName,
			},
			downloadLinks: {
				failedRecords: results.failedRecords.length > 0 ? `/api/staff/download-failed/${uploadRecord.id}` : null,
			},
			...(results.failed > 0 && {
				failedRecordsInfo: `${results.failed} records failed. Download the failed records file for details.`,
			}),
		};

		return withCors(ApiResponse.success(responseData, `Staff records processing completed. Successful: ${results.successful}, Failed: ${results.failed}`), origin);
	} catch (error) {
		return withCors(handleApiError(error), origin);
	}
}

// -----------------------------
// GET – download staff template using ExcelJS
// -----------------------------
export async function GET(request: NextRequest) {
	const origin = request.headers.get('origin');

	try {
		const authHeader = request.headers.get('authorization');
		if (!authHeader) {
			return withCors(ApiResponse.error('Authorization header missing', 401), origin);
		}

		const token = authHeader.replace('Bearer ', '');
		const authUser = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN']);

		let companyInfo = null;
		if (authUser.role === 'HR' && authUser.companyId) {
			companyInfo = await prisma.company.findUnique({
				where: { id: authUser.companyId },
				select: { companyName: true },
			});
		}

		const { searchParams } = new URL(request.url);
		const action = searchParams.get('action');

		if (action === 'template') {
			const workbook = new ExcelJS.Workbook();
			workbook.creator = '24/7HR';
			const worksheet = workbook.addWorksheet('Staff Records');

			const notes = [
				'staffId: Unique staff identifier (REQUIRED), can include letters, numbers, hyphens, underscores',
				'email: Valid email address (REQUIRED)',
				'firstName, lastName: Staff names (REQUIRED)',
				'department, position: Staff details (REQUIRED)',
				'phone, bankName, accountNumber, bvn: Optional fields',
				...PENSION_NOTES,
			];
			if (authUser.role === 'ADMIN' || authUser.role === 'SUPER_ADMIN') {
				notes.push('ADMIN/SUPER_ADMIN: Select company before uploading');
			}

			// Header sits on row 4 under the title band; the POST handler finds it with findHeaderRow().
			writeStyledTable(worksheet, {
				title: 'Staff Upload Template',
				subtitle: buildSubtitle([companyInfo?.companyName, 'Upload staff records for your company only', 'Replace the sample rows']),
				columns: [
					{ header: 'staffId', key: 'staffId', width: 22, align: 'left' },
					{ header: 'email', key: 'email', width: 28, align: 'left' },
					{ header: 'firstName', key: 'firstName', width: 16, align: 'left' },
					{ header: 'lastName', key: 'lastName', width: 16, align: 'left' },
					{ header: 'department', key: 'department', width: 22, align: 'left' },
					{ header: 'position', key: 'position', width: 22, align: 'left' },
					{ header: 'phone', key: 'phone', width: 16, align: 'left' },
					{ header: 'bankName', key: 'bankName', width: 20, align: 'left' },
					{ header: 'accountNumber', key: 'accountNumber', width: 20, align: 'left' },
					{ header: 'bvn', key: 'bvn', width: 16, align: 'left' },
					STAFF_GROSS_COLUMN,
					...STAFF_PENSION_COLUMNS,
				],
				rows: [
					{ staffId: 'Opay-Owallet-1563001', email: 'john.doe@company.com', firstName: 'John', lastName: 'Doe', department: 'Customer Service', position: 'CSR', phone: '+2348012345678', bankName: 'GTBank', accountNumber: '0123456789', bvn: '12345678901', gross: '250000', ...PENSION_SAMPLE },
					{ staffId: 'EMP002', email: 'jane.smith@company.com', firstName: 'Jane', lastName: 'Smith', department: 'Sales', position: 'Telesales Agent', phone: '+2348098765432', bankName: 'First Bank', accountNumber: '9876543210', bvn: '10987654321', gross: '', rsaPin: '', pfaCode: '' },
					{ staffId: 'STAFF_2025_0042', email: 'peter.jones@company.com', firstName: 'Peter', lastName: 'Jones', department: 'IT', position: 'Developer', phone: '+2348123456789', bankName: 'UBA', accountNumber: '4567890123', bvn: '45678901234', gross: '400000', rsaPin: '', pfaCode: '' },
				],
				autoFilter: false,
			});

			addInstructionsSheet(workbook, {
				title: 'Staff Upload Instructions',
				subtitle: buildSubtitle([companyInfo?.companyName, 'Read before filling the Staff Records sheet']),
				sections: [{ heading: 'Important notes', lines: [...notes, 'Replace the sample rows with your own data, one staff member per row, starting on row 5'] }],
			});

			const buffer = await workbook.xlsx.writeBuffer();

			const excelResponse = new NextResponse(buffer as any, {
				headers: {
					'Content-Type': XLSX_MIME,
					'Content-Disposition': attachmentDisposition(`Staff Upload Template${companyInfo ? ` (${safeFileName(companyInfo.companyName)})` : ''}.xlsx`),
					'Cache-Control': 'no-cache',
				},
			});

			return withCors(excelResponse, origin);
		}

		return withCors(ApiResponse.error('Invalid action'), origin);
	} catch (error) {
		return withCors(handleApiError(error), origin);
	}
}

// -----------------------------
// Helper function for upload directories
// -----------------------------
async function ensureUploadDirectories() {
	const baseDir = process.cwd();
	const uploadsDir = path.join(baseDir, 'uploads');

	await mkdir(uploadsDir, { recursive: true });

	return { baseDir, uploadsDir };
}
