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
  
  return [...new Set(keywords)].slice(0, 50);
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
  const {
    useAIServices = false,
    weights = {
      technical: 0.4,
      experience: 0.3,
      education: 0.15,
      softSkills: 0.15
    }
  } = options;

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
  
  // Calculate overall weighted score
  const overallScore = 
    technicalScore * weights.technical +
    experienceScore * weights.experience +
    educationScore * weights.education +
    softSkillsScore * weights.softSkills;
  
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
    /(\d+)\+?\s*years?.*experience/gi,
    /experience.*(\d+)\+?\s*years?/gi
  ];
  
  let maxYears = 0;
  yearPatterns.forEach(pattern => {
    const matches = cvText.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const years = match.match(/\d+/);
        if (years) {
          const num = parseInt(years[0]);
          if (num > maxYears) maxYears = num;
        }
      });
    }
  });
  
  return Math.min(maxYears * 10, 100);
}

function calculateEducationScore(cvText: string): number {
  const education = {
    'phd': 100,
    'doctorate': 100,
    'masters': 80,
    'bachelor': 60,
    'associate': 40,
    'diploma': 30,
    'certificate': 20,
    'high school': 10
  };
  
  const lowerText = cvText.toLowerCase();
  let maxScore = 0;
  
  Object.entries(education).forEach(([level, score]) => {
    if (lowerText.includes(level)) {
      maxScore = Math.max(maxScore, score);
    }
  });
  
  return maxScore || 30;
}

function calculateSoftSkillsScore(cvText: string): number {
  const softSkills = [
    'leadership', 'communication', 'teamwork', 'collaboration',
    'problem solving', 'critical thinking', 'analytical',
    'adaptability', 'time management', 'project management'
  ];
  
  const lowerText = cvText.toLowerCase();
  const foundSkills = softSkills.filter(skill => lowerText.includes(skill));
  
  return (foundSkills.length / softSkills.length) * 100;
}

function analyzeSkillGaps(missingKeywords: string[]): {
  critical: string[];
  moderate: string[];
  minor: string[];
} {
  const criticalSkills = ['javascript', 'python', 'java', 'react', 'aws', 'nodejs'];
  const moderateSkills = ['typescript', 'angular', 'vue', 'mysql', 'mongodb', 'docker'];
  
  const gaps = {
    critical: [] as string[],
    moderate: [] as string[],
    minor: [] as string[]
  };
  
  missingKeywords.forEach(keyword => {
    const lowerKeyword = keyword.toLowerCase();
    
    if (criticalSkills.some(skill => lowerKeyword.includes(skill) || skill.includes(lowerKeyword))) {
      gaps.critical.push(keyword);
    } else if (moderateSkills.some(skill => lowerKeyword.includes(skill) || skill.includes(lowerKeyword))) {
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
    recommendations.push('Top-tier candidate - Immediate hire consideration');
    recommendations.push('Schedule executive interview within 48 hours');
  } else if (score >= 80) {
    recommendations.push('Strong candidate - Proceed with interviews');
    recommendations.push('Technical assessment recommended');
  } else if (score >= 70) {
    recommendations.push('Qualified candidate - Evaluate carefully');
    recommendations.push('Focus interview on skill gaps');
  } else if (score >= 60) {
    recommendations.push('Borderline candidate - Secondary option');
    recommendations.push('Only consider if no better candidates available');
  } else {
    recommendations.push('Not recommended - Consider rejection');
    recommendations.push('Keep in talent pool for future openings');
  }
  
  if (skillGaps.critical.length > 0) {
    recommendations.push(`Critical skill gaps: ${skillGaps.critical.slice(0, 3).join(', ')}`);
  }
  
  return recommendations;
}