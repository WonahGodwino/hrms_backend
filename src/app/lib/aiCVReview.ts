// src/app/lib/aiCVReview.ts

export interface AIMatchResult {
  overallScore: number;
  technicalScore: number;
  softSkillsScore: number;
  experienceScore: number;
  educationScore: number;
  keywordMatches: Array<{
    keyword: string;
    matchType: 'exact' | 'synonym' | 'semantic' | 'ngram' | 'ai';
    confidence: number;
    aiExplanation?: string;
  }>;
  missingKeywords: string[];
  skillGapAnalysis: {
    critical: string[];
    moderate: string[];
    minor: string[];
    aiIdentified: string[];
  };
  recommendations: string[];
  industryBenchmark: number;
  aiAnalysis?: {
    summary: string;
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
    riskFactors: string[];
    potential: number; // 0-100
    timeToProductivity: string; // e.g., "1-3 months"
  };
  culturalFit?: number; // 0-100
  growthPotential?: number; // 0-100
}

export interface AICVReviewOptions {
  useOpenAI?: boolean;
  useAnthropic?: boolean;
  useGemini?: boolean;
  useLocalLLM?: boolean;
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  companyContext?: string;
  industry?: string;
  seniorityLevel?: string;
  strictness?: 'low' | 'medium' | 'high' | 'strict';
  includeCulturalFit?: boolean;
  includeGrowthPotential?: boolean;
  enableDetailedAnalysis?: boolean;
}

/**
 * Enhanced AI-powered CV review with multiple AI service options
 */
export async function calculateAICVReviewScore(
  jobDescription: string,
  cvText: string,
  options: AICVReviewOptions = {}
): Promise<AIMatchResult> {
  try {
    // Get base industry scores
    const baseResult = calculateIndustryMatchScore(jobDescription, cvText, {
      useAIServices: options.useOpenAI || options.useAnthropic || options.useGemini
    });

    // Initialize AI-enhanced result
    const aiResult: AIMatchResult = {
      ...baseResult,
      skillGapAnalysis: {
        ...baseResult.skillGapAnalysis,
        aiIdentified: []
      }
    };

    // AI-enhanced analysis if enabled
    if (options.useOpenAI || options.useAnthropic || options.useGemini || options.useLocalLLM) {
      const aiAnalysis = await performAIAnalysis(jobDescription, cvText, options);
      
      if (aiAnalysis) {
        // Integrate AI insights
        aiResult.aiAnalysis = aiAnalysis;
        
        // Adjust scores based on AI analysis
        aiResult.overallScore = adjustScoreWithAI(baseResult.overallScore, aiAnalysis);
        aiResult.technicalScore = adjustTechnicalScore(baseResult.technicalScore, aiAnalysis);
        aiResult.experienceScore = adjustExperienceScore(baseResult.experienceScore, aiAnalysis);
        aiResult.educationScore = adjustEducationScore(baseResult.educationScore, aiAnalysis);
        aiResult.softSkillsScore = adjustSoftSkillsScore(baseResult.softSkillsScore, aiAnalysis);
        
        // Add AI-identified keywords and skill gaps
        if (aiAnalysis.keywords) {
          aiResult.keywordMatches.push(...aiAnalysis.keywords.map(kw => ({
            keyword: kw.keyword,
            matchType: 'ai' as const,
            confidence: kw.confidence,
            aiExplanation: kw.explanation
          })));
          
          if (aiAnalysis.skillGaps) {
            aiResult.skillGapAnalysis.aiIdentified = aiAnalysis.skillGaps;
          }
        }
        
        // Enhance recommendations with AI insights
        if (aiAnalysis.recommendations) {
          aiResult.recommendations = [...aiResult.recommendations, ...aiAnalysis.recommendations];
        }
      }
    }

    // Calculate cultural fit if enabled
    if (options.includeCulturalFit) {
      aiResult.culturalFit = await calculateCulturalFit(jobDescription, cvText, options);
      if (aiResult.culturalFit < 50) {
        aiResult.recommendations.push('Cultural fit concerns identified - conduct behavioral interview');
      }
    }

    // Calculate growth potential if enabled
    if (options.includeGrowthPotential) {
      aiResult.growthPotential = await calculateGrowthPotential(cvText, options);
      if (aiResult.growthPotential > 80) {
        aiResult.recommendations.push('High growth potential identified - consider for leadership track');
      }
    }

    // Apply strictness filter
    if (options.strictness) {
      aiResult.overallScore = applyStrictness(aiResult.overallScore, options.strictness);
    }

    return aiResult;
  } catch (error) {
    console.error('AI CV review failed, falling back to industry standard:', error);
    // Fallback to base industry algorithm
    return {
      ...calculateIndustryMatchScore(jobDescription, cvText, { useAIServices: false }),
      skillGapAnalysis: {
        ...calculateIndustryMatchScore(jobDescription, cvText, { useAIServices: false }).skillGapAnalysis,
        aiIdentified: []
      }
    };
  }
}

/**
 * Perform AI analysis using selected service
 */
async function performAIAnalysis(
  jobDescription: string,
  cvText: string,
  options: AICVReviewOptions
): Promise<any> {
  const prompt = createAnalysisPrompt(jobDescription, cvText, options);
  
  if (options.useOpenAI) {
    return await analyzeWithOpenAI(prompt, options);
  } else if (options.useAnthropic) {
    return await analyzeWithAnthropic(prompt, options);
  } else if (options.useGemini) {
    return await analyzeWithGemini(prompt, options);
  } else if (options.useLocalLLM) {
    return await analyzeWithLocalLLM(prompt, options);
  }
  
  return null;
}

/**
 * Create analysis prompt for AI
 */
function createAnalysisPrompt(
  jobDescription: string,
  cvText: string,
  options: AICVReviewOptions
): string {
  return `You are an expert HR recruiter with deep industry knowledge. Analyze this CV against the job description.

JOB DESCRIPTION:
${jobDescription.substring(0, 2000)}

CANDIDATE CV:
${cvText.substring(0, 3000)}

INSTRUCTIONS:
1. Extract key skills from both job and CV
2. Identify matches and gaps
3. Assess experience relevance
4. Evaluate education background
5. Identify soft skills
6. Provide a comprehensive analysis

OUTPUT FORMAT (JSON):
{
  "summary": "Brief summary of candidate suitability",
  "strengths": ["strength1", "strength2"],
  "weaknesses": ["weakness1", "weakness2"],
  "suggestions": ["suggestion1", "suggestion2"],
  "riskFactors": ["risk1", "risk2"],
  "potential": 85,
  "timeToProductivity": "1-3 months",
  "keywords": [
    {"keyword": "React", "confidence": 0.95, "explanation": "Candidate has 3 years React experience"}
  ],
  "skillGaps": ["Redux", "TypeScript Advanced"],
  "recommendations": ["Proceed to technical interview", "Focus on skill gaps"]
}

Additional context:
- Industry: ${options.industry || 'Technology'}
- Seniority: ${options.seniorityLevel || 'Mid-level'}
- Company Context: ${options.companyContext || 'Not provided'}
- Strictness Level: ${options.strictness || 'medium'}`;
}

/**
 * OpenAI analysis implementation
 */
async function analyzeWithOpenAI(prompt: string, options: AICVReviewOptions): Promise<any> {
  if (!options.apiKey && !process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key required');
  }

  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  const model = options.model || 'gpt-4-turbo-preview';
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: 'system',
          content: 'You are an expert HR recruitment analyst. Provide detailed CV analysis in JSON format.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: options.temperature || 0.2,
      max_tokens: options.maxTokens || 1500,
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.statusText}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;
  
  if (!content) {
    throw new Error('No content returned from OpenAI');
  }

  return JSON.parse(content);
}

/**
 * Anthropic Claude analysis implementation
 */
async function analyzeWithAnthropic(prompt: string, options: AICVReviewOptions): Promise<any> {
  if (!options.apiKey && !process.env.ANTHROPIC_API_KEY) {
    throw new Error('Anthropic API key required');
  }

  const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
  const model = options.model || 'claude-3-opus-20240229';
  
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: model,
      max_tokens: options.maxTokens || 1500,
      temperature: options.temperature || 0.2,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      system: 'You are an expert HR recruitment analyst. Provide detailed CV analysis in JSON format.'
    })
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.statusText}`);
  }

  const data = await response.json();
  const content = data.content[0]?.text;
  
  if (!content) {
    throw new Error('No content returned from Anthropic');
  }

  return JSON.parse(content);
}

/**
 * Google Gemini analysis implementation
 */
async function analyzeWithGemini(prompt: string, options: AICVReviewOptions): Promise<any> {
  if (!options.apiKey && !process.env.GEMINI_API_KEY) {
    throw new Error('Gemini API key required');
  }

  const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
  const model = options.model || 'gemini-pro';
  
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],
      generationConfig: {
        temperature: options.temperature || 0.2,
        maxOutputTokens: options.maxTokens || 1500
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.statusText}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!content) {
    throw new Error('No content returned from Gemini');
  }

  return JSON.parse(content);
}

/**
 * Local LLM analysis (Ollama, LocalAI, etc.)
 */
async function analyzeWithLocalLLM(prompt: string, options: AICVReviewOptions): Promise<any> {
  const localEndpoint = process.env.LOCAL_LLM_ENDPOINT || 'http://localhost:11434/api/generate';
  const model = options.model || 'llama2';
  
  const response = await fetch(localEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model,
      prompt: prompt,
      stream: false,
      options: {
        temperature: options.temperature || 0.2,
        num_predict: options.maxTokens || 1500
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Local LLM error: ${response.statusText}`);
  }

  const data = await response.json();
  const content = data.response;
  
  if (!content) {
    throw new Error('No content returned from local LLM');
  }

  return JSON.parse(content);
}

/**
 * Score adjustment functions
 */
function adjustScoreWithAI(baseScore: number, aiAnalysis: any): number {
  const aiPotential = aiAnalysis.potential || 70;
  const adjustmentFactor = (aiPotential - 70) / 100; // -0.3 to +0.3
  
  // Cap adjustment to ±10 points
  const adjustment = Math.min(Math.max(adjustmentFactor * 20, -10), 10);
  
  return Math.min(Math.max(baseScore + adjustment, 0), 100);
}

function adjustTechnicalScore(baseScore: number, aiAnalysis: any): number {
  const strengths = aiAnalysis.strengths || [];
  const weaknesses = aiAnalysis.weaknesses || [];
  
  let adjustment = 0;
  
  // Adjust based on technical strengths/weaknesses
  const techKeywords = ['expert', 'advanced', 'proficient', 'skilled'];
  const hasTechStrength = strengths.some((s: string) => 
    techKeywords.some(kw => s.toLowerCase().includes(kw))
  );
  
  if (hasTechStrength) adjustment += 5;
  
  const hasCriticalWeakness = weaknesses.some((w: string) => 
    w.toLowerCase().includes('lacking') || w.toLowerCase().includes('insufficient')
  );
  
  if (hasCriticalWeakness) adjustment -= 10;
  
  return Math.min(Math.max(baseScore + adjustment, 0), 100);
}

function adjustExperienceScore(baseScore: number, aiAnalysis: any): number {
  const timeToProductivity = aiAnalysis.timeToProductivity || '3-6 months';
  
  // Convert time to productivity to score adjustment
  const timeMap: Record<string, number> = {
    'immediate': 10,
    '1-3 months': 5,
    '3-6 months': 0,
    '6-12 months': -5,
    '12+ months': -10
  };
  
  const adjustment = timeMap[timeToProductivity] || 0;
  return Math.min(Math.max(baseScore + adjustment, 0), 100);
}

function adjustEducationScore(baseScore: number, aiAnalysis: any): number {
  // Education adjustments based on AI analysis
  const strengths = aiAnalysis.strengths || [];
  const hasRelevantEducation = strengths.some((s: string) => 
    s.toLowerCase().includes('education') || 
    s.toLowerCase().includes('degree') ||
    s.toLowerCase().includes('certification')
  );
  
  return hasRelevantEducation ? Math.min(baseScore + 5, 100) : baseScore;
}

function adjustSoftSkillsScore(baseScore: number, aiAnalysis: any): number {
  const strengths = aiAnalysis.strengths || [];
  const weaknesses = aiAnalysis.weaknesses || [];
  
  let adjustment = 0;
  
  // Check for soft skills mentions
  const softSkillKeywords = ['communication', 'leadership', 'teamwork', 'collaboration', 'problem-solving'];
  
  const softSkillStrengths = strengths.filter((s: string) => 
    softSkillKeywords.some(kw => s.toLowerCase().includes(kw))
  );
  
  const softSkillWeaknesses = weaknesses.filter((w: string) => 
    softSkillKeywords.some(kw => w.toLowerCase().includes(kw))
  );
  
  adjustment += softSkillStrengths.length * 3;
  adjustment -= softSkillWeaknesses.length * 5;
  
  return Math.min(Math.max(baseScore + adjustment, 0), 100);
}

/**
 * Calculate cultural fit score
 */
async function calculateCulturalFit(
  jobDescription: string,
  cvText: string,
  options: AICVReviewOptions
): Promise<number> {
  // Simple implementation - can be enhanced with AI
  const culturalKeywords = [
    'collaborative', 'team player', 'innovative', 'adaptable', 'flexible',
    'transparent', 'accountable', 'customer-focused', 'results-driven',
    'continuous improvement', 'learning mindset'
  ];
  
  const cvLower = cvText.toLowerCase();
  const matches = culturalKeywords.filter(keyword => 
    cvLower.includes(keyword.toLowerCase())
  );
  
  return (matches.length / culturalKeywords.length) * 100;
}

/**
 * Calculate growth potential score
 */
async function calculateGrowthPotential(
  cvText: string,
  options: AICVReviewOptions
): Promise<number> {
  // Simple implementation - can be enhanced with AI
  const growthIndicators = [
    'leadership', 'mentor', 'train', 'coach', 'develop',
    'improve', 'optimize', 'streamline', 'innovate',
    'certification', 'course', 'training', 'workshop',
    'promoted', 'advanced', 'progressed'
  ];
  
  const cvLower = cvText.toLowerCase();
  const matches = growthIndicators.filter(indicator => 
    cvLower.includes(indicator.toLowerCase())
  );
  
  return (matches.length / growthIndicators.length) * 100;
}

/**
 * Apply strictness filter to score
 */
function applyStrictness(score: number, strictness: string): number {
  const strictnessMap: Record<string, number> = {
    'low': score * 1.1,
    'medium': score,
    'high': score * 0.9,
    'strict': score * 0.8
  };
  
  const adjusted = strictnessMap[strictness] || score;
  return Math.min(Math.max(adjusted, 0), 100);
}

/**
 * Export enhanced version of existing function for backward compatibility
 */
export { calculateIndustryMatchScore } from './keywordExtractor';