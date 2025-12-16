// src/app/api/jobs/public/apply/route.ts

import { NextRequest } from 'next/server';
import { prisma } from '@/app/lib/db';
import { ApiResponse, formatError } from '@/app/lib/utils';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { fileTypeFromBuffer } from 'file-type';
import mammoth from 'mammoth';
import { v4 as uuidv4 } from 'uuid';

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');

  try {
    // Parse incoming form data using a multipart parser (formidable can be replaced with other libraries if preferred)
    const formData = await request.formData();

    const jobId = formData.get('jobId')?.toString();
    const firstName = formData.get('firstName')?.toString();
    const lastName = formData.get('lastName')?.toString();
    const email = formData.get('email')?.toString();
    const cvFile = formData.get('cv') as File | null;

    // Validate required fields
    if (!jobId || !firstName || !lastName || !email || !cvFile) {
      return withCors(ApiResponse.error('Job ID, first name, last name, email, and CV are required', 400), origin);
    }

    // Check if the job exists
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, expirationDate: true, status: true },
    });

    if (!job) {
      return withCors(ApiResponse.error('Job not found', 404), origin);
    }

    // Check if the job has expired
    if (job.expirationDate < new Date()) {
      return withCors(ApiResponse.error('Job posting has expired', 400), origin);
    }

    // Validate file type and size (limit to 5MB)
    if (cvFile.size > 5 * 1024 * 1024) {
      return withCors(ApiResponse.error('CV file size exceeds the 5MB limit', 400), origin);
    }

    // Check MIME type of the uploaded file
    const fileBuffer = await cvFile.arrayBuffer();
    const fileType = await fileTypeFromBuffer(fileBuffer);

    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (!fileType || !allowedMimeTypes.includes(fileType.mime)) {
      return withCors(ApiResponse.error('Invalid file type. Allowed formats are .pdf, .doc, .docx', 400), origin);
    }

    // Basic PDF validation - check if it starts with PDF header
    if (fileType.mime === 'application/pdf') {
      const pdfHeader = Buffer.from(fileBuffer.slice(0, 4)).toString();
      if (pdfHeader !== '%PDF') {
        return withCors(ApiResponse.error('Invalid PDF file format', 400), origin);
      }
    }

    // Parse the content of the file to check for malicious code (DOC/DOCX only)
    let parsedContent = '';
    if (fileType.mime === 'application/msword' || fileType.mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const docxData = await mammoth.extractRawText({ buffer: Buffer.from(fileBuffer) });
      parsedContent = docxData.value;

      // Simple content validation to avoid executable scripts or malicious content
      if (parsedContent.includes('<script>') || parsedContent.includes('eval(')) {
        return withCors(ApiResponse.error('File contains potentially harmful content', 400), origin);
      }
    }

    // Generate a unique filename for the CV (for database storage)
    const fileExtension = cvFile.name.split('.').pop();
    const fileName = `${uuidv4()}.${fileExtension}`;

    // Create the candidate file and store the file directly in the database
    const candidateFile = await prisma.candidateFile.create({
      data: {
        companyId: job.companyId, // assuming the job's companyId can be used for candidate files
        candidateId: '', // This would need to be associated with the candidate, if needed
        applicationId: jobId, // Relate to the job application
        fileName,
        mimeType: fileType.mime,
        sizeBytes: cvFile.size,
        data: Buffer.from(fileBuffer),
        type: 'CV', // Assuming 'CV' as the file type, can be expanded
      },
    });

    // Create the job application entry
    const application = await prisma.jobApplication.create({
      data: {
        jobId: job.id,
        firstName,
        lastName,
        email,
        cvFileName: fileName,
        status: 'PENDING',
        files: {
          connect: { id: candidateFile.id },
        },
      },
    });

    return withCors(ApiResponse.success(application, 'Application submitted successfully'), origin);
  } catch (error) {
    const message = formatError(error);
    return withCors(ApiResponse.error(message, 500), origin);
  }
}
