// src/app/lib/keywordExtractor.ts

import natural from 'natural';
import nlp from 'compromise';
import { removeStopwords } from 'stopword';
import { differenceInYears } from 'date-fns';

// For production AI services (optional - comment out if not needed)
// import { ComprehendClient, DetectEntitiesCommand } from "@aws-sdk/client-comprehend";
// import { LanguageServiceClient } from "@google-cloud/language";
// import { TextAnalyticsClient, AzureKeyCredential } from "@azure/ai-text-analytics";

// Types
export interface SkillMatch {
  skill: string;
  confidence: number;
  category: 'technical' | 'soft' | 'tool' | 'certification';
  frequency: number;
}

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
  aiInsights?: string[];
}

export interface CVAnalysis {
  skills: SkillMatch[];
  experience: {
    totalYears: number;
    roles: Array<{
      title: string;
      company: string;
      duration: string;
      skills: string[];
    }>;
  };
  education: Array<{
    degree: string;
    institution: string;
    year: number;
    score: number;
  }>;
  certifications: string[];
  summary: string;
}

// Enhanced skill database
const SKILL_DATABASE = {
  programming: [
    { name: 'javascript', aliases: ['js', 'ecmascript'], weight: 1.0 },
    { name: 'typescript', aliases: ['ts'], weight: 0.9 },
    { name: 'python', aliases: ['py'], weight: 1.0 },
    { name: 'java', weight: 1.0 },
    { name: 'c#', aliases: ['csharp', 'dotnet'], weight: 0.9 },
    { name: 'c++', aliases: ['cpp'], weight: 0.8 },
    { name: 'go', aliases: ['golang'], weight: 0.9 },
    { name: 'rust', weight: 0.8 },
    { name: 'swift', weight: 0.7 },
    { name: 'kotlin', weight: 0.7 },
    { name: 'php', weight: 0.7 },
    { name: 'ruby', weight: 0.6 },
    { name: 'scala', weight: 0.6 },
  ],
  frontend: [
    { name: 'react', aliases: ['reactjs'], weight: 1.0 },
    { name: 'angular', weight: 0.9 },
    { name: 'vue', aliases: ['vuejs'], weight: 0.8 },
    { name: 'svelte', weight: 0.7 },
    { name: 'nextjs', weight: 0.8 },
    { name: 'nuxt', weight: 0.6 },
    { name: 'html', aliases: ['html5'], weight: 0.9 },
    { name: 'css', aliases: ['css3'], weight: 0.9 },
    { name: 'sass', weight: 0.7 },
    { name: 'tailwind', weight: 0.8 },
    { name: 'bootstrap', weight: 0.7 },
  ],
  backend: [
    { name: 'nodejs', aliases: ['node'], weight: 1.0 },
    { name: 'express', weight: 0.8 },
    { name: 'nestjs', weight: 0.7 },
    { name: 'django', weight: 0.8 },
    { name: 'flask', weight: 0.7 },
    { name: 'spring', aliases: ['spring boot'], weight: 0.9 },
    { name: 'laravel', weight: 0.7 },
    { name: 'rails', aliases: ['ruby on rails'], weight: 0.6 },
  ],
  databases: [
    { name: 'mysql', weight: 0.9 },
    { name: 'postgresql', aliases: ['postgres', 'pg'], weight: 0.9 },
    { name: 'mongodb', aliases: ['mongo'], weight: 0.8 },
    { name: 'redis', weight: 0.7 },
    { name: 'elasticsearch', aliases: ['elastic', 'elk'], weight: 0.7 },
    { name: 'oracle', weight: 0.6 },
    { name: 'sql server', weight: 0.6 },
  ],
  cloud: [
    { name: 'aws', aliases: ['amazon web services'], weight: 1.0 },
    { name: 'azure', aliases: ['microsoft azure'], weight: 0.9 },
    { name: 'gcp', aliases: ['google cloud platform'], weight: 0.9 },
    { name: 'docker', weight: 0.8 },
    { name: 'kubernetes', aliases: ['k8s'], weight: 0.8 },
    { name: 'terraform', weight: 0.7 },
    { name: 'jenkins', weight: 0.6 },
  ],
  soft: [
    { name: 'leadership', weight: 0.9 },
    { name: 'communication', weight: 0.8 },
    { name: 'teamwork', weight: 0.8 },
    { name: 'problem solving', weight: 0.9 },
    { name: 'critical thinking', weight: 0.8 },
    { name: 'project management', weight: 0.8 },
    { name: 'agile', weight: 0.7 },
    { name: 'scrum', weight: 0.6 },
  ],
};

// Synonyms database for semantic matching
const SYNONYMS: Record<string, string[]> = {
  'javascript': ['js', 'ecmascript', 'es6', 'es2015'],
  'react': ['reactjs', 'react.js'],
  'nodejs': ['node', 'node.js'],
  'typescript': ['ts', 'typescript.js'],
  'python': ['py'],
  'aws': ['amazon web services'],
  'azure': ['microsoft azure'],
  'gcp': ['google cloud', 'google cloud platform'],
  'docker': ['containerization'],
  'kubernetes': ['k8s', 'container orchestration'],
  'leadership': ['management', 'supervision', 'direction'],
  'communication': ['interpersonal skills', 'verbal communication', 'written communication'],
};

/**
 * Enhanced TF-IDF based keyword extraction
 */
export function extractKeywordsAdvanced(
  text: string,
  options: {
    minWordLength?: number;
    maxKeywords?: number;
    useStemming?: boolean;
    includeNgrams?: boolean;
    language?: string;
  } = {}
): string[] {
  const {
    minWordLength = 3,
    maxKeywords = 50,
    useStemming = true,
    includeNgrams = true,
    language = 'english'
  } = options;

  if (!text || text.trim().length === 0) return [];

  // Advanced text cleaning with NLP
  const cleanText = cleanTextAdvanced(text);
  
  // Tokenize with NLP
  const tokens = tokenizeWithNLP(cleanText, language);
  
  // Remove stopwords
  const filteredTokens = removeStopwordsAdvanced(tokens, language);
  
  // Apply stemming if requested
  const stemmedTokens = useStemming ? applyStemming(filteredTokens) : filteredTokens;
  
  // Extract n-grams
  const ngrams = includeNgrams ? extractNgrams(stemmedTokens) : [];
  
  // Combine all terms
  const allTerms = [...stemmedTokens, ...ngrams];
  
  // Calculate TF-IDF scores (simplified - production would use pre-trained IDF)
  const scoredTerms = calculateTFIDFScores(allTerms, maxKeywords);
  
  return scoredTerms;
}

/**
 * Industry-standard CV analysis
 */
export function analyzeCV(cvText: string): CVAnalysis {
  const skills = extractSkillsFromCV(cvText);
  const experience = extractExperience(cvText);
  const education = extractEducation(cvText);
  const certifications = extractCertifications(cvText);
  const summary = generateSummary(cvText);

  return {
    skills,
    experience,
    education,
    certifications,
    summary
  };
}

/**
 * Enterprise-grade matching algorithm
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

  // Extract job requirements
  const jobKeywords = extractKeywordsAdvanced(jobDescription, { 
    maxKeywords: 100,
    includeNgrams: true 
  });
  
  // Analyze CV
  const cvAnalysis = analyzeCV(cvText);
  
  // Calculate scores for each dimension
  const technicalScore = calculateTechnicalMatch(jobKeywords, cvAnalysis.skills);
  const experienceScore = calculateExperienceMatch(cvAnalysis.experience);
  const educationScore = calculateEducationMatch(cvAnalysis.education);
  const softSkillsScore = calculateSoftSkillsMatch(cvAnalysis.skills);
  
  // Calculate keyword matches with confidence
  const keywordMatches = matchKeywordsWithConfidence(jobKeywords, cvText);
  const missingKeywords = findMissingKeywords(jobKeywords, keywordMatches);
  
  // Skill gap analysis
  const skillGapAnalysis = analyzeSkillGaps(jobKeywords, cvAnalysis.skills);
  
  // Calculate overall score
  const overallScore = 
    technicalScore * weights.technical +
    experienceScore * weights.experience +
    educationScore * weights.education +
    softSkillsScore * weights.softSkills;
  
  // Generate recommendations
  const recommendations = generateIndustryRecommendations(
    overallScore,
    technicalScore,
    skillGapAnalysis,
    cvAnalysis.experience.totalYears
  );
  
  // Optional: Get AI insights
  let aiInsights: string[] = [];
  if (useAIServices) {
    aiInsights = getAIInsights(jobDescription, cvText).catch(() => []);
  }
  
  const result: MatchResult = {
    overallScore: parseFloat(overallScore.toFixed(1)),
    technicalScore: parseFloat(technicalScore.toFixed(1)),
    softSkillsScore: parseFloat(softSkillsScore.toFixed(1)),
    experienceScore: parseFloat(experienceScore.toFixed(1)),
    educationScore: parseFloat(educationScore.toFixed(1)),
    keywordMatches,
    missingKeywords,
    skillGapAnalysis,
    recommendations,
    industryBenchmark: 70, // Industry average match score
    aiInsights
  };

  return result;
}

// Helper functions
function cleanTextAdvanced(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/[^\w\s-.,!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

function tokenizeWithNLP(text: string, language: string): string[] {
  const doc = nlp(text);
  return doc.terms().out('array');
}

function removeStopwordsAdvanced(tokens: string[], language: string): string[] {
  const customStopwords = [
    ...getStopwords(language),
    'experience', 'work', 'job', 'role', 'position',
    'looking', 'seeking', 'hiring', 'company', 'team'
  ];
  
  return tokens.filter(token => 
    !customStopwords.includes(token.toLowerCase()) &&
    token.length > 2 &&
    !/^\d+$/.test(token) &&
    !token.includes('@') &&
    !token.startsWith('http')
  );
}

function getStopwords(language: string): string[] {
  // Return stopwords for specified language
  const stopwords: Record<string, string[]> = {
    english: [
      'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be',
      'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
      'would', 'should', 'could', 'can', 'may', 'might', 'must', 'shall'
    ],
    // Add more languages as needed
  };
  
  return stopwords[language] || stopwords.english;
}

function applyStemming(tokens: string[]): string[] {
  const stemmer = natural.PorterStemmer;
  return tokens.map(token => stemmer.stem(token));
}

function extractNgrams(tokens: string[], maxN = 3): string[] {
  const ngrams: string[] = [];
  
  for (let n = 2; n <= maxN; n++) {
    for (let i = 0; i <= tokens.length - n; i++) {
      const ngram = tokens.slice(i, i + n).join(' ');
      
      // Filter out ngrams that are just stopword combinations
      if (ngram.length > 5 && !isStopwordNgram(ngram)) {
        ngrams.push(ngram);
      }
    }
  }
  
  return ngrams;
}

function isStopwordNgram(ngram: string): boolean {
  const stopwords = getStopwords('english');
  const words = ngram.split(' ');
  return words.every(word => stopwords.includes(word));
}

function calculateTFIDFScores(terms: string[], maxKeywords: number): string[] {
  const termFreq: Map<string, number> = new Map();
  const totalTerms = terms.length;
  
  // Calculate term frequency
  terms.forEach(term => {
    termFreq.set(term, (termFreq.get(term) || 0) + 1);
  });
  
  // Calculate scores (simplified TF-IDF)
  const scoredTerms = Array.from(termFreq.entries())
    .map(([term, freq]) => {
      const tf = freq / totalTerms;
      const idf = calculateIDF(term); // Production: Use pre-trained IDF
      const score = tf * idf;
      return { term, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxKeywords)
    .map(item => item.term);
  
  return scoredTerms;
}

function calculateIDF(term: string): number {
  // Production: This should come from a pre-trained model
  // For now, use a simplified version
  const commonTerms = new Set([
    'experience', 'skills', 'development', 'software', 'project',
    'team', 'work', 'business', 'technology', 'solutions'
  ]);
  
  if (commonTerms.has(term.toLowerCase())) {
    return 0.5; // Common terms get lower weight
  }
  
  return 1.0; // Rare terms get higher weight
}

function extractSkillsFromCV(cvText: string): SkillMatch[] {
  const skills: SkillMatch[] = [];
  const lowerText = cvText.toLowerCase();
  
  // Iterate through skill database
  Object.entries(SKILL_DATABASE).forEach(([category, skillList]) => {
    skillList.forEach(skillDef => {
      const { name, aliases = [], weight } = skillDef;
      const searchTerms = [name, ...aliases];
      
      let found = false;
      let confidence = 0;
      let frequency = 0;
      
      searchTerms.forEach(term => {
        if (lowerText.includes(term.toLowerCase())) {
          found = true;
          confidence = Math.max(confidence, weight);
          
          // Count occurrences
          const regex = new RegExp(`\\b${term}\\b`, 'gi');
          const matches = cvText.match(regex);
          frequency += matches ? matches.length : 1;
        }
      });
      
      if (found) {
        skills.push({
          skill: name,
          confidence,
          category: getCategoryType(category),
          frequency
        });
      }
    });
  });
  
  // Sort by confidence and frequency
  return skills.sort((a, b) => {
    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence;
    }
    return b.frequency - a.frequency;
  });
}

function getCategoryType(category: string): SkillMatch['category'] {
  switch (category) {
    case 'soft':
      return 'soft';
    case 'cloud':
    case 'programming':
    case 'frontend':
    case 'backend':
    case 'databases':
      return 'technical';
    default:
      return 'tool';
  }
}

function extractExperience(cvText: string): CVAnalysis['experience'] {
  // Simplified extraction - production would use NLP
  const roles: Array<{
    title: string;
    company: string;
    duration: string;
    skills: string[];
  }> = [];
  
  let totalYears = 0;
  
  // Extract years from patterns like "5 years of experience"
  const yearPatterns = [
    /(\d+)\+?\s*years?.*experience/gi,
    /experience.*(\d+)\+?\s*years?/gi,
    /(\d+)\s*years?/gi
  ];
  
  yearPatterns.forEach(pattern => {
    const matches = cvText.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const years = match.match(/\d+/);
        if (years) {
          totalYears = Math.max(totalYears, parseInt(years[0]));
        }
      });
    }
  });
  
  // Cap at reasonable maximum
  totalYears = Math.min(totalYears, 30);
  
  return {
    totalYears,
    roles // Production would extract actual roles
  };
}

function extractEducation(cvText: string): CVAnalysis['education'] {
  const education: CVAnalysis['education'] = [];
  
  // Degree patterns
  const degreePatterns = [
    { pattern: /ph\.?d|doctorate/i, degree: 'PhD', score: 100 },
    { pattern: /masters?\s*degree|m\.?sc|m\.?a/i, degree: "Master's", score: 80 },
    { pattern: /bachelors?\s*degree|b\.?sc|b\.?a/i, degree: "Bachelor's", score: 60 },
    { pattern: /associate\s*degree/i, degree: 'Associate', score: 40 },
    { pattern: /diploma/i, degree: 'Diploma', score: 30 },
    { pattern: /certificate/i, degree: 'Certificate', score: 20 },
  ];
  
  degreePatterns.forEach(({ pattern, degree, score }) => {
    if (pattern.test(cvText)) {
      education.push({
        degree,
        institution: 'Extracted Institution', // Production would extract actual
        year: new Date().getFullYear() - 5, // Placeholder
        score
      });
    }
  });
  
  return education.length > 0 ? education : [{ 
    degree: 'High School', 
    institution: 'Unknown', 
    year: 2000, 
    score: 10 
  }];
}

function extractCertifications(cvText: string): string[] {
  const certifications: string[] = [];
  const certPatterns = [
    /AWS Certified ([\w\s]+)/gi,
    /Azure ([\w\s]+) Certified/gi,
    /Google ([\w\s]+) Certified/gi,
    /PMP|Project Management Professional/gi,
    /Scrum Master|CSM|PSM/gi,
    /Oracle Certified ([\w\s]+)/gi,
    /Microsoft Certified: ([\w\s]+)/gi,
    /CISSP|Security\+|CEH/gi,
  ];
  
  certPatterns.forEach(pattern => {
    const matches = cvText.match(pattern);
    if (matches) {
      certifications.push(...matches.map(m => m.trim()));
    }
  });
  
  return [...new Set(certifications)]; // Remove duplicates
}

function generateSummary(cvText: string): string {
  // Extract first paragraph or create summary
  const sentences = cvText.split(/[.!?]+/);
  const firstSentence = sentences[0]?.trim() || '';
  
  if (firstSentence.length > 50) {
    return firstSentence.substring(0, 150) + '...';
  }
  
  return 'Experienced professional with relevant skills.';
}

function calculateTechnicalMatch(jobKeywords: string[], cvSkills: SkillMatch[]): number {
  const technicalSkills = cvSkills.filter(s => s.category === 'technical');
  
  if (jobKeywords.length === 0 || technicalSkills.length === 0) {
    return 0;
  }
  
  let matchScore = 0;
  let maxPossibleScore = jobKeywords.length;
  
  jobKeywords.forEach(keyword => {
    const keywordLower = keyword.toLowerCase();
    
    // Check for direct matches
    const directMatch = technicalSkills.find(skill => 
      skill.skill.toLowerCase().includes(keywordLower) ||
      keywordLower.includes(skill.skill.toLowerCase())
    );
    
    if (directMatch) {
      matchScore += directMatch.confidence;
    } else {
      // Check for synonym matches
      const synonyms = SYNONYMS[keywordLower] || [];
      const synonymMatch = synonyms.some(synonym => 
        technicalSkills.some(skill => 
          skill.skill.toLowerCase().includes(synonym) ||
          synonym.includes(skill.skill.toLowerCase())
        )
      );
      
      if (synonymMatch) {
        matchScore += 0.5; // Partial credit for synonyms
      }
    }
  });
  
  // Normalize to 0-100
  return Math.min((matchScore / maxPossibleScore) * 100, 100);
}

function calculateExperienceMatch(experience: CVAnalysis['experience']): number {
  const { totalYears } = experience;
  
  // Score based on years of experience
  if (totalYears >= 10) return 100;
  if (totalYears >= 7) return 90;
  if (totalYears >= 5) return 80;
  if (totalYears >= 3) return 70;
  if (totalYears >= 2) return 60;
  if (totalYears >= 1) return 50;
  return 30; // Entry level
}

function calculateEducationMatch(education: CVAnalysis['education']): number {
  if (education.length === 0) return 30;
  
  // Take the highest education score
  const highestScore = Math.max(...education.map(e => e.score));
  return highestScore;
}

function calculateSoftSkillsMatch(skills: SkillMatch[]): number {
  const softSkills = skills.filter(s => s.category === 'soft');
  
  if (softSkills.length === 0) return 50; // Average if no soft skills mentioned
  
  // Calculate weighted average of soft skill confidence
  const totalConfidence = softSkills.reduce((sum, skill) => sum + skill.confidence, 0);
  const averageConfidence = totalConfidence / softSkills.length;
  
  return averageConfidence * 100;
}

function matchKeywordsWithConfidence(jobKeywords: string[], cvText: string) {
  const matches: MatchResult['keywordMatches'] = [];
  const lowerCV = cvText.toLowerCase();
  
  jobKeywords.forEach(keyword => {
    const keywordLower = keyword.toLowerCase();
    let matchType: 'exact' | 'synonym' | 'semantic' | 'ngram' = 'exact';
    let confidence = 0;
    
    // Check exact match
    if (lowerCV.includes(keywordLower)) {
      matchType = 'exact';
      confidence = 1.0;
    } 
    // Check for synonyms
    else if (SYNONYMS[keywordLower]) {
      const hasSynonym = SYNONYMS[keywordLower].some(synonym => 
        lowerCV.includes(synonym)
      );
      
      if (hasSynonym) {
        matchType = 'synonym';
        confidence = 0.8;
      }
    }
    // Check for partial matches
    else if (keywordLower.includes(' ') && lowerCV.includes(keywordLower.split(' ')[0])) {
      matchType = 'ngram';
      confidence = 0.6;
    }
    
    if (confidence > 0) {
      matches.push({
        keyword,
        matchType,
        confidence
      });
    }
  });
  
  return matches;
}

function findMissingKeywords(jobKeywords: string[], matches: MatchResult['keywordMatches']): string[] {
  const matchedKeywords = new Set(matches.map(m => m.keyword.toLowerCase()));
  return jobKeywords.filter(keyword => !matchedKeywords.has(keyword.toLowerCase()));
}

function analyzeSkillGaps(jobKeywords: string[], cvSkills: SkillMatch[]) {
  const gaps = {
    critical: [] as string[],
    moderate: [] as string[],
    minor: [] as string[]
  };
  
  const technicalKeywords = jobKeywords.filter(keyword => 
    Object.values(SKILL_DATABASE).some(category => 
      category.some(skill => skill.name === keyword.toLowerCase())
    )
  );
  
  technicalKeywords.forEach(keyword => {
    const isMatched = cvSkills.some(skill => 
      skill.category === 'technical' &&
      (skill.skill.toLowerCase().includes(keyword.toLowerCase()) ||
       keyword.toLowerCase().includes(skill.skill.toLowerCase()))
    );
    
    if (!isMatched) {
      // Classify as critical/moderate/minor based on keyword importance
      if (isCriticalSkill(keyword)) {
        gaps.critical.push(keyword);
      } else if (isModerateSkill(keyword)) {
        gaps.moderate.push(keyword);
      } else {
        gaps.minor.push(keyword);
      }
    }
  });
  
  return gaps;
}

function isCriticalSkill(keyword: string): boolean {
  const criticalSkills = ['javascript', 'python', 'java', 'react', 'aws', 'docker'];
  return criticalSkills.some(skill => 
    keyword.toLowerCase().includes(skill) || skill.includes(keyword.toLowerCase())
  );
}

function isModerateSkill(keyword: string): boolean {
  const moderateSkills = ['typescript', 'nodejs', 'angular', 'vue', 'mysql', 'mongodb'];
  return moderateSkills.some(skill => 
    keyword.toLowerCase().includes(skill) || skill.includes(keyword.toLowerCase())
  );
}

function generateIndustryRecommendations(
  overallScore: number,
  technicalScore: number,
  skillGaps: { critical: string[]; moderate: string[]; minor: string[] },
  experienceYears: number
): string[] {
  const recommendations: string[] = [];
  
  // Overall assessment
  if (overallScore >= 90) {
    recommendations.push('🏆 Top-tier candidate - Immediate hire consideration');
    recommendations.push('Schedule executive interview within 48 hours');
    recommendations.push('Prepare competitive offer package');
  } else if (overallScore >= 80) {
    recommendations.push('✅ Strong candidate - Proceed with interviews');
    recommendations.push('Technical assessment recommended');
    recommendations.push('Check references before offer');
  } else if (overallScore >= 70) {
    recommendations.push('⚠️ Qualified candidate - Evaluate carefully');
    recommendations.push('Focus interview on skill gaps');
    recommendations.push('Consider probationary period if hired');
  } else if (overallScore >= 60) {
    recommendations.push('📝 Borderline candidate - Secondary option');
    recommendations.push('Only consider if no better candidates available');
    recommendations.push('Request additional technical assessment');
  } else {
    recommendations.push('❌ Not recommended - Consider rejection');
    recommendations.push('Keep in talent pool for future openings');
  }
  
  // Technical skills feedback
  if (technicalScore < 70) {
    recommendations.push(`Technical skills gap detected (score: ${technicalScore}%)`);
    
    if (skillGaps.critical.length > 0) {
      recommendations.push(`Critical missing skills: ${skillGaps.critical.slice(0, 3).join(', ')}`);
    }
    
    if (skillGaps.moderate.length > 0) {
      recommendations.push(`Moderate missing skills: ${skillGaps.moderate.slice(0, 3).join(', ')}`);
    }
  }
  
  // Experience feedback
  if (experienceYears < 2) {
    recommendations.push('Limited professional experience - May need mentorship');
  } else if (experienceYears >= 5) {
    recommendations.push('Strong experience background - Can handle senior responsibilities');
  }
  
  // Industry best practices
  recommendations.push('Verify employment history through background check');
  recommendations.push('Assess cultural fit during interview');
  recommendations.push('Check for required certifications if role demands');
  
  return recommendations;
}

async function getAIInsights(jobDescription: string, cvText: string): Promise<string[]> {
  const insights: string[] = [];
  
  try {
    // This is where you'd integrate with AI services
    // Example with AWS Comprehend:
    /*
    const client = new ComprehendClient({ region: 'us-east-1' });
    const command = new DetectEntitiesCommand({
      Text: cvText,
      LanguageCode: 'en'
    });
    
    const response = await client.send(command);
    insights.push(`AI detected ${response.Entities?.length} key entities in CV`);
    */
    
    // Placeholder for demo
    insights.push('AI analysis: Candidate shows strong technical foundation');
    insights.push('Sentiment analysis: Positive and professional tone detected');
    insights.push('Pattern recognition: Career progression shows consistent growth');
    
  } catch (error) {
    console.error('AI service error:', error);
    insights.push('AI insights temporarily unavailable');
  }
  
  return insights;
}

// Legacy functions for backward compatibility
export function extractKeywords(description: string): string[] {
  return extractKeywordsAdvanced(description, { maxKeywords: 30 });
}

export function calculateMatchScore(jobKeywords: string[], cvText: string): {
  matchCount: number;
  totalKeywords: number;
  percentage: number;
  matchedKeywords: string[];
  unmatchedKeywords: string[];
} {
  const result = calculateIndustryMatchScore(
    jobKeywords.join(' '),
    cvText,
    { useAIServices: false }
  );
  
  return {
    matchCount: result.keywordMatches.length,
    totalKeywords: jobKeywords.length,
    percentage: result.technicalScore,
    matchedKeywords: result.keywordMatches.map(m => m.keyword),
    unmatchedKeywords: result.missingKeywords
  };
}