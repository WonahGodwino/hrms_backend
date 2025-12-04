// src/app/lib/keywordExtractor.ts

export function extractKeywords(description: string): string[] {
  const stopWords = [
    'the', 'a', 'an', 'of', 'and', 'in', 'for', 'on', 'at', 'by', 'to', 'with',
  ]
  const words = description.split(/\s+/).map((word) => word.toLowerCase())
  return words.filter((word) => !stopWords.includes(word) && word.length > 3) // Filter out stop words and short words
}
