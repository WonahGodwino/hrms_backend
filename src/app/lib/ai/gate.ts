// [ai-assistant] Data gate — strips fields the company has not made visible to the AI.
import { categoryOf, ALWAYS_HIDDEN, type DataCategory } from './categories'

const HIDDEN_PLACEHOLDER = '[hidden by company policy]'

export function gateStaffData(
  records: Record<string, unknown>[],
  visibleCategories: string[],
): Record<string, unknown>[] {
  return records.map((record) => {
    const gated: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(record)) {
      const cat = categoryOf(key)
      if (cat === 'system') continue
      if ((ALWAYS_HIDDEN as readonly string[]).includes(cat)) {
        gated[key] = HIDDEN_PLACEHOLDER
        continue
      }
      if (!visibleCategories.includes(cat)) {
        gated[key] = HIDDEN_PLACEHOLDER
        continue
      }
      gated[key] = value
    }
    return gated
  })
}

export function canAccessAggregate(
  aggregateCategory: DataCategory,
  visibleCategories: string[],
): boolean {
  if ((ALWAYS_HIDDEN as readonly string[]).includes(aggregateCategory)) return false
  return visibleCategories.includes(aggregateCategory)
}
