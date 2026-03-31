export type SupportHealthStatus = "green" | "yellow" | "red"

export type ActionableState =
  | "awaiting-team"
  | "awaiting-customer"
  | "unassigned"
  | "due-soon"
  | "breached"
  | "resolved"

export type SupportCasePriority = "low" | "normal" | "high" | "urgent"
export type SupportCaseSubtype = "conversation" | "ticket"
export type SupportTier = "free" | "starter" | "pro" | "enterprise" | "unknown"

export interface SupportCaseRecord {
  id: string
  externalId: string
  source: string
  subtype: SupportCaseSubtype
  status: string
  priority: SupportCasePriority
  title: string | null
  description: string | null
  tags: string[]
  teamName: string
  assigneeName: string | null
  customerTier: SupportTier
  createdAt: Date
  updatedAt: Date
  resolvedAt: Date | null
  waitingSinceAt: Date | null
  nextDueAt: Date | null
  rawSlaStatus: string | null
  cxScore: number | null
  cxComment: string | null
  responseTimeMinutes: number | null
  resolutionTimeHours: number | null
  reopenCount: number
  actionableState: ActionableState
  isBreached: boolean
  isDueSoon: boolean
  isHighRisk: boolean
}

export interface SupportHealthSnapshot {
  status: SupportHealthStatus
  statusLabel: string
  activeCaseCount: number
  slaAdherencePercent: number
  dueSoonCount: number
  breachedCount: number
  unassignedCount: number
  urgentHighRiskCount: number
  awaitingTeamCount: number
  awaitingCustomerCount: number
  oldestActionableAgeMinutes: number | null
  freshnessTimestamp: string | null
  stale: boolean
}

export interface QueueHealth {
  teamName: string
  activeCaseCount: number
  awaitingTeamCount: number
  dueSoonCount: number
  breachedCount: number
  unassignedCount: number
  urgentCount: number
  enterpriseCount: number
  oldestActionableAgeMinutes: number | null
  priorityMix: Record<SupportCasePriority, number>
}

export interface ActionItem {
  id: string
  severity: "yellow" | "red"
  label: string
  detail: string
  queueName: string
}

export interface CxPeriodSummary {
  label: string
  score: number | null
  responseRatePercent: number
  ratedCount: number
  eligibleCount: number
  deltaFromPrevious: number | null
}

export interface TrendPoint {
  label: string
  value: number | null
}

export interface ThemeTrend {
  label: string
  currentCount: number
  previousCount: number
  delta: number
}

export interface QueuePressure {
  teamName: string
  currentOpenCount: number
  previousOpenCount: number
  delta: number
}

export interface LiveWallboardData {
  snapshot: SupportHealthSnapshot
  queues: QueueHealth[]
  actionItems: ActionItem[]
  refreshedAt: string
}

export interface TrendsWallboardData {
  snapshot: SupportHealthSnapshot
  periods: CxPeriodSummary[]
  cxSeries: TrendPoint[]
  themeTrends: ThemeTrend[]
  queuePressure: QueuePressure[]
  reopenTrend: TrendPoint[]
  refreshedAt: string
}
