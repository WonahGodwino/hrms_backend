// [ai-assistant] Supported AI models and approximate pricing.

export interface ModelInfo {
  id: string
  provider: 'anthropic' | 'openai'
  label: string
  inputPer1k: number
  outputPer1k: number
}

const MODELS: ModelInfo[] = [
  { id: 'claude-sonnet-5-5', provider: 'anthropic', label: 'Claude Sonnet 5.5', inputPer1k: 0.003, outputPer1k: 0.015 },
  { id: 'claude-opus-5-5', provider: 'anthropic', label: 'Claude Opus 5.5', inputPer1k: 0.015, outputPer1k: 0.075 },
  { id: 'claude-haiku-5-5', provider: 'anthropic', label: 'Claude Haiku 5.5', inputPer1k: 0.0008, outputPer1k: 0.004 },
  { id: 'gpt-4o', provider: 'openai', label: 'GPT-4o', inputPer1k: 0.0025, outputPer1k: 0.01 },
  { id: 'gpt-4o-mini', provider: 'openai', label: 'GPT-4o Mini', inputPer1k: 0.00015, outputPer1k: 0.0006 },
  { id: 'o3-mini', provider: 'openai', label: 'o3 Mini', inputPer1k: 0.0011, outputPer1k: 0.0044 },
]

const DEFAULT_MODEL = 'claude-sonnet-5-5'

export function getModelInfo(modelId: string): ModelInfo | undefined {
  return MODELS.find((m) => m.id === modelId)
}

export function listModels(): ModelInfo[] {
  return MODELS
}

export function getDefaultModel(): ModelInfo {
  return MODELS.find((m) => m.id === DEFAULT_MODEL)!
}

export function modelsForProvider(provider: 'anthropic' | 'openai'): ModelInfo[] {
  return MODELS.filter((m) => m.provider === provider)
}
