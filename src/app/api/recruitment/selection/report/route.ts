import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { extractKeywords, calculateIndustryMatchScore } from '@/app/lib/keywordExtractor'
import ExcelJS from 'exceljs'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['HR', 'SUPER_ADMIN'])

    if (!user.companyId) {
      return withCors(
        ApiResponse.error('Company context missing for this user', 400),
        origin
      )
    }

    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get('jobId')
    const format = (searchParams.get('format') || 'csv').toLowerCase()
    const detailed = searchParams.get('detailed') === 'true'

    if (!jobId) {
      return withCors(
        ApiResponse.error('jobId query parameter is required', 400),
        origin
      )
    }

    // Get job with applications
    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        companyId: user.companyId as string,
      },
      include: {
        applications: {
          include: {
            candidate: true,
            stageHistory: {
              orderBy: {
                changedAt: 'desc'
              },
              take: 1
            }
          }
        },
        keywords: true
      },
    })

    if (!job) {
      return withCors(
        ApiResponse.error(
          'Job not found for this company or you do not have access',
          404
        ),
        origin
      )
    }

    if (!job.applications.length) {
      return withCors(
        ApiResponse.error('No applications found for this job', 404),
        origin
      )
    }

    // Create job description for keyword extraction
    const jobDescription = `${job.title} ${job.description} ${job.department} ${job.position}`;
    
    // Process applications
    const processedApplications = await Promise.all(
      job.applications.map(async (applicant) => {
        // Use parsedCvContent from JobApplication
        const cvText = applicant.parsedCvContent || '';
        
        // Calculate match score using industry algorithm
        const matchResult = calculateIndustryMatchScore(
          jobDescription,
          cvText,
          { useAIServices: false }
        );
        
        // Determine review status
        const lastStage = applicant.stageHistory[0];
        const isReviewed = lastStage?.toStatus === 'REVIEWING' ||
                  lastStage?.toStatus === 'SHORTLISTED' ||
                  lastStage?.toStatus === 'INTERVIEWING' ||
                  lastStage?.toStatus === 'OFFERED' ||
                  lastStage?.toStatus === 'HIRED';
        // Calculate hiring recommendation
        let recommendation = 'Not Recommended';
        if (matchResult.overallScore >= 90) recommendation = 'Immediate Hire';
        else if (matchResult.overallScore >= 80) recommendation = 'Strong Candidate';
        else if (matchResult.overallScore >= 70) recommendation = 'Consider';
        else if (matchResult.overallScore >= 60) recommendation = 'Secondary Option';
        
        return {
          ...applicant,
          matchScore: matchResult.overallScore,
          technicalScore: matchResult.technicalScore,
          softSkillsScore: matchResult.softSkillsScore,
          experienceScore: matchResult.experienceScore,
          educationScore: matchResult.educationScore,
          keywordMatches: matchResult.keywordMatches.length,
          missingKeywords: matchResult.missingKeywords,
          skillGaps: matchResult.skillGapAnalysis,
          isReviewed,
          recommendation,
          industryBenchmark: matchResult.industryBenchmark,
          isAboveBenchmark: matchResult.overallScore > matchResult.industryBenchmark
        };
      })
    );

    // Sort by overall match score
    const sorted = processedApplications.sort((a, b) => b.matchScore - a.matchScore);

    // Create export data
    const exportRows = sorted.map((applicant, index) => ({
      rank: index + 1,
      recommendation: applicant.recommendation,
      applicationId: applicant.id,
      firstName: applicant.candidate?.firstName || 'N/A',
      lastName: applicant.candidate?.lastName || 'N/A',
      email: applicant.candidate?.email || 'N/A',
      phone: applicant.candidate?.phone || 'N/A',
      currentStatus: applicant.status,
      overallScore: applicant.matchScore,
      technicalScore: applicant.technicalScore,
      softSkillsScore: applicant.softSkillsScore,
      experienceScore: applicant.experienceScore,
      educationScore: applicant.educationScore,
      keywordMatches: applicant.keywordMatches,
      missingKeywords: applicant.missingKeywords.length,
      isAboveBenchmark: applicant.isAboveBenchmark ? 'Yes' : 'No',
      isReviewed: applicant.isReviewed ? 'Yes' : 'No',
      appliedAt: applicant.createdAt,
      lastReviewDate: applicant.stageHistory[0]?.changedAt || null,
      jobId: job.id,
      jobTitle: job.title,
      department: job.department,
      position: job.position,
      // Detailed analysis for Excel
      criticalGaps: detailed && applicant.skillGaps?.critical 
        ? applicant.skillGaps.critical.slice(0, 3).join(', ') 
        : '',
      topMatchedKeywords: detailed && applicant.keywordMatches > 0
        ? 'Shown in detailed report'
        : '',
      experienceYears: Math.round(applicant.experienceScore / 10),
      notes: applicant.notes || ''
    }));

    // Generate Excel report
    if (format === 'excel' || format === 'xlsx') {
      return generateExcelReport(exportRows, job, detailed, origin);
    }

    // Generate CSV report
    return generateCSVReport(exportRows, job, origin);
  } catch (error: unknown) {
    const message = formatError(error);
    console.error('Error generating selection report:', error);
    return withCors(ApiResponse.error(message, 500), origin);
  }
}

// Helper function to generate Excel report
async function generateExcelReport(
  exportRows: any[], 
  job: any, 
  detailed: boolean,
  origin: string | null
) {
  const workbook = new ExcelJS.Workbook();
  
  // Main Applicants Sheet
  const sheet = workbook.addWorksheet('Ranked Applicants');
  
  // Define columns
  const columns = [
    { header: 'Rank', key: 'rank', width: 8 },
    { header: 'Recommendation', key: 'recommendation', width: 20 },
    { header: 'Application ID', key: 'applicationId', width: 36 },
    { header: 'First Name', key: 'firstName', width: 15 },
    { header: 'Last Name', key: 'lastName', width: 15 },
    { header: 'Email', key: 'email', width: 25 },
    { header: 'Phone', key: 'phone', width: 15 },
    { header: 'Status', key: 'currentStatus', width: 15 },
    { header: 'Overall Score', key: 'overallScore', width: 12 },
    { header: 'Technical Score', key: 'technicalScore', width: 12 },
    { header: 'Soft Skills', key: 'softSkillsScore', width: 12 },
    { header: 'Experience', key: 'experienceScore', width: 12 },
    { header: 'Education', key: 'educationScore', width: 12 },
    { header: 'Keyword Matches', key: 'keywordMatches', width: 12 },
    { header: 'Missing Keywords', key: 'missingKeywords', width: 12 },
    { header: 'Above Industry Avg', key: 'isAboveBenchmark', width: 15 },
    { header: 'Reviewed', key: 'isReviewed', width: 10 },
    { header: 'Applied Date', key: 'appliedAt', width: 12 },
    { header: 'Job Title', key: 'jobTitle', width: 25 },
    { header: 'Department', key: 'department', width: 20 },
  ];

  // Add detailed columns if requested
  if (detailed) {
    columns.push(
      { header: 'Critical Skill Gaps', key: 'criticalGaps', width: 30 },
      { header: 'Experience (Years)', key: 'experienceYears', width: 15 },
      { header: 'Notes', key: 'notes', width: 30 }
    );
  }

  sheet.columns = columns;

  // Style header
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };

  // Add data rows with conditional formatting
  exportRows.forEach((row, index) => {
    const dataRow = sheet.addRow(row);
    
    // Color code based on recommendation
    if (row.recommendation === 'Immediate Hire') {
      dataRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFC6EFCE' } // Green
      };
    } else if (row.recommendation === 'Strong Candidate') {
      dataRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFEB9C' } // Yellow
      };
    } else if (row.recommendation === 'Consider') {
      dataRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFC7CE' } // Light red
      };
    }
    
    // Highlight scores above benchmark
    if (row.isAboveBenchmark === 'Yes') {
      dataRow.getCell('overallScore').font = { bold: true, color: { argb: 'FF006100' } };
    }
    
    // Format date cells
    if (row.appliedAt) {
      const dateCell = dataRow.getCell('appliedAt');
      dateCell.numFmt = 'yyyy-mm-dd';
    }
  });

  // Add Summary Sheet
  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 30 },
    { header: 'Value', key: 'value', width: 20 }
  ];

  const totalApplicants = exportRows.length;
  const averageScore = exportRows.reduce((sum, row) => sum + row.overallScore, 0) / totalApplicants;
  const aboveBenchmark = exportRows.filter(row => row.isAboveBenchmark === 'Yes').length;
  const immediateHire = exportRows.filter(row => row.recommendation === 'Immediate Hire').length;
  const reviewedCount = exportRows.filter(row => row.isReviewed === 'Yes').length;

  summarySheet.addRows([
    { metric: 'Total Applicants', value: totalApplicants },
    { metric: 'Average Match Score', value: averageScore.toFixed(1) },
    { metric: 'Above Industry Benchmark', value: `${aboveBenchmark} (${((aboveBenchmark/totalApplicants)*100).toFixed(1)}%)` },
    { metric: 'Immediate Hire Candidates', value: immediateHire },
    { metric: 'Strong Candidates', value: exportRows.filter(row => row.recommendation === 'Strong Candidate').length },
    { metric: 'Reviewed Applications', value: `${reviewedCount} (${((reviewedCount/totalApplicants)*100).toFixed(1)}%)` },
    { metric: 'Job Title', value: job.title },
    { metric: 'Department', value: job.department },
    { metric: 'Position', value: job.position },
    { metric: 'Report Generated', value: new Date().toLocaleString() },
  ]);

  // Style summary sheet
  const summaryHeader = summarySheet.getRow(1);
  summaryHeader.font = { bold: true };
  summaryHeader.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' }
  };
  summaryHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };

  const buffer = await workbook.xlsx.writeBuffer();

  const response = new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="job_${job.id}_ranked_${new Date().toISOString().split('T')[0]}.xlsx"`,
    },
  });

  return withCors(response, origin);
}

// Helper function to generate CSV report
function generateCSVReport(exportRows: any[], job: any, origin: string | null) {
  const header = [
    'Rank',
    'Recommendation',
    'Application ID',
    'First Name',
    'Last Name',
    'Email',
    'Phone',
    'Status',
    'Overall Score',
    'Technical Score',
    'Soft Skills',
    'Experience',
    'Education',
    'Keyword Matches',
    'Missing Keywords',
    'Above Industry Avg',
    'Reviewed',
    'Applied Date',
    'Job Title',
    'Department',
    'Position'
  ];

  const escapeCsv = (value: unknown) => {
    if (value == null) return '';
    const str = String(value);
    if (str.includes('"') || str.includes(',') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = exportRows.map((row) =>
    [
      row.rank,
      row.recommendation,
      row.applicationId,
      row.firstName,
      row.lastName,
      row.email,
      row.phone,
      row.currentStatus,
      row.overallScore,
      row.technicalScore,
      row.softSkillsScore,
      row.experienceScore,
      row.educationScore,
      row.keywordMatches,
      row.missingKeywords,
      row.isAboveBenchmark,
      row.isReviewed,
      row.appliedAt ? new Date(row.appliedAt).toISOString().split('T')[0] : '',
      row.jobTitle,
      row.department,
      row.position
    ]
      .map(escapeCsv)
      .join(',')
  );

  const csvContent = [header.join(','), ...rows].join('\n');

  const response = new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="job_${job.id}_ranked_${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });

  return withCors(response, origin);
}