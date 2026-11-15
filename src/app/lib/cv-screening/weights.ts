// Maps a ScreeningProfile's criteria (user-defined weights on the scoring
// engine's existing technical/experience/education/softSkills buckets) into
// the `weights` shape calculateIndustryMatchScore/calculateAICVReviewScore
// already accept. v1 only supports re-weighting these four fixed buckets;
// free-form custom-named criteria would need new scoring logic in
// keywordExtractor.ts itself and is out of scope.
export const CRITERIA_KEYS = ['technical', 'experience', 'education', 'softSkills'] as const
export type CriterionKey = typeof CRITERIA_KEYS[number]

export interface ScreeningCriterion {
  key: CriterionKey
  label: string
  weight: number
}

const WEIGHT_SUM_TOLERANCE = 0.01

export function validateCriteria(criteria: unknown): { error?: string; criteria?: ScreeningCriterion[] } {
  if (!Array.isArray(criteria) || criteria.length === 0) {
    return { error: 'At least one criterion is required' }
  }

  const seenKeys = new Set<string>()
  const parsed: ScreeningCriterion[] = []

  for (const entry of criteria) {
    if (!entry || typeof entry !== 'object') {
      return { error: 'Each criterion must be an object with key, label and weight' }
    }
    const { key, label, weight } = entry as Record<string, unknown>
    if (typeof key !== 'string' || !CRITERIA_KEYS.includes(key as CriterionKey)) {
      return { error: `Invalid criterion key "${String(key)}". Allowed: ${CRITERIA_KEYS.join(', ')}` }
    }
    if (seenKeys.has(key)) {
      return { error: `Duplicate criterion key "${key}"` }
    }
    seenKeys.add(key)
    if (typeof label !== 'string' || !label.trim()) {
      return { error: `Criterion "${key}" requires a non-empty label` }
    }
    if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0 || weight > 1) {
      return { error: `Criterion "${key}" requires a weight between 0 and 1` }
    }
    parsed.push({ key: key as CriterionKey, label: label.trim(), weight })
  }

  const total = parsed.reduce((sum, c) => sum + c.weight, 0)
  if (Math.abs(total - 1) > WEIGHT_SUM_TOLERANCE) {
    return { error: `Criteria weights must sum to 1.0 (got ${total.toFixed(2)})` }
  }

  return { criteria: parsed }
}

export function buildWeightsFromCriteria(criteria: ScreeningCriterion[]): Partial<Record<CriterionKey, number>> {
  const weights: Partial<Record<CriterionKey, number>> = {}
  for (const c of criteria) {
    weights[c.key] = c.weight
  }
  return weights
}
