// [ai-assistant] Tool type definitions shared by all tools.
import type { PrismaClient } from '@prisma/client'

export interface ToolParameter {
  type: string
  description: string
  enum?: string[]
  default?: unknown
  items?: Record<string, unknown>
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, ToolParameter>
    required?: string[]
  }
  category?: string
  // true when the result is staff records, so the fields shown are those of the visible categories
  usesStaffFields?: boolean
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>
}

export interface ToolContext {
  prisma: PrismaClient
  companyId: string
  userId: string
  visibleCategories: string[]
  conversationId?: string
}
