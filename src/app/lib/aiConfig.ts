// src/app/lib/aiConfig.ts

export interface AIServiceConfig {
  enabled: boolean;
  defaultModel: string;
  fallbackModel?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface OpenAIConfig extends AIServiceConfig {
  apiKey?: string;
}

export interface AnthropicConfig extends AIServiceConfig {
  apiKey?: string;
}

export interface GeminiConfig extends AIServiceConfig {
  apiKey?: string;
}

export interface LocalLLMConfig extends AIServiceConfig {
  endpoint?: string;
}

export type ServiceConfigs = {
  openai: OpenAIConfig;
  anthropic: AnthropicConfig;
  gemini: GeminiConfig;
  local: LocalLLMConfig;
}

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
    } as OpenAIConfig,
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      enabled: !!process.env.ANTHROPIC_API_KEY,
      defaultModel: 'claude-3-opus-20240229',
      maxTokens: 2000,
      temperature: 0.2
    } as AnthropicConfig,
    gemini: {
      apiKey: process.env.GEMINI_API_KEY,
      enabled: !!process.env.GEMINI_API_KEY,
      defaultModel: 'gemini-pro',
      maxTokens: 2000,
      temperature: 0.2
    } as GeminiConfig,
    local: {
      endpoint: process.env.LOCAL_LLM_ENDPOINT || 'http://localhost:11434/api/generate',
      enabled: true,
      defaultModel: 'llama2',
      maxTokens: 2000,
      temperature: 0.2
    } as LocalLLMConfig
  } as ServiceConfigs
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

// Helper functions
export function getServiceConfig(service: string) {
  return aiConfig.services[service as keyof typeof aiConfig.services];
}

export function getAPIKey(service: string): string | undefined {
  const config = getServiceConfig(service);
  return 'apiKey' in config ? config.apiKey : undefined;
}

export function getDefaultModel(service: string): string {
  const config = getServiceConfig(service);
  return config?.defaultModel || aiConfig.defaultModel;
}

export function isServiceEnabled(service: string): boolean {
  const config = getServiceConfig(service);
  return config?.enabled || false;
}