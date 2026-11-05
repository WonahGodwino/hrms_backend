// Registration risk score (document section 6.3), pure so it is easy to test and
// tune. Card authorisation is deferred, so "allow with checks" means the phone
// code, which every sign-up needs anyway. Reasons are for the Super_Admin
// console only; they are never shown to the person signing up.
export interface RiskSignals {
  disposableEmail: boolean
  domainNoMailOrVeryNew: boolean
  rcNumberReused: boolean
  phoneReused: boolean
  sameDevice: boolean
  sameNetworkRecent: boolean
  similarCompanyName: boolean
  freeMailAddress: boolean
  hasRcNumber: boolean
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
  domainNoMailOrVeryNew: 40,
  rcNumberReused: 100,
  phoneReused: 70,
  sameDevice: 50,
  sameNetworkRecent: 20,
  similarCompanyName: 40,
  freeMailAddress: 10,
  trustBonus: -30,
  missingRc: 30,
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
  add(s.domainNoMailOrVeryNew, POINTS.domainNoMailOrVeryNew, 'Email domain cannot receive mail or is very new')
  add(s.rcNumberReused, POINTS.rcNumberReused, 'Registration number already used by another trial')
  add(s.phoneReused, POINTS.phoneReused, 'Phone number already used')
  add(s.sameDevice, POINTS.sameDevice, 'Same device as an earlier trial')
  add(s.sameNetworkRecent, POINTS.sameNetworkRecent, 'Same network as a trial in the last 7 days')
  add(s.similarCompanyName, POINTS.similarCompanyName, 'Company name over 85% similar to an existing trial')
  add(s.freeMailAddress, POINTS.freeMailAddress, 'Free mail address')
  // No RC number: tighter limits plus a nudge towards review, per the sign-up decision.
  add(!s.hasRcNumber, POINTS.missingRc, 'No registration number supplied')

  // The trust bonus never offsets a repeat-trial signal.
  const repeatSignal = s.phoneReused || s.sameDevice || s.similarCompanyName || s.sameNetworkRecent
  if (s.companyDomainEmail && s.hasRcNumber && !s.freeMailAddress && !repeatSignal) {
    score += POINTS.trustBonus
    reasons.push('Company-domain email with registration number')
  }
  score = Math.max(0, score)

  // Hard blocks regardless of total.
  if (s.disposableEmail || s.rcNumberReused) return { score: Math.max(score, 100), decision: 'DECLINE', reasons }

  const decision: RiskDecision = score >= 100 ? 'DECLINE' : score >= 70 ? 'HOLD' : score >= 30 ? 'ALLOW_WITH_CHECKS' : 'ALLOW'
  return { score, decision, reasons }
}

// Sign-ups without an RC number run on the tighter limit profile.
export function limitsProfileFor(s: Pick<RiskSignals, 'hasRcNumber'>): 'standard' | 'tight' {
  return s.hasRcNumber ? 'standard' : 'tight'
}
