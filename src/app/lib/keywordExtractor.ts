// src/app/lib/keywordExtractor.ts

export interface MatchResult {
  overallScore: number;
  technicalScore: number;
  softSkillsScore: number;
  experienceScore: number;
  educationScore: number;
  keywordMatches: Array<{
    keyword: string;
    matchType: 'exact' | 'synonym' | 'semantic' | 'ngram';
    confidence: number;
  }>;
  missingKeywords: string[];
  skillGapAnalysis: {
    critical: string[];
    moderate: string[];
    minor: string[];
  };
  recommendations: string[];
  industryBenchmark: number;
}

/**
 * Extract keywords from text
 */
export function extractKeywords(text: string): string[] {
  if (!text || text.trim().length === 0) return [];
  
  const stopWords = [
    'the', 'a', 'an', 'of', 'and', 'in', 'for', 'on', 'at', 'by', 'to', 'with',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'will', 'would', 'should', 'could', 'can', 'may', 'might', 'must', 'shall',
    'from', 'as', 'that', 'this', 'these', 'those', 'then', 'than', 'so', 'such',
    'too', 'very', 'just', 'also', 'only', 'about', 'above', 'below', 'under',
    'over', 'between', 'through', 'during', 'before', 'after', 'since', 'until'
  ];
  
  const cleanText = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  const words = cleanText.split(' ');
  
  const keywords = words.filter(word => 
    word.length > 3 && 
    !stopWords.includes(word) &&
    !/\d/.test(word)
  );
  
  return removeDuplicates(keywords).slice(0, 50);
}

/**
 * Remove duplicates from array
 */
function removeDuplicates<T>(array: T[]): T[] {
  return array.filter((value, index, self) => self.indexOf(value) === index);
}

/**
 * Calculate match score between job keywords and CV text
 */
export function calculateMatchScore(jobKeywords: string[], cvText: string): {
  matchCount: number;
  totalKeywords: number;
  percentage: number;
  matchedKeywords: string[];
  unmatchedKeywords: string[];
} {
  if (!cvText || !jobKeywords || jobKeywords.length === 0) {
    return {
      matchCount: 0,
      totalKeywords: jobKeywords?.length || 0,
      percentage: 0,
      matchedKeywords: [],
      unmatchedKeywords: jobKeywords || []
    };
  }

  const cleanCvText = cvText.toLowerCase();
  const matchedKeywords: string[] = [];
  const unmatchedKeywords: string[] = [];

  jobKeywords.forEach(keyword => {
    const lowerKeyword = keyword.toLowerCase();
    
    if (cleanCvText.includes(lowerKeyword)) {
      matchedKeywords.push(keyword);
    } else {
      unmatchedKeywords.push(keyword);
    }
  });

  const matchCount = matchedKeywords.length;
  const totalKeywords = jobKeywords.length;
  const percentage = totalKeywords > 0 ? (matchCount / totalKeywords) * 100 : 0;

  return {
    matchCount,
    totalKeywords,
    percentage,
    matchedKeywords,
    unmatchedKeywords
  };
}

/**
 * Industry-standard matching algorithm
 */
export function calculateIndustryMatchScore(
  jobDescription: string,
  cvText: string,
  options: {
    useAIServices?: boolean;
    weights?: {
      technical?: number;
      experience?: number;
      education?: number;
      softSkills?: number;
    };
  } = {}
): MatchResult {
  // Set defaults safely with nullish coalescing
  const useAIServices = options.useAIServices ?? false;
  
  // Ensure all weights have defaults
  const technicalWeight = options.weights?.technical ?? 0.4;
  const experienceWeight = options.weights?.experience ?? 0.3;
  const educationWeight = options.weights?.education ?? 0.15;
  const softSkillsWeight = options.weights?.softSkills ?? 0.15;

  // Extract keywords from job description
  const jobKeywords = extractKeywords(jobDescription);
  
  // Calculate basic keyword match
  const basicMatch = calculateMatchScore(jobKeywords, cvText);
  
  // Calculate additional scores
  const experienceScore = calculateExperienceScore(cvText);
  const educationScore = calculateEducationScore(cvText);
  const softSkillsScore = calculateSoftSkillsScore(cvText);
  
  // Calculate technical score based on keyword match
  const technicalScore = basicMatch.percentage;
  
  // Calculate overall weighted score - FIXED: Using safe values
  const overallScore = 
    technicalScore * technicalWeight +
    experienceScore * experienceWeight +
    educationScore * educationWeight +
    softSkillsScore * softSkillsWeight;
  
  // Determine keyword matches with confidence
  const keywordMatches = basicMatch.matchedKeywords.map(keyword => ({
    keyword,
    matchType: 'exact' as const,
    confidence: 1.0
  }));
  
  // Skill gap analysis
  const skillGapAnalysis = analyzeSkillGaps(basicMatch.unmatchedKeywords);
  
  // Generate recommendations
  const recommendations = generateRecommendations(overallScore, skillGapAnalysis);

  return {
    overallScore: parseFloat(overallScore.toFixed(1)),
    technicalScore: parseFloat(technicalScore.toFixed(1)),
    softSkillsScore: parseFloat(softSkillsScore.toFixed(1)),
    experienceScore: parseFloat(experienceScore.toFixed(1)),
    educationScore: parseFloat(educationScore.toFixed(1)),
    keywordMatches,
    missingKeywords: basicMatch.unmatchedKeywords,
    skillGapAnalysis,
    recommendations,
    industryBenchmark: 70
  };
}

// Helper functions
function calculateExperienceScore(cvText: string): number {
  const yearPatterns = [
    /(\d+)\+?\s*years?\s*(?:of)?\s*experience/gi,
    /experience\s*(?:of)?\s*(\d+)\+?\s*years?/gi,
    /(\d{4})\s*[-–—to]+\s*(?:present|current|date|now|202\d)/gi,
    /worked\s*(?:for|since)\s*(\d+)\s*years?/gi,
    /(\d+)\s*\+?\s*yrs?/gi,
  ];
  
  let maxYears = 0;
  yearPatterns.forEach(pattern => {
    const matches = cvText.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const years = match.match(/\d+/);
        if (years) {
          const num = parseInt(years[0]);
          if (num >= 1900) {
            // It's a year, not a duration — estimate from current year
            const currentYear = new Date().getFullYear();
            const estimatedYears = Math.min(currentYear - num, 40);
            if (estimatedYears > maxYears) maxYears = estimatedYears;
          } else if (num > maxYears && num <= 60) {
            maxYears = num;
          }
        }
      });
    }
  });
  
  return Math.min(maxYears * 10, 100);
}

function calculateEducationScore(cvText: string): number {
  const educationLevels: { pattern: RegExp; score: number }[] = [
    { pattern: /ph\.?d|doctorate|doctoral|d\.?phil/i, score: 100 },
    { pattern: /m\.?ba|master(?:'s|s)?\s*(?:of|in)?\s*(?:business|science|arts|engineering|technology)/i, score: 88 },
    { pattern: /master(?:'s|s)|m\.?sc|m\.?a|m\.?eng|post.?graduate/i, score: 80 },
    { pattern: /bachelor(?:'s|s)?|b\.?sc|b\.?a|b\.?eng|undergraduate|hnd|higher.?national.?diploma/i, score: 60 },
    { pattern: /associate(?:'s|s)?\s*(?:degree)?|a\.?a|a\.?s|ond|ordinary.?national.?diploma/i, score: 45 },
    { pattern: /diploma|nce|nigerian.?certificate|certificate\s*(?:of|in)?\s*(?:higher|advanced)/i, score: 35 },
    { pattern: /certificate|vocational|trade.?school|apprenticeship|nano.?degree|bootcamp/i, score: 25 },
    { pattern: /high.?school|secondary.?school|ssce|waec|neco|ged|a.?levels?|o.?levels?|ib.?diploma/i, score: 15 },
  ];
  
  const lowerText = cvText.toLowerCase();
  let maxScore = 0;
  let matchedLevel = '';
  
  for (const level of educationLevels) {
    if (level.pattern.test(lowerText) && level.score > maxScore) {
      maxScore = level.score;
      matchedLevel = level.pattern.source;
    }
  }
  
  // Boost for multiple qualifications
  const qualificationCount = educationLevels.filter(l => l.pattern.test(lowerText)).length;
  const multiQualBonus = Math.min(qualificationCount - 1, 3) * 3;
  
  return Math.min(maxScore + multiQualBonus, 100) || 30;
}

function calculateSoftSkillsScore(cvText: string): number {
  const softSkills = [
    'leadership', 'communication', 'teamwork', 'collaboration',
    'problem solving', 'critical thinking', 'analytical',
    'adaptability', 'time management', 'project management'
  ];
  
  const lowerText = cvText.toLowerCase();
  const foundSkills = softSkills.filter(skill => lowerText.includes(skill));
  
  return foundSkills.length > 0 ? (foundSkills.length / softSkills.length) * 100 : 50;
}

function analyzeSkillGaps(missingKeywords: string[]): {
  critical: string[];
  moderate: string[];
  minor: string[];
} {
  // Internationally-relevant critical skills across multiple domains
  const criticalPatterns: RegExp[] = [
    // Core programming & architecture
    /^(javascript|typescript|python|java|c#|go|rust|ruby|swift|kotlin|php|scala)$/i,
    // Cloud & DevOps
    /^(aws|azure|gcp|cloud|docker|kubernetes|terraform|ci\/?cd|devops|jenkins)$/i,
    // Data & ML
    /^(machine.?learning|ai|artificial.?intelligence|data.?science|deep.?learning|nlp|tensorflow|pytorch)$/i,
    // Leadership & management
    /^(leadership|strategy|stakeholder.?management|budget.?management|team.?lead|executive)$/i,
    // Security
    /^(security|cryptography|penetration.?testing|cyber.?security|compliance|gdpr|iso.?27001)$/i,
    // Database
    /^(sql|postgres|oracle|database.?design|data.?modeling|data.?warehouse|etl)$/i,
  ];

  const moderatePatterns: RegExp[] = [
    /^(react|angular|vue|next\.?js|node\.?js|express|django|flask|spring\.?boot|\.?net)$/i,
    /^(mongodb|redis|elasticsearch|rabbitmq|kafka|graphql|rest|api|microservices)$/i,
    /^(agile|scrum|kanban|jira|confluence|testing|unit.?test|integration.?test)$/i,
    /^(communication|presentation|negotiation|mentoring|coaching|training)$/i,
    /^(figma|sketch|adobe|ui\/?ux|user.?experience|design.?system|accessibility)$/i,
  ];
  
  const gaps = {
    critical: [] as string[],
    moderate: [] as string[],
    minor: [] as string[]
  };
  
  missingKeywords.forEach(keyword => {
    const lowerKeyword = keyword.toLowerCase();
    
    if (criticalPatterns.some(pat => pat.test(lowerKeyword))) {
      gaps.critical.push(keyword);
    } else if (moderatePatterns.some(pat => pat.test(lowerKeyword))) {
      gaps.moderate.push(keyword);
    } else {
      gaps.minor.push(keyword);
    }
  });
  
  return gaps;
}

function generateRecommendations(score: number, skillGaps: any): string[] {
  const recommendations: string[] = [];
  
  if (score >= 90) {
    recommendations.push('Exceptional candidate — Immediate hire recommended');
    recommendations.push('Schedule final interview within 48 hours');
    recommendations.push('Fast-track offer with competitive package');
  } else if (score >= 80) {
    recommendations.push('Strong candidate — Advance to final interview stage');
    recommendations.push('Conduct technical deep-dive or practical assessment');
    recommendations.push('Check references and verify claims');
  } else if (score >= 70) {
    recommendations.push('Qualified candidate — Include in interview shortlist');
    recommendations.push('Focus interview on identified skill gaps');
    recommendations.push('Consider pairing with a stronger candidate');
  } else if (score >= 60) {
    recommendations.push('Potential candidate — Hold for comparison');
    recommendations.push('Only proceed if top-tier pool is exhausted');
    recommendations.push('Consider for junior or adjacent roles');
  } else if (score >= 40) {
    recommendations.push('Below threshold — Not recommended for this role');
    recommendations.push('May be suitable for entry-level or different department');
    recommendations.push('Retain in talent pool for future openings');
  } else {
    recommendations.push('Not qualified — Decline or suggest other roles');
    recommendations.push('Encourage skill development in identified gap areas');
  }
  
  if (skillGaps.critical.length > 0) {
    recommendations.push(`Critical skill gaps: ${skillGaps.critical.slice(0, 4).join(', ')}`);
  }
  if (skillGaps.moderate.length > 0) {
    recommendations.push(`Moderate gaps to address: ${skillGaps.moderate.slice(0, 3).join(', ')}`);
  }
  
  return recommendations;
}