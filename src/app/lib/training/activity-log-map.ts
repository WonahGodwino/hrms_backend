export function mapActivityLog(l: any) {
  const meta = (l.metadata ?? {}) as Record<string, any>
  return {
    id: l.id,
    timestamp: l.createdAt.toISOString(),
    durationMs: meta.durationMs ?? 0,
    type: meta.type ?? 'SYSTEM',
    ruleName: meta.ruleName ?? 'Unknown Rule',
    triggeredBy: meta.triggeredBy ?? (l.actor ? `${l.actor.firstName} ${l.actor.lastName}` : 'System'),
    target: meta.target ?? '-',
    status: meta.status ?? 'SUCCESS',
    ruleId: l.entityId,
    ruleType: meta.ruleType ?? 'Assignment Workflow',
    triggerSource: meta.triggerSource ?? 'Manual',
    logicLines: meta.logicLines ?? [],
    affectedEmployees: meta.affectedEmployees ?? [],
    affectedEmployeeIds: meta.affectedEmployeeIds ?? [],
    trainingProgramId: meta.trainingProgramId ?? null,
    actions: meta.actions ?? [],
    timeline: meta.timeline ?? [],
    debug: meta.debug ?? [],
  }
}
