export const aiConfig = {
  defaultService: process.env.DEFAULT_AI_SERVICE || 'openai',
  defaultModel: process.env.DEFAULT_AI_MODEL || 'gpt-4-turbo-preview',
  
  services: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      enabled: !!process.env.OPENAI_API_KEY,
      defaultModel: 'gpt-4-turbo-preview',
      fallbackModel: 'gpt-3.5-turbo',
      maxTokens: 2000,
      temperature: 0.2
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      enabled: !!process.env.ANTHROPIC_API_KEY,
      defaultModel: 'claude-3-opus-20240229'
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY,
      enabled: !!process.env.GEMINI_API_KEY,
      defaultModel: 'gemini-pro'
    },
    local: {
      endpoint: process.env.LOCAL_LLM_ENDPOINT || 'http://localhost:11434/api/generate',
      enabled: true,
      defaultModel: 'llama2'
    }
  }
} as const;

export function getDefaultAIOptions() {
  return {
    useAI: aiConfig.services.openai.enabled,
    aiService: aiConfig.defaultService,
    aiModel: aiConfig.defaultModel,
    aiTemperature: 0.2,
    includeCulturalFit: true,
    includeGrowthPotential: true,
    strictness: 'medium'
  };
}