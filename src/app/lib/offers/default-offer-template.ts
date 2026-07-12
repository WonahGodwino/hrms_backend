// src/app/lib/offers/default-offer-template.ts
// The system default offer letter — a generic, fully-tokenized version of the
// standard letter of employment. No company-specific values are baked in; every
// specific is a {{placeholder}} resolved from company/candidate/job/offer data.
// New companies are seeded with this; they can then customize it in the builder.

export const DEFAULT_OFFER_TEMPLATE_NAME = 'Standard Letter of Employment'

export const DEFAULT_OFFER_TEMPLATE_HTML = `
<p><strong>RC: {{company.rcNumber}}</strong></p>
<p><em>Private and Confidential</em></p>
<p>{{offer.letterDate}}</p>
<p><strong>{{candidate.fullName | upper}}</strong></p>
<p>Dear {{candidate.firstName}},</p>

<h2 style="text-align:center;">LETTER OF EMPLOYMENT</h2>

<p>This Employment Letter dated {{offer.effectiveDate}} is entered between:
{{company.name}}, company registration No. {{company.rcNumber}} and
{{candidate.fullName}}, residing at {{candidate.residentialState}}, with effect
from {{offer.effectiveDate}}.</p>

<h3>Employment &amp; Place of Work</h3>
<p>During the period of this contract, you will be seconded to
{{company.secondedCompany}} as {{job.title}}.</p>
<p>This contract is valid for {{terms.contractDuration}}, subject to good
performance and attitude.</p>
<p>Job Location: {{job.location}}.</p>
<p>You will be working with and reporting to your Line Manager
({{terms.lineManager}}) on a daily basis and rely on him/her for directions and
instructions.</p>
<p><strong>Working Hours</strong> – The normal working hours is
{{terms.weeklyHours}} hours per week. The typical working hours are Monday to
Friday, {{terms.dailyHours}} hours per day, inclusive of a lunch break of
{{terms.lunchBreak}}, but the working schedule may be adjusted according to the
needs of {{company.secondedCompany}}. The above days of work exclude national
public holidays declared by the Federal Government of Nigeria. You may however be
required from time to time to work extended hours and/or weekends and public
holidays as demanded by exigencies of work.</p>
<p><strong>Work Tool</strong> – The seconded company shall provide work tools to
enable you perform optimally. All official communication shall be done using the
organization's official communication tool – {{company.communicationTool}}.
Therefore, you are required to download the App ({{company.communicationTool}})
upon acceptance of this offer.</p>

<h3>Job Description</h3>
<p>Includes but not limited to:</p>
<div>{{job.description}}</div>

<h3>Compensation &amp; Benefits</h3>
<p>Your Monthly Gross Pay shall be as follows:</p>
<ul>
  <li>Basic – {{comp.basicSalary}}</li>
  <li>Performance bonus – {{comp.performanceBonus}}. This amount is subject to
  performance and achievement of your monthly KPIs.</li>
</ul>
<p>Your final gross salary shall be paid at the end of the month, subject to
statutory deductions, which shall be duly broken down on your monthly pay slip.</p>
<p>Other benefits shall include – {{comp.benefits}}.</p>

<h3>Performance Metrics</h3>
<p>Please note that performance will be taken very seriously. An excellent
performance will be rewarded, while consecutive poor performance shall lead to
termination of appointment.</p>

<h3>Documentation &amp; Verification</h3>
<p>To capture your information, a link will be sent to you to complete within a
stipulated time. Kindly make the following documents available while waiting for
the link:</p>
<ul>
  <li>Character Reference Details (Name, Contact Address and Phone Number)</li>
  <li>Previous Employer details (Name and Contact Person Info)</li>
  <li>Proof of Identity (National ID Card, Voter's Card, Int'l Passport, etc.)</li>
  <li>A preferred Bank Account detail for salary payment</li>
  <li>Signed copy of this offer letter</li>
</ul>
<p>You are expected to provide accurate information when completing your
documentation pack, as all information will be verified. Provision of false
information may lead to termination of appointment.</p>

<h3>Probation &amp; Termination</h3>
<p>The Employee shall undergo a probationary period of {{terms.probationPeriod}}
from date of resumption. During this period, the appointment may be terminated by
either party in writing and giving {{terms.noticePeriod}}' notice or payment of
salary in lieu of notice. After the probation period, confirmation of employment
is subject to the employee's performance, and the same {{terms.noticePeriod}}'
notice (or payment in lieu) shall apply upon termination by either party after
confirmation.</p>
<p>Your employment may also be terminated expressly (without notice) if you are
involved in any unethical practice or gross misconduct, or you violate any of the
terms and conditions of your engagement; and with {{terms.noticePeriod}}' notice
if you fall short of the set performance target consecutively after two (2)
written warnings.</p>
<p>Upon termination of employment, you shall return to the Company all property
(ID Card, Laptop, Phone, headset, charger, POS, etc.) in your possession on or
before the final day of exit.</p>

<h3>Codes of Conduct and Other Policies</h3>
<p>The Employee shall comply with all codes of conduct and all other rules and
regulations applicable to the Employee's duties and to the business of the
seconded organization ({{company.secondedCompany}}). You shall exercise
reasonable care and skill in the performance of your duties, comply with
applicable laws, and act ethically with integrity.</p>

<h3>Confidentiality</h3>
<p>You agree to keep company secrets confidential at all times, including all
information and data which come into your possession as a result of this
appointment relating in any way to the affairs or business of
{{company.secondedCompany}}, its customers or your direct supervisor. You
undertake not to divulge such information to any third party except on the
express written instructions of {{company.secondedCompany}}.</p>

<h3>Governing Law and Dispute Resolution</h3>
<p>This contract shall be governed and construed in accordance with the
{{company.governingLaw}}. Any dispute arising out of or in connection with this
contract which cannot be amicably settled shall be resolved by a sole arbitrator
jointly appointed by the parties in accordance with the Arbitration and
Conciliation Act, Laws of the Federation of Nigeria. The venue of the arbitration
shall be {{company.arbitrationVenue}} and the language of the arbitration shall be
English. The award of the arbitrator shall be final and the parties agree to be
bound by it.</p>

<h3>General</h3>
<p>It is a condition of this contract of employment that you will abide strictly
by the terms and conditions of service of {{company.name}} /
{{company.secondedCompany}} and comply strictly with the safety rules,
regulations and practices on site, as failure to do so at any time shall be
regarded as gross misconduct which may result in your dismissal.</p>
<p>Kindly signify your acceptance of the terms and conditions of this contract by
appending your signature in the space provided hereunder.</p>

<p>Yours faithfully,<br/>For: {{company.name}}</p>
<p><strong>{{company.hrRepName}}</strong><br/>{{company.hrRepTitle}}</p>

<hr/>
<h3>Acceptance of Offer</h3>
<p>I, ______________________________ of ______________________________ have read,
fully understand and hereby accept the terms and conditions stated above and
undertake to be bound by them or any additions or amendments therein in the
discharge of my duties.</p>
<p>Signature: ______________________&nbsp;&nbsp;&nbsp;&nbsp;Date: ____________________</p>
`.trim()
