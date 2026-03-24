// src/app/api/jobs/public/apply/route.ts

import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { fileTypeFromBuffer } from 'file-type'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    // Use Next.js built-in formData() method
    const formData = await request.formData();
    
    // Extract fields from formData
    const jobId = formData.get('jobId') as string;
    const firstName = formData.get('firstName') as string;
    const lastName = formData.get('lastName') as string;
    const email = formData.get('email') as string;
    const phone = formData.get('phone') as string || undefined;
    const address = formData.get('address') as string || undefined;
    const linkedInUrl = formData.get('linkedInUrl') as string || undefined;
    const portfolioUrl = formData.get('portfolioUrl') as string || undefined;
    const createdBy = formData.get('createdBy') as string || 'public_application';
    
    // Get the CV file
    const cvFile = formData.get('cv') as File | null;

    // Validate required fields
    if (!jobId || !firstName || !lastName || !email) {
      return withCors(ApiResponse.error('Job ID, first name, last name, and email are required', 400), origin);
    }

    // Check if the job exists
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, expirationDate: true, status: true, companyId: true },
    });

    if (!job) {
      return withCors(ApiResponse.error('Job not found', 404), origin);
    }

    // Check if job is active
    if (job.status !== 'ACTIVE') {
      return withCors(ApiResponse.error('Job is not active for applications', 400), origin);
    }

    // Check if the job has expired (handle null expirationDate)
    if (job.expirationDate && job.expirationDate < new Date()) {
      return withCors(ApiResponse.error('Job posting has expired', 400), origin);
    }

    // Validate CV file
    if (!cvFile) {
      return withCors(ApiResponse.error('CV file is required', 400), origin);
    }

    // Validate file size
    if (cvFile.size > 5 * 1024 * 1024) { // 5MB size limit
      return withCors(ApiResponse.error('CV file size exceeds the 5MB limit', 400), origin);
    }

    // Check file type
    const fileBuffer = Buffer.from(await cvFile.arrayBuffer());
    const fileType = await fileTypeFromBuffer(fileBuffer);

    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    // Also check by file extension as fallback
    const fileExtension = cvFile.name.split('.').pop()?.toLowerCase();
    const allowedExtensions = ['pdf', 'doc', 'docx'];

    const isValidMimeType = fileType && allowedMimeTypes.includes(fileType.mime);
    const isValidExtension = fileExtension && allowedExtensions.includes(fileExtension);

    if (!isValidMimeType && !isValidExtension) {
      return withCors(ApiResponse.error('Invalid file type. Allowed formats are .pdf, .doc, .docx', 400), origin);
    }

    // Check if candidate already exists for this company (same email)
    let candidate = await prisma.candidate.findFirst({
      where: {
        email,
        companyId: job.companyId,
      },
    });

    // If candidate doesn't exist, create a new one
    if (!candidate) {
      candidate = await prisma.candidate.create({
        data: {
          companyId: job.companyId,
          firstName,
          lastName,
          email,
          phone: phone || null,
          address: address || null,
          linkedInUrl: linkedInUrl || null,
          portfolioUrl: portfolioUrl || null,
          createdBy: createdBy,
        },
      });
    } else {
      // Update candidate information if they exist
      candidate = await prisma.candidate.update({
        where: { id: candidate.id },
        data: {
          firstName,
          lastName,
          phone: phone || candidate.phone,
          address: address || candidate.address,
          linkedInUrl: linkedInUrl || candidate.linkedInUrl,
          portfolioUrl: portfolioUrl || candidate.portfolioUrl,
          updatedAt: new Date(),
        },
      });
    }

    // Check if this candidate has ALREADY APPLIED TO THIS SPECIFIC JOB
    const existingApplication = await prisma.jobApplication.findUnique({
      where: {
        jobId_candidateId: {
          jobId,
          candidateId: candidate.id,
        },
      },
    });

    if (existingApplication) {
      return withCors(ApiResponse.error('You have already applied for this job', 400), origin);
    }

    // Convert file buffer to Uint8Array for Prisma
    const uint8ArrayData = new Uint8Array(fileBuffer);

    // Save the file into CandidateFile
    const fileData = await prisma.candidateFile.create({
      data: {
        companyId: job.companyId,
        candidateId: candidate.id,
        applicationId: null, // Will be linked after application creation
        fileName: cvFile.name,
        mimeType: fileType?.mime || 'application/octet-stream',
        sizeBytes: cvFile.size,
        data: uint8ArrayData,
        type: 'CV',
        createdBy: createdBy,
      }
    });

    // Create the job application in the database
    const application = await prisma.jobApplication.create({
      data: {
        companyId: job.companyId,
        jobId: job.id,
        candidateId: candidate.id,
        cvFilePath: fileData.fileName,
        cvFileName: fileData.fileName,
        cvFileId: fileData.id, // Link to the CV file
        status: 'SUBMITTED',
        createdBy: createdBy,
      },
    });

    // Update the CandidateFile to link it to this application
    await prisma.candidateFile.update({
      where: { id: fileData.id },
      data: {
        applicationId: application.id,
      },
    });

    // Create initial stage history
    await prisma.applicationStageHistory.create({
      data: {
        applicationId: application.id,
        toStatus: 'SUBMITTED',
        changedBy: createdBy,
      },
    });

    return withCors(ApiResponse.success({ 
      applicationId: application.id,
      candidateId: candidate.id,
      message: 'Application submitted successfully',
      note: 'You can apply to other jobs at this company, but cannot apply again to this same job.'
    }, 'Job application submitted successfully'), origin);
  } catch (error) {
    const message = formatError(error);
    console.error('Error in public job application:', error);
    return withCors(ApiResponse.error(message || 'An error occurred while processing your application', 500), origin);
  }
}