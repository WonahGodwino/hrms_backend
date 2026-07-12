// src/app/api/jobs/public/apply/route.ts

import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { fileTypeFromBuffer } from 'file-type'
import { extractCvText } from '@/app/lib/recruitment/cvText'

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
    const applicationStartDate = formData.get('applicationStartDate') as string || undefined;
    const linkedInUrl = formData.get('linkedInUrl') as string || undefined;
    const portfolioUrl = formData.get('portfolioUrl') as string || undefined;
    const location = formData.get('location') as string || undefined; // JSON string: {"state": "Lagos", "lga": "Ikeja"}
    const createdBy = formData.get('createdBy') as string || 'public_application';
    
    // Get the CV file
    const cvFile = formData.get('cv') as File | null;
    
    // Get cover letter file (optional)
    const coverLetterFile = formData.get('coverLetter') as File | null;

    // Validate required fields
    if (!jobId || !firstName || !lastName || !email) {
      return withCors(ApiResponse.error('Job ID, first name, last name, and email are required', 400), origin);
    }

    // Parse location if provided. Accept either a JSON object
    // ({"state","lga"}) or a plain free-text string (e.g. "Ikeja, Lagos" or a
    // non-Nigerian city). LGA is optional — a state/city alone is fine.
    let parsedLocation: { state: string; lga: string } | null = null;
    if (location && location.trim()) {
      const raw = location.trim();
      let state = '';
      let lga = '';
      try {
        const obj = JSON.parse(raw);
        if (obj && typeof obj === 'object' && (obj.state || obj.lga)) {
          state = String(obj.state || '').trim();
          lga = String(obj.lga || '').trim();
        } else {
          // Valid JSON but not the expected shape (e.g. a bare string) → free-text.
          state = raw;
        }
      } catch {
        // Not JSON at all → treat the whole value as a free-text location.
        state = raw;
      }
      if (state) parsedLocation = { state, lga };
    }

    // Check if the job exists
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, expirationDate: true, status: true, companyId: true, title: true },
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

    // Validate file size (5MB limit)
    if (cvFile.size > 5 * 1024 * 1024) {
      return withCors(ApiResponse.error('CV file size exceeds the 5MB limit', 400), origin);
    }

    // Check CV file type
    const cvFileBuffer = Buffer.from(await cvFile.arrayBuffer());
    const cvFileType = await fileTypeFromBuffer(cvFileBuffer);

    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    const cvExtension = cvFile.name.split('.').pop()?.toLowerCase();
    const allowedExtensions = ['pdf', 'doc', 'docx'];

    const isValidCvMimeType = cvFileType && allowedMimeTypes.includes(cvFileType.mime);
    const isValidCvExtension = cvExtension && allowedExtensions.includes(cvExtension);

    if (!isValidCvMimeType && !isValidCvExtension) {
      return withCors(ApiResponse.error('Invalid CV file type. Allowed formats are .pdf, .doc, .docx', 400), origin);
    }

    // Validate cover letter file if provided (optional)
    let coverLetterFileBuffer: Buffer | null = null;
    let coverLetterFileType: any = null;
    let coverLetterFileData: any = null;

    if (coverLetterFile) {
      if (coverLetterFile.size > 5 * 1024 * 1024) {
        return withCors(ApiResponse.error('Cover letter file size exceeds the 5MB limit', 400), origin);
      }

      coverLetterFileBuffer = Buffer.from(await coverLetterFile.arrayBuffer());
      coverLetterFileType = await fileTypeFromBuffer(coverLetterFileBuffer);

      const coverLetterExtension = coverLetterFile.name.split('.').pop()?.toLowerCase();
      const isValidCoverLetterMimeType = coverLetterFileType && allowedMimeTypes.includes(coverLetterFileType.mime);
      const isValidCoverLetterExtension = coverLetterExtension && allowedExtensions.includes(coverLetterExtension);

      if (!isValidCoverLetterMimeType && !isValidCoverLetterExtension) {
        return withCors(ApiResponse.error('Invalid cover letter file type. Allowed formats are .pdf, .doc, .docx', 400), origin);
      }
    }

    // Check if candidate already exists for this company (same email)
    let candidate = await prisma.candidate.findFirst({
      where: {
        email,
        companyId: job.companyId,
      },
    });

    // Prepare candidate data
    const candidateData: any = {
      companyId: job.companyId,
      firstName,
      lastName,
      email,
      phone: phone || null,
      applicationStartDate: applicationStartDate ? new Date(applicationStartDate) : null,
      linkedInUrl: linkedInUrl || null,
      portfolioUrl: portfolioUrl || null,
      // Candidate has no dedicated LGA column; the state is stored here and the
      // full {state, lga} is retained in the application metadata below.
      locationState: parsedLocation?.state || null,
      createdBy: createdBy,
    };

    // If candidate doesn't exist, create a new one
    if (!candidate) {
      candidate = await prisma.candidate.create({
        data: candidateData,
      });
    } else {
      // Update candidate information if they exist
      candidate = await prisma.candidate.update({
        where: { id: candidate.id },
        data: {
          firstName,
          lastName,
          phone: phone || candidate.phone,
          applicationStartDate: applicationStartDate ? new Date(applicationStartDate) : candidate.applicationStartDate,
          linkedInUrl: linkedInUrl || candidate.linkedInUrl,
          portfolioUrl: portfolioUrl || candidate.portfolioUrl,
          locationState: parsedLocation?.state || candidate.locationState,
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

    // Extract CV text so the AI / keyword review has real input (best-effort).
    const parsedCvContent = await extractCvText(
      cvFileBuffer,
      cvFileType?.mime || '',
      cvFile.name,
    );

    // Convert file buffer to Uint8Array for Prisma
    const cvUint8Array = new Uint8Array(cvFileBuffer);

    // Save the CV file into CandidateFile
    const cvFileData = await prisma.candidateFile.create({
      data: {
        companyId: job.companyId,
        candidateId: candidate.id,
        applicationId: null, // Will be linked after application creation
        fileName: cvFile.name,
        mimeType: cvFileType?.mime || 'application/octet-stream',
        sizeBytes: cvFile.size,
        data: cvUint8Array,
        type: 'CV',
        createdBy: createdBy,
      }
    });

    // Save cover letter file if provided
    let coverLetterFileDataId: string | null = null;
    if (coverLetterFileBuffer && coverLetterFile) {
      const coverLetterUint8Array = new Uint8Array(coverLetterFileBuffer);
      coverLetterFileData = await prisma.candidateFile.create({
        data: {
          companyId: job.companyId,
          candidateId: candidate.id,
          applicationId: null,
          fileName: coverLetterFile.name,
          mimeType: coverLetterFileType?.mime || 'application/octet-stream',
          sizeBytes: coverLetterFile.size,
          data: coverLetterUint8Array,
          type: 'COVER_LETTER',
          createdBy: createdBy,
        }
      });
      coverLetterFileDataId = coverLetterFileData.id;
    }

    // Create the job application in the database
    const application = await prisma.jobApplication.create({
      data: {
        companyId: job.companyId,
        jobId: job.id,
        candidateId: candidate.id,
        cvFilePath: cvFileData.fileName,
        cvFileName: cvFileData.fileName,
        cvFileId: cvFileData.id, // Link to the CV file
        parsedCvContent: parsedCvContent || null,
        status: 'SUBMITTED',
        createdBy: createdBy,
        // Store additional metadata
        metadata: {
          applicationStartDate: applicationStartDate || null,
          location: parsedLocation,
          phone: phone || null,
          linkedInUrl: linkedInUrl || null,
          portfolioUrl: portfolioUrl || null,
          coverLetterFileId: coverLetterFileDataId,
        },
      },
    });

    // Update the CandidateFile to link it to this application
    await prisma.candidateFile.update({
      where: { id: cvFileData.id },
      data: {
        applicationId: application.id,
      },
    });

    // Update cover letter file if it exists
    if (coverLetterFileDataId) {
      await prisma.candidateFile.update({
        where: { id: coverLetterFileDataId },
        data: {
          applicationId: application.id,
        },
      });
    }

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
      jobTitle: job.title,
      message: 'Application submitted successfully',
      note: 'You can apply to other jobs at this company, but cannot apply again to this same job.'
    }, 'Job application submitted successfully'), origin);
    
  } catch (error) {
    const message = formatError(error);
    console.error('Error in public job application:', error);
    return withCors(ApiResponse.error(message || 'An error occurred while processing your application', 500), origin);
  }
}