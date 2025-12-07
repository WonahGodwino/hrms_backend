// src/app/api/jobs/public/apply/route.ts

import { NextRequest } from 'next/server';
import { prisma } from '@/app/lib/db';
import { ApiResponse, formatError } from '@/app/lib/utils';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileTypeFromBuffer } from 'file-type';
import mammoth from 'mammoth';

// Try different ways to import pdf-parse
let pdfParseFn: (buffer: Buffer) => Promise<{ text: string }>;

try {
  // Method 1: Try to import as CommonJS module
  const pdfParseModule = require('pdf-parse');
  pdfParseFn = pdfParseModule.default || pdfParseModule;
} catch {
  // Method 2: Dynamic import with fallback
  pdfParseFn = async (buffer: Buffer) => {
    const module = await import('pdf-parse');
    return (module.default || module)(buffer);
  };
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');

  try {
    // Parse form data with formidable (including files)
    const form = formidable({
      maxFileSize: 5 * 1024 * 1024, // 5 MB size limit
      uploadDir: path.join(process.cwd(), 'uploads'),
      keepExtensions: true,
    });

    // Parse the incoming request data
    const parsedData = await new Promise((resolve, reject) => {
      form.parse(request, (err, fields, files) => {
        if (err) reject(err);
        resolve({ fields, files });
      });
    });

    const { fields, files } = parsedData as any;
    const jobId = fields.jobId as string;
    const firstName = fields.firstName as string;
    const lastName = fields.lastName as string;
    const email = fields.email as string;
    const cv = files.cv[0] as formidable.File | null;

    // Validate required fields
    if (!jobId || !firstName || !lastName || !email) {
      return withCors(
        ApiResponse.error('Job ID, first name, last name, and email are required', 400),
        origin
      );
    }

    // Check if the job exists
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, expirationDate: true, status: true },
    });

    if (!job) {
      return withCors(
        ApiResponse.error('Job not found', 404),
        origin
      );
    }

    // Check if the job has expired
    if (job.expirationDate < new Date()) {
      return withCors(
        ApiResponse.error('Job posting has expired', 400),
        origin
      );
    }

    // Validate file type and size
    if (!cv) {
      return withCors(
        ApiResponse.error('CV file is required', 400),
        origin
      );
    }

    // Check file size limit
    if (cv.size > 5 * 1024 * 1024) {
      return withCors(
        ApiResponse.error('CV file size exceeds the 5MB limit', 400),
        origin
      );
    }

    // Check MIME type of the uploaded file
    const fileBuffer = fs.readFileSync(cv.filepath);
    const fileType = await fileTypeFromBuffer(fileBuffer);

    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (!fileType || !allowedMimeTypes.includes(fileType.mime)) {
      return withCors(
        ApiResponse.error('Invalid file type. Allowed formats are .pdf, .doc, .docx', 400),
        origin
      );
    }

    // Parse the content of the file to check for malicious code
    let parsedContent = '';
    
    if (fileType.mime === 'application/pdf') {
      const pdfData = await pdfParseFn(fileBuffer);
      parsedContent = pdfData.text;
    } else if (
      fileType.mime === 'application/msword' ||
      fileType.mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      const docxData = await mammoth.extractRawText({ buffer: fileBuffer });
      parsedContent = docxData.value;
    }

    // Simple content validation to avoid executable scripts or malicious content
    if (parsedContent.includes('<script>') || parsedContent.includes('eval(')) {
      return withCors(
        ApiResponse.error('File contains potentially harmful content', 400),
        origin
      );
    }

    // Generate a unique filename for the CV
    const fileExtension = path.extname(cv.originalFilename || cv.name || 'cv');
    const fileName = uuidv4() + fileExtension;
    const uploadDir = path.join(process.cwd(), 'uploads', 'cv');

    // Ensure the directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filePath = path.join(uploadDir, fileName);

    // Save the file
    fs.renameSync(cv.filepath, filePath);

    // Create the job application in the database
    const application = await prisma.jobApplication.create({
      data: {
        jobId: job.id,
        firstName,
        lastName,
        email,
        cv: `/uploads/cv/${fileName}`,
        status: 'PENDING',
      },
    });

    return withCors(
      ApiResponse.success(application, 'Application submitted successfully'),
      origin
    );
  } catch (error) {
    const message = formatError(error);
    return withCors(
      ApiResponse.error(message, 500),
      origin
    );
  }
}