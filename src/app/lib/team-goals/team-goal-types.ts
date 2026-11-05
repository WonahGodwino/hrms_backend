// /src/app/lib/team-goals/team-goal-types.ts

export type GoalLevel = "COMPANY" | "DEPARTMENT" | "TEAM" | "INDIVIDUAL";

export type GoalStatus =
  | "ON_TRACK"
  | "AT_RISK"
  | "NEARING_COMPLETION"
  | "BLOCKED"
  | "COMPLETED";

export type KpiMeasurementMethod = "MANUAL" | "AUTOMATED";

export type GoalConflictStatus = "OPEN" | "RESOLVED" | "DISMISSED";

export type GoalConflictResolutionAction =
  | "EXTEND_DEADLINE"
  | "REASSIGN"
  | "REPRIORITIZE"
  | "DESCOPE"
  | "OTHER";

export type GoalActivityType =
  | "UPDATE"
  | "MILESTONE"
  | "BLOCKER"
  | "ANNOUNCEMENT"
  | "RECOGNITION"
  | "ALERT"
  | "MENTION";

export interface RiskAlert {
  id: string;
  severity: "high" | "medium";
  message: string;
}

export interface HeroStats {
  alignment: number;
  alignmentDelta: string;
  orgImpact: string;
  deptContribution: number;
  alignmentInsight: string;
  completion: number;
  completionStatus: "On Track" | "At Risk" | "Delayed";
  completedCount: number;
  activeCount: number;
  overdueCount: number;
  blockedCount: number;
  kpiAchievement: number;
  kpiLabel: string;
  strongestGroup: string;
  weakestGroup: string;
  productivityChange: string;
  riskAlerts: RiskAlert[];
}

export interface GoalHierarchyNode {
  id: string;
  title: string;
  level: "company" | "department" | "team" | "individual";
  status: "On Track" | "At Risk" | "Delayed" | "Completed" | "Blocked";
  progress: number;
  alignment: number;
  owner: string;
  ownerAvatar?: string;
  departmentName?: string;
  children: GoalHierarchyNode[];
}

export interface LinkedKpiItem {
  id: string;
  title: string;
  name: string;
  targetValue: number;
  currentValue: number;
  progress: number;
  weight: number;
  owner: string;
  ownerAvatar?: string;
  deadline?: string | null;
  measurementMethod?: string;
  automatedTracking?: boolean;
  integrationSource?: string | null;
}

export interface DependencyItem {
  id: string;
  title: string;
  isCurrent: boolean;
  isBlocking?: boolean;
  status?: string;
}

export interface GoalDetail {
  id: string;
  title: string;
  description?: string | null;
  type: string;
  level: GoalLevel;
  status: string;
  progress: number;
  alignmentScore: number;
  alignmentNote: string;
  deadline: string;
  dueDate?: string | null;
  daysLeft: number | null;
  category?: string | null;
  orgObjectiveId?: string | null;
  assignedToId?: string | null;
  owner: string;
  ownerAvatar?: string;
  aiAnalysis: string;
  kpis: LinkedKpiItem[];
  dependencies: DependencyItem[];
}

export interface ConflictResolutionOption {
  id: string;
  title: string;
  description: string;
  action: GoalConflictResolutionAction;
  isRecommended: boolean;
  payload?: any;
}

export interface ConflictGoalOverview {
  id: string;
  title: string;
  department: string;
  requiredResource: string;
  strategicImpact: string;
}

export interface ConflictCardData {
  id: string;
  goalA: ConflictGoalOverview;
  goalB: ConflictGoalOverview;
  capacityA: number;
  capacityB: number;
  deficit: number;
  workloadAnalysisText: string;
  status: GoalConflictStatus;
  resolutions: ConflictResolutionOption[];
}

export interface FeedItemData {
  id: string;
  author: string;
  authorRole: string;
  avatar?: string;
  timeAgo: string;
  content: string;
  badgeType: "BLOCKER" | "ANNOUNCEMENT" | "UPDATE" | "ALERT";
  badgeLabel?: string;
  isBlocker: boolean;
  isResolved?: boolean;
  createdAt: string;
}

export interface TrendDataPoint {
  name: string;
  engineering?: number;
  marketing?: number;
  sales?: number;
  product?: number;
  finance?: number;
  operations?: number;
  [key: string]: string | number | undefined;
}

export interface TopPerformer {
  id: string;
  name: string;
  role: string;
  score: number;
  avatar?: string;
  department?: string;
}

export interface AnalyticsSummary {
  trendData: TrendDataPoint[];
  topPerformers: TopPerformer[];
}

export interface AiStrategyInsight {
  id: string;
  title: string;
  description: string;
  type: "CONFLICT" | "WORKLOAD" | "TIMELINE";
  actionLabel?: string;
}
