// [ai-assistant] Setup tool — setup_readiness (read-only).
import type { ToolDefinition } from './types'
import { computeReadiness } from '@/app/lib/core-setup/readiness'

export const setupReadiness: ToolDefinition = {
  name: 'setup_readiness',
  description: 'Check the company setup readiness score. Shows which setup stages are complete and which still need attention.',
  parameters: {
    type: 'object',
    properties: {},
  },
  async execute(_args, ctx) {
    const result = await computeReadiness(ctx.companyId)
    return result
  },
}
