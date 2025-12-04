//api/staff/upload/history
import { NextRequest } from 'next/server';
import { prisma } from '@/app/lib/db';
import { requireRole } from '@/app/lib/auth';
import { ApiResponse, handleApiError } from '@/app/lib/utils';
import { withCors } from '@/app/lib/cors';

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin');

  try {
    // 1) Ensure we have an Authorization header and a clean token string
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      );
    }

    const token = authHeader.replace('Bearer ', '');
    // Only HR, SUPER_ADMIN can use this endpoint
    const user = requireRole(token, ['HR', 'SUPER_ADMIN']);

    if (!user.companyId) {
      return withCors(
        ApiResponse.error('No company context for this user', 400),
        origin
      );
    }

    const companyId = user.companyId as string;

    // 2) Fetch staff upload data for the company
    const staffUploads = await prisma.staffUpload.findMany({
      where: { companyId },
      orderBy: {
        createdAt: 'desc', // Sort by date in descending order
      },
      select: {
        id: true,
        fileName: true,
        createdAt: true,
        uploadedBy: true,
        failed: true,
        successful: true,
      },
    });

    // 3) Return the response
    return withCors(
      ApiResponse.success(
        {
          uploads: staffUploads.map((upload) => ({
            uploadId: upload.id,
            fileName: upload.fileName,
            uploadedOn: upload.createdAt,
            uploadedBy: upload.uploadedBy,
            failed: upload.failed,
            successful: upload.successful,
            totalRecords: upload.successful + upload.failed,
          })),
        },
        'Staff upload records fetched successfully'
      ),
      origin
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
