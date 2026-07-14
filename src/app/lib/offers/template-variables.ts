// src/app/lib/offers/template-variables.ts
// The canonical placeholder catalog + renderer for the multi-company offer
// letter engine. Templates are generic rich text containing {{tokens}}; every
// company-specific value is resolved at render time from company/candidate/job/
// offer data, so a single template serves every company in the system.

export type VariableCategory = 'company' | 'candidate' | 'job' | 'offer' | 'terms' | 'comp'

export interface VariableDef {
  key: string          // token used in templates, e.g. "company.secondedCompany"
  label: string        // human label for the builder UI
  category: VariableCategory
  source: string       // where the value comes from
  sample: string       // example value (from the reference letter)
}

// Grouped for the builder's variable panel. Order is display order.
export const VARIABLE_CATALOG: VariableDef[] = [
  // Employer / company
  { key: 'company.name', label: 'Company Name', category: 'company', source: 'Company profile', sample: '[Your Company Name]' },
  { key: 'company.logo', label: 'Company Logo', category: 'company', source: 'Company profile', sample: '[Company Logo]' },
  { key: 'company.rcNumber', label: 'Company Registration (RC)', category: 'company', source: 'Company profile', sample: 'RC XXXXXXX' },
  { key: 'company.secondedCompany', label: 'Seconded Company', category: 'company', source: 'Company profile', sample: '[Seconded Company Name]' },
  { key: 'company.hrRepName', label: 'HR Representative', category: 'company', source: 'Company profile', sample: '[HR Name]' },
  { key: 'company.hrRepTitle', label: 'HR Representative Title', category: 'company', source: 'Company profile', sample: '[HR Title, e.g. HRBP]' },
  { key: 'company.communicationTool', label: 'Communication Tool', category: 'company', source: 'Company profile', sample: '[e.g. Lark, Slack, Teams]' },
  { key: 'company.governingLaw', label: 'Governing Law', category: 'company', source: 'Company profile', sample: '[Laws of Jurisdiction]' },
  { key: 'company.arbitrationVenue', label: 'Arbitration Venue', category: 'company', source: 'Company profile', sample: '[City]' },
  { key: 'company.address', label: 'Company Address', category: 'company', source: 'Company profile', sample: '[Address]' },
  { key: 'company.email', label: 'Company Email', category: 'company', source: 'Company profile', sample: '[Company Email]' },
  { key: 'company.phone', label: 'Company Phone', category: 'company', source: 'Company profile', sample: '[Company Phone]' },

  // Candidate
  { key: 'candidate.fullName', label: 'Candidate Full Name', category: 'candidate', source: 'Candidate / onboarding', sample: 'John Doe' },
  { key: 'candidate.firstName', label: 'Candidate First Name', category: 'candidate', source: 'Candidate / onboarding', sample: 'John' },
  { key: 'candidate.lastName', label: 'Candidate Last Name', category: 'candidate', source: 'Candidate / onboarding', sample: 'Doe' },
  { key: 'candidate.email', label: 'Candidate Email', category: 'candidate', source: 'Candidate / onboarding', sample: 'candidate@example.com' },
  { key: 'candidate.residentialState', label: 'Residential State', category: 'candidate', source: 'Candidate / onboarding', sample: '[State/Region]' },

  // Job role
  { key: 'job.title', label: 'Job Title', category: 'job', source: 'Job role', sample: 'Software Engineer' },
  { key: 'job.location', label: 'Job Location', category: 'job', source: 'Job role', sample: '[Office Location]' },
  { key: 'job.description', label: 'Job Description', category: 'job', source: 'Job role', sample: '[Insert job responsibilities…]' },
  { key: 'job.department', label: 'Department', category: 'job', source: 'Job role', sample: 'Engineering' },

  // Offer dates
  { key: 'offer.letterDate', label: 'Offer Letter Date', category: 'offer', source: 'Offer', sample: '[Date]' },
  { key: 'offer.effectiveDate', label: 'Effective Date', category: 'offer', source: 'Offer', sample: '[Date]' },

  // Employment terms (job defaults, per-offer override)
  { key: 'terms.contractDuration', label: 'Contract Duration', category: 'terms', source: 'Job defaults / Offer', sample: '1 year, renewable' },
  { key: 'terms.probationPeriod', label: 'Probation Period', category: 'terms', source: 'Job defaults / Offer', sample: '3 months' },
  { key: 'terms.noticePeriod', label: 'Notice Period', category: 'terms', source: 'Job defaults / Offer', sample: '2 weeks' },
  { key: 'terms.weeklyHours', label: 'Weekly Working Hours', category: 'terms', source: 'Job defaults / Offer', sample: '40' },
  { key: 'terms.dailyHours', label: 'Daily Working Hours', category: 'terms', source: 'Job defaults / Offer', sample: '8' },
  { key: 'terms.lunchBreak', label: 'Lunch Break', category: 'terms', source: 'Job defaults / Offer', sample: '1 hour' },
  { key: 'terms.lineManager', label: 'Line Manager', category: 'terms', source: 'Offer', sample: '[Line Manager]' },

  // Compensation & benefits
  { key: 'comp.basicSalary', label: 'Basic Monthly Salary', category: 'comp', source: 'Offer', sample: '[Amount]' },
  { key: 'comp.performanceBonus', label: 'Performance Bonus', category: 'comp', source: 'Offer', sample: '[Amount]' },
  { key: 'comp.walletSplit', label: 'Wallet Payment Split', category: 'comp', source: 'Offer', sample: '[Amount]' },
  { key: 'comp.benefits', label: 'Benefits', category: 'comp', source: 'Benefits module', sample: 'Health Insurance, Pension' },
]

// ---------- formatting helpers ----------

export function formatMoney(amount: unknown, currency = 'NGN'): string {
  const n = typeof amount === 'string' ? Number(amount.replace(/[^0-9.-]/g, '')) : Number(amount)
  if (amount == null || isNaN(n)) return ''
  return `${currency} ${n.toLocaleString('en-NG')}`
}

export function formatLongDate(value: unknown): string {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(String(value))
  if (isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' })
}

// ---------- resolving values ----------

export interface OfferLetterSources {
  company?: any
  candidate?: any
  job?: any
  offer?: any
  // Free-form per-offer terms/compensation overrides (from offer.metadata etc.)
  terms?: Record<string, any>
  comp?: Record<string, any>
}

// Builds the flat { "company.name": "…", … } value map used by renderTemplate.
export function resolveOfferVariables(src: OfferLetterSources): Record<string, string> {
  const { company = {}, candidate = {}, job = {}, offer = {}, terms = {}, comp = {} } = src
  const currency = company.baseCurrency || 'NGN'

  const first = candidate.firstName || String(candidate.fullName || '').trim().split(/\s+/)[0] || ''
  const last = candidate.lastName || String(candidate.fullName || '').trim().split(/\s+/).slice(1).join(' ') || ''
  const fullName = candidate.fullName || `${first} ${last}`.trim()

  const jobDefaults = (job.offerDefaults && typeof job.offerDefaults === 'object') ? job.offerDefaults : {}
  const t = (k: string) => terms[k] ?? jobDefaults[k] ?? ''

  const values: Record<string, any> = {
    'company.name': company.companyName || company.tradingName || '',
    'company.logo': company.logo ? `<img src="${company.logo}" alt="${company.companyName || 'Company'}" style="max-width:150px;height:auto;" />` : '',
    'company.rcNumber': company.rcNumber || '',
    'company.secondedCompany': company.secondedCompany || '',
    'company.hrRepName': company.hrRepName || '',
    'company.hrRepTitle': company.hrRepTitle || '',
    'company.communicationTool': company.communicationTool || '',
    'company.governingLaw': company.governingLaw || 'Laws of the Federal Republic of Nigeria',
    'company.arbitrationVenue': company.arbitrationVenue || 'Lagos',
    'company.address': company.address || '',
    'company.email': company.email || '',
    'company.phone': company.phone || '',

    'candidate.fullName': fullName,
    'candidate.firstName': first,
    'candidate.lastName': last,
    'candidate.email': candidate.email || '',
    'candidate.residentialState': candidate.residentialState || candidate.locationState || candidate.address || '',

    'job.title': job.title || job.position || '',
    'job.location': terms.jobLocation ?? jobDefaults.jobLocation ?? job.location ?? '',
    'job.description': job.description || '',
    'job.department': job.department || '',

    'offer.letterDate': formatLongDate(offer.letterDate || offer.createdAt),
    'offer.effectiveDate': formatLongDate(offer.effectiveDate || offer.proposedStartDate),

    'terms.contractDuration': t('contractDuration'),
    'terms.probationPeriod': t('probationPeriod'),
    'terms.noticePeriod': t('noticePeriod'),
    'terms.weeklyHours': String(t('weeklyHours') || ''),
    'terms.dailyHours': String(t('dailyHours') || ''),
    'terms.lunchBreak': t('lunchBreak'),
    'terms.lineManager': terms.lineManager || 'To be assigned',

    'comp.basicSalary': formatMoney(comp.basicSalary ?? offer.salary, currency),
    'comp.performanceBonus': comp.performanceBonus != null ? formatMoney(comp.performanceBonus, currency) : '',
    'comp.walletSplit': comp.walletSplit != null ? formatMoney(comp.walletSplit, currency) : '',
    'comp.benefits': Array.isArray(comp.benefits) ? comp.benefits.join(', ') : (comp.benefits || ''),
  }

  // Coerce everything to string for the renderer.
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(values)) out[k] = v == null ? '' : String(v)
  return out
}

// Sample value map (from the reference letter) for previews when no real offer
// is selected yet.
export function sampleValues(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const v of VARIABLE_CATALOG) out[v.key] = v.sample
  return out
}

// ---------- rendering ----------

// Replaces {{ key }} and {{ key | upper }} / {{ key | lower }} tokens. Unknown
// tokens are left visible as [key] so template authors can spot mistakes.
export function renderTemplate(bodyHtml: string, values: Record<string, string>): string {
  if (!bodyHtml) return ''
  return bodyHtml.replace(/\{\{\s*([\w.]+)\s*(?:\|\s*(\w+)\s*)?\}\}/g, (_m, key: string, filter?: string) => {
    let v = values[key]
    if (v == null) return `[${key}]`
    if (filter === 'upper') v = v.toUpperCase()
    else if (filter === 'lower') v = v.toLowerCase()
    return v
  })
}

// Returns the placeholder keys actually referenced by a template body.
export function extractUsedVariables(bodyHtml: string): string[] {
  const set = new Set<string>()
  const re = /\{\{\s*([\w.]+)\s*(?:\|\s*\w+\s*)?\}\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(bodyHtml || ''))) set.add(m[1])
  return [...set]
}
