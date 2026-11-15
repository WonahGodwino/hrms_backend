// Registration risk score (document section 6.3), pure so it is easy to test and
// tune. "Allow with checks" means the phone code, which medium-risk sign-ups need.
// Reasons are for the Super_Admin console only; they are never shown to the person
// signing up.
export interface RiskSignals {
  disposableEmail: boolean
  /** Reserved/test/role/look-alike address: never a genuine company sign-up. */
  badEmail: boolean
  domainNoMail: boolean
  domainVeryNew: boolean
  rcNumberReused: boolean
  /** Dojah/CAC lookup could not be completed (provider down); a person must look. */
  rcUnverified: boolean
  phoneReused: boolean
  taxIdReused: boolean
  sameDevice: boolean
  sameNetworkRecent: boolean
  similarCompanyName: boolean
  /** Same person name (order/titles ignored) already used with another email. */
  hrNameExact: boolean
  /** Very similar person name already used with another email. */
  hrNameSimilar: boolean
  freeMailAddress: boolean
  companyDomainEmail: boolean
}

export type RiskDecision = 'ALLOW' | 'ALLOW_WITH_CHECKS' | 'HOLD' | 'DECLINE'

export interface RiskResult {
  score: number
  decision: RiskDecision
  reasons: string[]
}

const POINTS = {
  disposableEmail: 100,
  badEmail: 100,
  domainNoMail: 40,
  domainVeryNew: 40,
  rcNumberReused: 100,
  rcUnverified: 70,
  phoneReused: 70,
  taxIdReused: 70,
  sameDevice: 50,
  sameNetworkRecent: 20,
  similarCompanyName: 40,
  hrNameExact: 100,
  hrNameSimilar: 70,
  freeMailAddress: 10,
  trustBonus: -30,
} as const

export function scoreSignup(s: RiskSignals): RiskResult {
  let score = 0
  const reasons: string[] = []
  const add = (flag: boolean, pts: number, reason: string) => {
    if (!flag) return
    score += pts
    reasons.push(reason)
  }

  add(s.disposableEmail, POINTS.disposableEmail, 'Disposable email domain')
  add(s.badEmail, POINTS.badEmail, 'Test, reserved, role or look-alike email address')
  add(s.domainNoMail, POINTS.domainNoMail, 'Email domain cannot receive mail')
  add(s.domainVeryNew, POINTS.domainVeryNew, 'Email domain registered in the last 30 days')
  add(s.rcNumberReused, POINTS.rcNumberReused, 'Registration number already used by another trial')
  add(s.rcUnverified, POINTS.rcUnverified, 'Registration number could not be verified with CAC (provider unavailable)')
  add(s.phoneReused, POINTS.phoneReused, 'Phone number already used')
  add(s.taxIdReused, POINTS.taxIdReused, 'Tax ID already used by another trial')
  add(s.sameDevice, POINTS.sameDevice, 'Same device as an earlier trial')
  add(s.sameNetworkRecent, POINTS.sameNetworkRecent, 'Same network as a trial in the last 7 days')
  add(s.similarCompanyName, POINTS.similarCompanyName, 'Company name over 85% similar to an existing trial')
  add(s.hrNameExact, POINTS.hrNameExact, 'HR name already used with a different email')
  add(!s.hrNameExact && s.hrNameSimilar, POINTS.hrNameSimilar, 'HR name very similar to one already used with a different email')
  add(s.freeMailAddress, POINTS.freeMailAddress, 'Free mail address')

  // The trust bonus never offsets a repeat-trial signal.
  const repeatSignal = s.phoneReused || s.taxIdReused || s.sameDevice || s.similarCompanyName || s.sameNetworkRecent || s.hrNameSimilar || s.domainVeryNew
  if (s.companyDomainEmail && !s.freeMailAddress && !repeatSignal && !s.rcUnverified) {
    score += POINTS.trustBonus
    reasons.push('Company-domain email with an accepted registration number')
  }
  score = Math.max(0, score)

  // Hard blocks regardless of total.
  if (s.disposableEmail || s.badEmail || s.rcNumberReused || s.hrNameExact) {
    return { score: Math.max(score, 100), decision: 'DECLINE', reasons }
  }
  // Never auto-clear these: a person decides.
  if (s.rcUnverified || s.hrNameSimilar) {
    return { score: Math.min(Math.max(score, 70), 99), decision: 'HOLD', reasons }
  }

  const decision: RiskDecision = score >= 100 ? 'DECLINE' : score >= 70 ? 'HOLD' : score >= 30 ? 'ALLOW_WITH_CHECKS' : 'ALLOW'
  return { score, decision, reasons }
}
