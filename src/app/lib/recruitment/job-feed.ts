// src/app/lib/recruitment/job-feed.ts
//
// Builders for the external job-board distribution surface. One XML feed in
// the long-standing Indeed-style schema (ingested by LinkedIn Job Wrapping,
// Jobberman, Indeed, Jooble, Careerjet, Jora and Talent.com) plus a
// schema.org/JobPosting JSON-LD object (for Google for Jobs, crawled directly
// off the public job page) — no AI, no per-platform bespoke integration.
// See the "Distribute job openings to external platforms" plan.

import { DEFAULT_JOB_CURRENCY, formatJobSalary, jobSalaryAmount } from "./job-salary";

const FRONTEND_URL = (process.env.NEXT_PUBLIC_FRONTEND_URL || "https://247hr.co.uk").replace(/\/$/, "");
export const CAREERS_BASE_URL = `${FRONTEND_URL}/careers/jobs-board`;
export const PUBLISHER_NAME = "24/7HR";
export const PUBLISHER_URL = FRONTEND_URL;
// No country field exists on Job or Company today; this app's business is
// Nigeria-based, so every feed entry defaults to Nigeria unless/until a real
// country field is introduced.
const DEFAULT_COUNTRY = "Nigeria";

export interface JobFeedLocation {
  state?: string;
  lga?: string;
  city?: string;
}

export interface JobFeedJob {
  id: string;
  title: string;
  description: string;
  department: string;
  position: string;
  employmentType: string | null;
  workplaceType: string | null;
  experienceLevel: string | null;
  salary?: unknown; // Decimal
  salaryRange: string | null; // legacy fallback
  currency?: string | null; // owning company's base currency
  locations: unknown; // Json [{state, lga}, ...]
  createdAt: Date;
  expirationDate: Date | null;
  companyName: string;
}

function parseLocations(locations: unknown): JobFeedLocation[] {
  let list = locations;
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch {
      list = null;
    }
  }
  return Array.isArray(list) ? (list as JobFeedLocation[]) : [];
}

function primaryLocation(locations: unknown): { city: string; state: string } {
  const [first] = parseLocations(locations);
  return { city: first?.city || first?.lga || "", state: first?.state || "" };
}

// Job boards' job-type vocabularies are close but not identical; map our
// free-text employmentType onto the common "Full-time/Part-time/Contract/
// Temporary/Internship" set most feeds expect, falling back to the raw value.
function normaliseJobType(employmentType: string | null): string {
  const t = (employmentType || "").trim().toLowerCase();
  if (t.startsWith("full")) return "Full-time";
  if (t.startsWith("part")) return "Part-time";
  if (t.startsWith("contract")) return "Contract";
  if (t.startsWith("temp")) return "Temporary";
  if (t.startsWith("intern")) return "Internship";
  return employmentType || "Full-time";
}

// CDATA-escape: strip any literal "]]>" so it can't prematurely close the
// CDATA section; CDATA itself handles every other XML-unsafe character.
function cdata(value: string): string {
  return `<![CDATA[${String(value ?? "").replace(/]]>/g, "]] >")}]]>`;
}

export function buildJobFeedXml(jobs: JobFeedJob[]): string {
  const items = jobs
    .map((job) => {
      const { city, state } = primaryLocation(job.locations);
      const url = `${CAREERS_BASE_URL}/${job.id}`;
      return [
        "  <job>",
        `    <title>${cdata(job.title)}</title>`,
        `    <date>${cdata(job.createdAt.toUTCString())}</date>`,
        `    <referencenumber>${cdata(job.id)}</referencenumber>`,
        `    <url>${cdata(url)}</url>`,
        `    <company>${cdata(job.companyName)}</company>`,
        `    <city>${cdata(city)}</city>`,
        `    <state>${cdata(state)}</state>`,
        `    <country>${cdata(DEFAULT_COUNTRY)}</country>`,
        `    <jobtype>${cdata(normaliseJobType(job.employmentType))}</jobtype>`,
        formatJobSalary(job, job.currency)
          ? `    <salary>${cdata(formatJobSalary(job, job.currency) as string)}</salary>`
          : null,
        `    <description>${cdata(job.description)}</description>`,
        "  </job>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<source>",
    `  <publisher>${cdata(PUBLISHER_NAME)}</publisher>`,
    `  <publisherurl>${cdata(PUBLISHER_URL)}</publisherurl>`,
    `  <lastBuildDate>${cdata(new Date().toUTCString())}</lastBuildDate>`,
    items,
    "</source>",
  ].join("\n");
}

export interface JobPostingCompany {
  companyName: string;
  website?: string | null;
  logo?: string | null;
}

// One schema.org/JobPosting object per job, for embedding as
// <script type="application/ld+json"> on the public job detail page so
// Google for Jobs can index it with zero feed submission.
export function buildJobPostingJsonLd(job: JobFeedJob, company: JobPostingCompany) {
  const { city, state } = primaryLocation(job.locations);
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: job.title,
    description: job.description,
    identifier: {
      "@type": "PropertyValue",
      name: company.companyName,
      value: job.id,
    },
    datePosted: job.createdAt.toISOString(),
    employmentType: normaliseJobType(job.employmentType).toUpperCase().replace("-", "_"),
    hiringOrganization: {
      "@type": "Organization",
      name: company.companyName,
      ...(company.website ? { sameAs: company.website } : {}),
      ...(company.logo ? { logo: company.logo } : {}),
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: city || undefined,
        addressRegion: state || undefined,
        addressCountry: "NG",
      },
    },
  };
  if (job.expirationDate) jsonLd.validThrough = job.expirationDate.toISOString();
  if (job.workplaceType && /remote/i.test(job.workplaceType)) {
    jsonLd.jobLocationType = "TELECOMMUTE";
    jsonLd.applicantLocationRequirements = { "@type": "Country", name: "Nigeria" };
  }
  const salaryAmount = jobSalaryAmount(job);
  if (salaryAmount !== null) {
    jsonLd.baseSalary = {
      "@type": "MonetaryAmount",
      currency: (job.currency || DEFAULT_JOB_CURRENCY).toUpperCase(),
      value: { "@type": "QuantitativeValue", value: salaryAmount, unitText: "MONTH" },
    };
  }
  return jsonLd;
}
