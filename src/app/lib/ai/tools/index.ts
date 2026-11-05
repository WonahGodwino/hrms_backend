// [ai-assistant] Tool registry — exports getTools(visibleCategories) which filters out
// tools whose required data category is hidden.
import type { ToolDefinition } from './types'
import { ALWAYS_HIDDEN } from '../categories'
import { listStaff, getStaff } from './staff'
import { listDepartments } from './departments'
import { listDesignations } from './designations'
import { leaveSummary } from './leave'
import { payrollSummary } from './payroll'
import { setupReadiness } from './setup'
import { actionCenterItems } from './actions'
import { draftDocument, summarise } from './documents'
import { attendanceSummary } from './attendance'
import { activityLog } from './activity'
import { proposeStaffChange, proposeDepartmentUpdate, proposeUndo, listAiProposals } from './proposals'
import { listAutomationRules, proposeRuleChange, proposeCustomRule } from './rules'

const ALL_TOOLS: ToolDefinition[] = [
  listStaff,
  getStaff,
  listDepartments,
  listDesignations,
  leaveSummary,
  payrollSummary,
  setupReadiness,
  actionCenterItems,
  attendanceSummary,
  activityLog,
  draftDocument,
  summarise,
  proposeStaffChange,
  proposeDepartmentUpdate,
  listAiProposals,
  proposeUndo,
  listAutomationRules,
  proposeRuleChange,
  proposeCustomRule,
]

export function getTools(visibleCategories: string[]): ToolDefinition[] {
  return ALL_TOOLS.filter((tool) => {
    if (!tool.category) return true
    if ((ALWAYS_HIDDEN as readonly string[]).includes(tool.category)) return false
    return visibleCategories.includes(tool.category)
  })
}

export function getAllToolNames(): string[] {
  return ALL_TOOLS.map((t) => t.name)
}

export function getToolByName(name: string, visibleCategories: string[]): ToolDefinition | undefined {
  const tools = getTools(visibleCategories)
  return tools.find((t) => t.name === name)
}

export function getToolDefinitions(visibleCategories: string[]) {
  return getTools(visibleCategories).map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }))
}

export type { ToolDefinition, ToolContext } from './types'
