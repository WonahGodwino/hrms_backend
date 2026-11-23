// Helpers shared by several routes (ARCH-002 / CODE-005: identical copies merged).
import { hasModuleAccess } from '@/app/lib/module-access'

export async function assertDesignationStepsAllowed(companyId: string, workflow: { approverKind: string }[]) {
  const hasDesignationStep = workflow.some((s) => s.approverKind === 'DESIGNATION')
  if (!hasDesignationStep) return
  const enabled = await hasModuleAccess(companyId, 'CORE_SETUP')
  if (!enabled) {
    throw new Error(
      'This approval chain uses a Designation-based step, which requires the Core Setup module to be enabled for this company.'
    )
  }
}
