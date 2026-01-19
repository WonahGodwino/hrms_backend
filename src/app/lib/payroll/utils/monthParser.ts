// You can also add these helper functions to a separate utility file
// src/app/lib/payroll/utils/monthParser.ts

/**
 * Parse month from various formats:
 * - "September" -> 9
 * - "Sep" -> 9
 * - "9" -> 9
 * - "09" -> 9
 * - "2025-09-01" -> 9
 * - "September 2025" -> 9
 */
export function parseMonthFromString(monthInput: string): number {
  if (!monthInput) return 0
  
  const normalized = monthInput.toString().trim().toLowerCase()
  
  // Remove any year parts first
  const withoutYear = normalized.replace(/\s*\d{4}\s*$/, '').trim()
  
  const monthMap: Record<string, number> = {
    'january': 1, 'jan': 1,
    'february': 2, 'feb': 2,
    'march': 3, 'mar': 3,
    'april': 4, 'apr': 4,
    'may': 5,
    'june': 6, 'jun': 6,
    'july': 7, 'jul': 7,
    'august': 8, 'aug': 8,
    'september': 9, 'sep': 9,
    'october': 10, 'oct': 10,
    'november': 11, 'nov': 11,
    'december': 12, 'dec': 12,
  }
  
  // Check for month names
  if (monthMap[withoutYear]) {
    return monthMap[withoutYear]
  }
  
  // Check for numeric month
  const numericMonth = parseInt(withoutYear, 10)
  if (!isNaN(numericMonth) && numericMonth >= 1 && numericMonth <= 12) {
    return numericMonth
  }
  
  // Try to parse as date
  try {
    const date = new Date(normalized)
    if (!isNaN(date.getTime())) {
      return date.getMonth() + 1
    }
  } catch {}
  
  return 0
}

/**
 * Extract year from month string:
 * - "September 2025" -> 2025
 * - "2025-09-01" -> 2025
 * - "09/2025" -> 2025
 */
export function extractYearFromMonthString(monthInput: string): number {
  if (!monthInput) return new Date().getFullYear()
  
  const normalized = monthInput.toString().trim()
  
  // Look for 4-digit year
  const yearMatch = normalized.match(/\b(20\d{2})\b/)
  if (yearMatch) {
    return parseInt(yearMatch[1], 10)
  }
  
  // Try to parse as date
  try {
    const date = new Date(normalized)
    if (!isNaN(date.getTime())) {
      return date.getFullYear()
    }
  } catch {}
  
  // Default to current year
  return new Date().getFullYear()
}

/**
 * Get month name from month number
 */
export function getMonthName(monthNumber: number): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]
  return months[monthNumber - 1] || months[new Date().getMonth()]
}