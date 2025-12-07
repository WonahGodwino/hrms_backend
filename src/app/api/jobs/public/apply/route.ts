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

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');

  try {
    // Create uploads directory if it doesn't exist
    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Parse form data with formidable v2/v3 syntax
    const form = formidable({
      maxFileSize: 5 * 1024 * 1024, // 5 MB size limit
      uploadDir: uploadDir,
      keepExtensions: true,
      multiples: true, // Allow multiple files
    });

    // Parse the incoming request data
    const parsedData = await new Promise<{ fields: formidable.Fields; files: formidable.Files }>(
      (resolve, reject) => {
        form.parse(request as any, (err, fields, files) => {
          if (err) reject(err);
          resolve({ fields, files });
        });
      }
    );

    const { fields, files } = parsedData;
    
    // Extract form fields - formidable v2/v3 returns arrays for fields
    const jobId = Array.isArray(fields.jobId) ? fields.jobId[0] : fields.jobId;
    const firstName = Array.isArray(fields.firstName) ? fields.firstName[0] : fields.firstName;
    const lastName = Array.isArray(fields.lastName) ? fields.lastName[0] : fields.lastName;
    const email = Array.isArray(fields.email) ? fields.email[0] : fields.email;
    
    // Get the CV file - formidable v2/v3 returns arrays for files
    const cvFiles = files.cv;
    const cv = Array.isArray(cvFiles) ? cvFiles[0] : cvFiles;

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

    // Basic PDF validation - check if it starts with PDF header
    if (fileType.mime === 'application/pdf') {
      // Check if file starts with PDF header (first 4 bytes should be "%PDF")
      const pdfHeader = fileBuffer.slice(0, 4).toString();
      if (pdfHeader !== '%PDF') {
        return withCors(
          ApiResponse.error('Invalid PDF file format', 400),
          origin
        );
      }
    }

    // Parse the content of the file to check for malicious code (DOC/DOCX only)
    let parsedContent = '';
    if (
      fileType.mime === 'application/msword' ||
      fileType.mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      const docxData = await mammoth.extractRawText({ buffer: fileBuffer });
      parsedContent = docxData.value;
      
      // Simple content validation to avoid executable scripts or malicious content
      if (parsedContent.includes('<script>') || parsedContent.includes('eval(')) {
        return withCors(
          ApiResponse.error('File contains potentially harmful content', 400),
          origin
        );
      }
    }

    // Generate a unique filename for the CV
    const cvUploadDir = path.join(process.cwd(), 'uploads', 'cv');
    if (!fs.existsSync(cvUploadDir)) {
      fs.mkdirSync(cvUploadDir, { recursive: true });
    }

    const fileExtension = path.extname(cv.originalFilename || cv.name || 'cv');
    const fileName = uuidv4() + fileExtension;
    const filePath = path.join(cvUploadDir, fileName);

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

    // Clean up temporary file if it still exists
    try {
      if (fs.existsSync(cv.filepath)) {
        fs.unlinkSync(cv.filepath);
      }
    } catch (cleanupError) {
      console.error('Error cleaning up temporary file:', cleanupError);
    }

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