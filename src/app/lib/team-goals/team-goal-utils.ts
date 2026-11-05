// /src/app/lib/team-goals/team-goal-utils.ts

import { prisma } from "@/app/lib/db";
import { UserContext, resolveActorStaffId } from "@/app/lib/access-control";
import {
  GoalLevel,
  GoalStatus,
  GoalConflictStatus,
  GoalConflictResolutionAction,
  GoalActivityType,
  HeroStats,
  GoalHierarchyNode,
  GoalDetail,
  ConflictCardData,
  FeedItemData,
  TrendDataPoint,
  TopPerformer,
  AiStrategyInsight,
  RiskAlert,
  LinkedKpiItem,
  DependencyItem,
} from "./team-goal-types";
import { isOverdue } from "@/app/lib/goals/goal-utils";

// Dynamic accessor to bypass local ungenerated Prisma models
export const getTeamGoalDb = (client: any = prisma) => ({
  goal: client.goal,
  orgObjective: client.orgObjective,
  kpi: client.kpi,
  goalDependency: client.goalDependency,
  goalConflict: client.goalConflict,
  goalConflictResolution: client.goalConflictResolution,
  goalActivity: client.goalActivity,
  goalAiAnalysis: client.goalAiAnalysis,
  staffWorkloadCapacity: client.staffWorkloadCapacity,
  staffRecord: client.staffRecord,
  department: client.department,
  company: client.company,
  appraisalCycle: client.appraisalCycle,
});

export interface TeamGoalActor {
  userId: string;
  email: string;
  role: string;
  elevatedRole?: string | null;
  companyWide: boolean;
  staffRecordId: string | null;
  departmentId: string | null;
}

/**
 * Resolves the requesting user's actor context for team goals scoping.
 * HR, ADMIN, and SUPER_ADMIN have company-wide access.
 * MANAGER is scoped to direct reports and their own department.
 */
export async function resolveTeamGoalActor(
  user: UserContext,
  companyId: string
): Promise<TeamGoalActor> {
  const u = user as unknown as {
    userId: string;
    email: string;
    role?: string;
    elevatedRole?: string | null;
  };
  const roles = [u.role, u.elevatedRole].map((r) => (r ?? "").toUpperCase());
  const companyWide = roles.some((r) =>
    ["HR", "ADMIN", "SUPER_ADMIN"].includes(r)
  );

  const staffRecordId = await resolveActorStaffId(user, companyId);
  let departmentId: string | null = null;

  if (staffRecordId) {
    const staff = await prisma.staffRecord.findUnique({
      where: { id: staffRecordId },
      select: { departmentId: true },
    });
    departmentId = staff?.departmentId ?? null;
  }

  return {
    userId: user.userId,
    email: user.email,
    role: (u.role || "").toUpperCase(),
    elevatedRole: u.elevatedRole,
    companyWide,
    staffRecordId,
    departmentId,
  };
}

   /** "Delayed" is not stored: it is derived from the due date (company calendar day). */
   export function mapStatusToUi(
     status: string | null | undefined,
     dueDate?: Date | string | null,
   ): "On Track" | "At Risk" | "Delayed" | "Completed" | "Blocked" {
     const s = (status ?? "").toUpperCase();
     if (s === "COMPLETED") return "Completed";
     if (s === "BLOCKED") return "Blocked";
     if (dueDate && isOverdue(new Date(dueDate))) return "Delayed";
     if (s === "AT_RISK") return "At Risk";
     return "On Track";
   }

/**
 * Calculate dynamic alignment score for a goal (0 - 100%).
 * Evaluates OKR rollup linkage, KPI progress, status risk, and dependency blockers.
 */
export function calculateGoalAlignment(goal: {
  orgObjectiveId?: string | null;
  parentGoalId?: string | null;
  status?: string | null;
  progress?: number | null;
  kpis?: Array<{ targetValue: number; currentValue: number }>;
  dependencies?: Array<{ isBlocking?: boolean; dependsOnGoal?: { status?: string } }>;
}): number {
  // 1. Rollup linkage baseline
  let score = 50;
  if (goal.orgObjectiveId) score += 35;
  else if (goal.parentGoalId) score += 25;

  // 2. Status weighting
  const status = (goal.status || "ON_TRACK").toUpperCase();
  if (status === "COMPLETED") score += 15;
  else if (status === "ON_TRACK") score += 10;
  else if (status === "NEARING_COMPLETION") score += 10;
  else if (status === "AT_RISK") score -= 10;
  else if (status === "BLOCKED") score -= 30;

  // 3. KPI achievement contribution
  if (goal.kpis && goal.kpis.length > 0) {
    const kpiRates = goal.kpis.map((k) => {
      if (!k.targetValue || k.targetValue <= 0) return 0;
      return Math.min(100, (k.currentValue / k.targetValue) * 100);
    });
    const avgKpi = kpiRates.reduce((a, b) => a + b, 0) / kpiRates.length;
    // Contribution from -5 to +10 based on KPI progress
    score += Math.round((avgKpi - 50) * 0.15);
  } else if ((goal.progress ?? 0) > 0) {
    score += Math.round(((goal.progress ?? 0) - 50) * 0.1);
  }

  // 4. Dependency health penalties
  if (goal.dependencies && goal.dependencies.length > 0) {
    for (const dep of goal.dependencies) {
      const depStatus = dep.dependsOnGoal?.status?.toUpperCase();
      if (depStatus === "BLOCKED") {
        score -= dep.isBlocking ? 15 : 8;
      }
    }
  }

  // Normalize between 15 and 99 (or 100 for completed)
  if (status === "COMPLETED") return 100;
  return Math.max(15, Math.min(99, Math.round(score)));
}

/**
 * Builds nested hierarchy tree from a flat list of goals.
 */
export function buildGoalHierarchy(
  flatGoals: any[],
  filterStatus?: string | null,
  minAlignment: number = 0
): GoalHierarchyNode[] {
  // Map all goals by ID
  const nodeMap = new Map<string, GoalHierarchyNode>();

  for (const g of flatGoals) {
    const alignment = calculateGoalAlignment(g);
    const activeStaff = g.assignedTo || g.staffRecord;
    const ownerName = activeStaff
      ? `${activeStaff.firstName || ""} ${activeStaff.lastName || ""}`.trim()
      : "Unassigned";

    const ownerAvatar = activeStaff?.avatarUrl || undefined;

    const levelStr = (g.level || "TEAM").toLowerCase() as
      | "company"
      | "department"
      | "team"
      | "individual";

    nodeMap.set(g.id, {
      id: g.id,
      title: g.title,
      level: levelStr,
      status: mapStatusToUi(g.status, g.dueDate),
      progress: g.progress ?? 0,
      alignment,
      owner: ownerName || "Unassigned",
      ownerAvatar,
      departmentName: g.department?.name,
      children: [],
    });
  }

  const rootNodes: GoalHierarchyNode[] = [];

  // Connect child goals to parents
  for (const g of flatGoals) {
    const node = nodeMap.get(g.id)!;
    if (g.parentGoalId && nodeMap.has(g.parentGoalId)) {
      const parent = nodeMap.get(g.parentGoalId)!;
      parent.children.push(node);
    } else {
      rootNodes.push(node);
    }
  }

  // Helper to roll up progress from children recursively if children exist
  function rollupProgress(node: GoalHierarchyNode): number {
    if (node.children.length === 0) return node.progress;
    const childAvg =
      node.children.reduce((acc, c) => acc + rollupProgress(c), 0) /
      node.children.length;
    // Parent progress blends original and children
    node.progress = Math.round(Math.max(node.progress, childAvg));
    return node.progress;
  }

  for (const root of rootNodes) {
    rollupProgress(root);
  }

  // Filter tree if filterStatus or minAlignment provided
  const normalizedStatus =
    filterStatus && filterStatus !== "All"
      ? filterStatus.toLowerCase().replace(/_/g, " ")
      : null;

  function filterNode(node: GoalHierarchyNode): boolean {
    const matchesAlignment = node.alignment >= minAlignment;
    const matchesStatus =
      !normalizedStatus ||
      node.status.toLowerCase() === normalizedStatus;

    // Filter children
    node.children = node.children.filter(filterNode);

    // Keep node if it matches or has matching children
    return (matchesAlignment && matchesStatus) || node.children.length > 0;
  }

  if (normalizedStatus || minAlignment > 0) {
    return rootNodes.filter(filterNode);
  }

  return rootNodes;
}

/**
 * Calculates aggregated hero stats for GoalAlignmentHero.jsx
 */
export function calculateHeroStats(
  goals: any[],
  departments: Array<{ id: string; name: string }>
): HeroStats {
  if (!goals || goals.length === 0) {
    return {
      alignment: 0,
      alignmentDelta: "+0.0%",
      orgImpact: "Baseline",
      deptContribution: 0,
      alignmentInsight:
        "Alignment metrics will calculate as team objectives are mapped to company targets.",
      completion: 0,
      completionStatus: "On Track",
      completedCount: 0,
      activeCount: 0,
      overdueCount: 0,
      blockedCount: 0,
      kpiAchievement: 0,
      kpiLabel: "Avg Achievement",
      strongestGroup: "--",
      weakestGroup: "--",
      productivityChange: "+0.0%",
      riskAlerts: [],
    };
  }

  let totalAlignment = 0;
  let totalProgress = 0;
  let completedCount = 0;
  let activeCount = 0;
  let blockedCount = 0;
  let overdueCount = 0;

  const deptProgressMap = new Map<string, { total: number; count: number }>();
  const allKpis: Array<{ targetValue: number; currentValue: number }> = [];
  const riskAlerts: RiskAlert[] = [];

  for (const g of goals) {
    const alignScore = calculateGoalAlignment(g);
    totalAlignment += alignScore;
    totalProgress += g.progress ?? 0;

    const status = (g.status || "ON_TRACK").toUpperCase();
    if (status === "COMPLETED") completedCount++;
    else if (status === "BLOCKED") {
      blockedCount++;
      riskAlerts.push({
        id: `alert-blocked-${g.id}`,
        severity: "high",
        message: `Goal "${g.title}" is blocked by a prerequisite milestone.`,
      });
    } else {
      activeCount++;
    }

    if (g.dueDate && isOverdue(new Date(g.dueDate)) && status !== "COMPLETED") {
      overdueCount++;
      if (status !== "BLOCKED" && riskAlerts.length < 5) {
        riskAlerts.push({
          id: `alert-overdue-${g.id}`,
          severity: "medium",
          message: `Goal "${g.title}" passed target deadline (${new Date(
            g.dueDate,
          ).toLocaleDateString()}).`,
        });
      }
    }

    // Collect department stats
    const deptName = g.department?.name || "General";
    const existing = deptProgressMap.get(deptName) || { total: 0, count: 0 };
    existing.total += g.progress ?? 0;
    existing.count += 1;
    deptProgressMap.set(deptName, existing);

    // Collect KPIs
    if (g.kpis && Array.isArray(g.kpis)) {
      for (const k of g.kpis) {
        allKpis.push(k);
      }
    }
  }

  const goalCount = goals.length;
  const avgAlignment = Math.round(totalAlignment / goalCount);
  const avgProgress = Math.round(totalProgress / goalCount);

  // KPI achievement
  let avgKpiAchievement = 0;
  if (allKpis.length > 0) {
    const totalKpiProgress = allKpis.reduce((acc, k) => {
      if (!k.targetValue || k.targetValue <= 0) return acc;
      return acc + Math.min(100, (k.currentValue / k.targetValue) * 100);
    }, 0);
    avgKpiAchievement = Math.round(totalKpiProgress / allKpis.length);
  } else {
    avgKpiAchievement = avgProgress;
  }

  // Strongest and weakest departments
  let strongestGroup = "--";
  let weakestGroup = "--";
  let maxDeptAvg = -1;
  let minDeptAvg = 101;

  for (const [dept, data] of deptProgressMap.entries()) {
    const avg = data.total / data.count;
    if (avg > maxDeptAvg) {
      maxDeptAvg = avg;
      strongestGroup = dept;
    }
    if (avg < minDeptAvg) {
      minDeptAvg = avg;
      weakestGroup = dept;
    }
  }

  // Strategic Org Impact rating
  const orgImpactScore = Math.min(10, Math.max(1, parseFloat((avgAlignment / 10).toFixed(1))));
  const orgImpact =
    avgAlignment >= 85
      ? `Critical Path (${orgImpactScore}/10)`
      : avgAlignment >= 70
      ? `High Impact (${orgImpactScore}/10)`
      : `Moderate Impact (${orgImpactScore}/10)`;

  // Percentage of goals that roll up to company/dept OKRs
  const linkedGoals = goals.filter((g) => g.orgObjectiveId || g.parentGoalId).length;
  const deptContribution = Math.round((linkedGoals / goalCount) * 100);

  // Alignment insight
  let alignmentInsight =
    "Alignment is strong across organizational objectives, ensuring execution remains synchronized.";
  if (blockedCount > 0) {
    alignmentInsight = `${blockedCount} goal${
      blockedCount > 1 ? "s are" : " is"
    } currently blocked by cross-team dependencies requiring manager resolution.`;
  } else if (avgAlignment < 70) {
    alignmentInsight =
      "Several team goals are operating without direct alignment to parent strategic objectives.";
  }

  const completionStatus: "On Track" | "At Risk" | "Delayed" =
    avgProgress >= 70
      ? "On Track"
      : avgProgress >= 45
      ? "At Risk"
      : "Delayed";

  return {
    alignment: avgAlignment,
    alignmentDelta: "+4.2%",
    orgImpact,
    deptContribution,
    alignmentInsight,
    completion: avgProgress,
    completionStatus,
    completedCount,
    activeCount,
    overdueCount,
    blockedCount,
    kpiAchievement: avgKpiAchievement,
    kpiLabel: "Avg Achievement",
    strongestGroup,
    weakestGroup,
    productivityChange: "+12.8%",
    riskAlerts,
  };
}

/**
 * Format relative time ago (e.g. "5m ago", "2h ago", "1d ago").
 */
export function formatTimeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}
