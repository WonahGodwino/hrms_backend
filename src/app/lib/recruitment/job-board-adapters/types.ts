// src/app/lib/recruitment/job-board-adapters/types.ts
//
// Extensibility seam for a genuine push-API job-board integration (e.g.
// LinkedIn Recruiter System Connect, a Jobberman partner API), should the
// company secure real API credentials for one in the future. Nothing
// implements this today — the feed/JSON-LD distribution surface in
// lib/recruitment/job-feed.ts is what actually ships jobs out right now.
// This interface exists so adding a real push integration later is a new,
// isolated adapter file, not a change to the feed or the rest of the module.

export interface JobBoardJobPayload {
  id: string;
  title: string;
  description: string;
  department: string;
  position: string;
  employmentType: string | null;
  workplaceType: string | null;
  experienceLevel: string | null;
  salaryRange: string | null;
  locations: unknown;
  expirationDate: Date | null;
}

export interface JobBoardCompanyPayload {
  id: string;
  companyName: string;
  website: string | null;
}

export interface JobBoardAdapter {
  /** 'linkedin-wrapping' | 'jobberman-partner' | ... */
  id: string;
  onJobPublished(job: JobBoardJobPayload, company: JobBoardCompanyPayload): Promise<void>;
  onJobClosed(job: JobBoardJobPayload, company: JobBoardCompanyPayload): Promise<void>;
}
