// src/app/lib/offers/default-offer-template.ts
// The system default offer letter — a generic, fully-tokenized version of the
// standard letter of employment. No company-specific values are baked in; every
// specific is a {{placeholder}} resolved from company/candidate/job/offer data.
// New companies are seeded with this; they can then customize it in the builder.

export const DEFAULT_OFFER_TEMPLATE_NAME = 'Standard Letter of Employment'

export const DEFAULT_OFFER_TEMPLATE_HTML = `
<div style="text-align:right;margin-bottom:8px;">
  {{company.logo}}&nbsp;&nbsp;&nbsp;RC: {{company.rcNumber}}
</div>
<div style="text-align:center;border-top:2px solid #1e3a5f;border-bottom:2px solid #1e3a5f;padding:12px 0;margin:16px 0;">
  <h1 style="margin:0;font-size:22px;color:#1e3a5f;letter-spacing:1px;text-transform:uppercase;">{{company.name}}</h1>
</div>
<p style="text-align:right;"><em>Private &amp; Confidential</em></p>
<p>{{offer.letterDate}}</p>
<p><strong>{{candidate.fullName | upper}}</strong></p>
<p>Dear {{candidate.firstName}},</p>

<h2 style="text-align:center;color:#1e3a5f;">LETTER OF EMPLOYMENT</h2>

<p>This Employment Letter dated {{offer.effectiveDate}} is entered into between:</p>
<p><strong>{{company.name}}</strong>, a company duly registered under the laws of Nigeria with Registration No. {{company.rcNumber}} (hereinafter referred to as the "Company"), and</p>
<p><strong>{{candidate.fullName}}</strong>, residing at {{candidate.residentialState}}, with effect from {{offer.effectiveDate}}.</p>

<h3>Employment &amp; Place of Work</h3>
<p>During the period of this contract, you shall be seconded to
{{company.secondedCompany}} as {{job.title}}. This contract is valid for
{{terms.contractDuration}}, subject to satisfactory performance and conduct. Your
place of work shall be {{job.location}}.</p>
<p>You will report to your Line Manager ({{terms.lineManager}}) and follow their
direction on daily responsibilities and deliverables.</p>

<h3>Working Hours &amp; Tools</h3>
<p>The standard working week is {{terms.weeklyHours}} hours, Monday to Friday,
{{terms.dailyHours}} hours per day with a {{terms.lunchBreak}} lunch break. These
hours exclude public holidays declared by the Federal Government of Nigeria.
Extended hours or weekend work may be required based on operational needs.</p>
<p>The Company shall provide the necessary work tools to enable optimal
performance. All official correspondence shall be conducted via
{{company.communicationTool}}. Please ensure you have downloaded and configured
{{company.communicationTool}} prior to your resumption date.</p>

<h3>Job Description</h3>
<p>Your duties shall include but are not limited to:</p>
<div>{{job.description}}</div>

<h3>Compensation &amp; Benefits</h3>
<p>Your monthly remuneration package is set out below:</p>
<ul>
  <li>Basic Salary: {{comp.basicSalary}}</li>
  <li>Performance Bonus: {{comp.performanceBonus}}. This is contingent upon achievement of monthly KPIs.</li>
</ul>
<p>Your gross salary shall be paid at month-end, net of statutory deductions which will be itemised on your monthly payslip.</p>
<p>Additional benefits include: {{comp.benefits}}.</p>

<h3>Performance Management</h3>
<p>The Company places a strong emphasis on performance. Consistent high
performance shall be recognised and rewarded. Conversely, sustained
underperformance may result in termination of appointment following due process.</p>

<h3>Documentation &amp; Onboarding</h3>
<p>You will receive a secure link to complete your onboarding documentation. Please have the following ready:</p>
<ul>
  <li>Character Reference (Name, Address, and Contact Number)</li>
  <li>Previous Employer Details (Name and Contact Person)</li>
  <li>Proof of Identity (National ID, Voter's Card, International Passport, or Driver's Licence)</li>
  <li>Bank Account Details for salary payment</li>
  <li>Signed copy of this Offer Letter</li>
</ul>
<p>All information provided will be verified. Submission of false or misleading
information may result in disciplinary action, including termination.</p>

<h3>Probation &amp; Termination</h3>
<p>You shall undergo a probationary period of {{terms.probationPeriod}} from your
resumption date. During this period, either party may terminate the employment by
giving {{terms.noticePeriod}}' written notice, or payment in lieu thereof.
Confirmation of employment after probation is subject to satisfactory
performance.</p>
<p>After confirmation, the same notice period applies for termination by either
party. The Company reserves the right to terminate employment without notice in
cases of gross misconduct, ethical violations, or breach of the terms of
engagement. Consecutive failure to meet performance targets after two written
warnings may also result in termination.</p>
<p>Upon termination, you are required to return all Company property (ID card,
laptop, phone, POS terminal, etc.) on or before your final day.</p>

<h3>Code of Conduct &amp; Policies</h3>
<p>You are expected to comply with all Company policies, codes of conduct, and
regulations applicable to your duties and the business of
{{company.secondedCompany}}. You shall exercise reasonable care and skill,
comply with applicable laws, and maintain the highest standards of integrity.</p>

<h3>Confidentiality</h3>
<p>You shall treat all information and data that come into your possession by
virtue of this appointment as strictly confidential. You undertake not to
disclose any such information to any third party without the express written
authorisation of {{company.secondedCompany}}. This obligation survives the
termination of your employment.</p>

<h3>Governing Law &amp; Dispute Resolution</h3>
<p>This contract shall be governed by and construed in accordance with
{{company.governingLaw}}. Any dispute arising from or in connection with this
contract which cannot be settled amicably shall be referred to a sole arbitrator
jointly appointed by the parties in accordance with the Arbitration and
Conciliation Act, Laws of the Federation of Nigeria. The venue of the arbitration
shall be {{company.arbitrationVenue}} and the language of the proceedings shall
be English. The arbitrator's award shall be final and binding on both parties.</p>

<h3>General Provisions</h3>
<p>It is a condition of your employment that you strictly adhere to the terms and
conditions of service of {{company.name}}/{{company.secondedCompany}} and comply
with all safety rules, regulations, and site practices. Failure to do so shall
constitute gross misconduct and may result in summary dismissal.</p>
<p>Kindly signify your acceptance of the terms and conditions of this contract by
appending your signature in the space provided below.</p>

<p>Sincerely,</p>
<p><strong>{{company.hrRepName}}</strong><br/>{{company.hrRepTitle}}<br/>For: {{company.name}}</p>

<hr style="margin:32px 0;"/>
<h3>Acceptance of Offer</h3>
<p>I, ______________________________, have read, fully understand, and hereby
accept the terms and conditions set forth in this Letter of Employment. I
undertake to be bound by them and any lawful amendments made thereafter.</p>
<p>Signature: ______________________&nbsp;&nbsp;&nbsp;&nbsp;Date: ____________________</p>
`.trim()
