import {
  differenceInMinutes,
  eachDayOfInterval,
  endOfDay,
  format,
  isBefore,
  isWithinInterval,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subDays,
  subMonths,
  subQuarters,
  subYears,
} from "date-fns"
import type {
  ActionItem,
  ActionableState,
  CxPeriodSummary,
  LiveWallboardData,
  QueueHealth,
  SupportCasePriority,
  SupportCaseRecord,
  SupportHealthSnapshot,
  TrendPoint,
  TrendsWallboardData,
  SupportTier,
} from "./types"

interface ActionableStateInput {
  status: string
  assigneeName: string | null
  rawSlaStatus: string | null
  nextDueAt: Date | null
  waitingSinceAt: Date | null
  priority: SupportCasePriority
  customerTier: SupportTier
  isAwaitingCustomer: boolean
  now: Date
}

function round(value: number, digits = 1) {
  return Number(value.toFixed(digits))
}

function isResolvedStatus(status: string) {
  return ["resolved", "closed"].includes(status)
}

export function resolveResponseTargetMinutes(
  priority: SupportCasePriority,
  customerTier: SupportTier
) {
  if (priority === "urgent") return 15
  if (priority === "high") return 60
  if (customerTier === "enterprise") return 60
  if (customerTier === "pro") return 180
  return 240
}

export function isCaseBreached(input: ActionableStateInput) {
  if (isResolvedStatus(input.status)) return false
  if (input.rawSlaStatus?.toLowerCase() === "missed") return true
  if (!input.nextDueAt) return false
  return isBefore(input.nextDueAt, input.now)
}

export function isCaseDueSoon(input: ActionableStateInput) {
  if (isResolvedStatus(input.status)) return false
  if (isCaseBreached(input)) return false
  if (input.nextDueAt) {
    return differenceInMinutes(input.nextDueAt, input.now) <= 60
  }
  if (!input.waitingSinceAt) return false
  const targetMinutes = resolveResponseTargetMinutes(
    input.priority,
    input.customerTier
  )
  const age = differenceInMinutes(input.now, input.waitingSinceAt)
  return age >= Math.max(targetMinutes - 60, Math.floor(targetMinutes * 0.75))
}

export function classifyActionableState(
  input: ActionableStateInput
): ActionableState {
  if (isResolvedStatus(input.status)) return "resolved"
  if (isCaseBreached(input)) return "breached"
  if (isCaseDueSoon(input)) return "due-soon"
  if (!input.assigneeName) return "unassigned"
  if (input.isAwaitingCustomer) return "awaiting-customer"
  return "awaiting-team"
}

function isActionableCase(item: SupportCaseRecord) {
  return item.actionableState !== "resolved"
}

function getOldestActionableAgeMinutes(cases: SupportCaseRecord[], now: Date) {
  const actionable = cases.filter(isActionableCase)
  if (actionable.length === 0) return null

  return Math.max(
    ...actionable.map((item) =>
      differenceInMinutes(now, item.waitingSinceAt ?? item.createdAt)
    )
  )
}

function buildStatusLabel(status: SupportHealthSnapshot["status"]) {
  if (status === "green") return "On track"
  if (status === "yellow") return "Needs attention"
  return "Off track"
}

export function calculateHealthStatus(input: {
  breachedCount: number
  dueSoonCount: number
  urgentHighRiskCount: number
  unassignedCount: number
  stale: boolean
  queueOffTrack: boolean
}): SupportHealthSnapshot["status"] {
  if (
    input.urgentHighRiskCount > 0 ||
    input.breachedCount >= 3 ||
    input.queueOffTrack
  ) {
    return "red"
  }

  if (
    input.stale ||
    input.breachedCount > 0 ||
    input.dueSoonCount >= 3 ||
    input.unassignedCount >= 3
  ) {
    return "yellow"
  }

  return "green"
}

export function buildSupportHealthSnapshot(
  cases: SupportCaseRecord[],
  lastSyncAt: Date | null,
  now: Date
): SupportHealthSnapshot {
  const activeCases = cases.filter(isActionableCase)
  const dueSoonCount = activeCases.filter((item) => item.isDueSoon).length
  const breachedCount = activeCases.filter((item) => item.isBreached).length
  const unassignedCount = activeCases.filter(
    (item) => item.actionableState === "unassigned"
  ).length
  const urgentHighRiskCount = activeCases.filter((item) => item.isHighRisk).length
  const awaitingTeamCount = activeCases.filter(
    (item) =>
      item.actionableState === "awaiting-team" ||
      item.actionableState === "due-soon" ||
      item.actionableState === "breached"
  ).length
  const awaitingCustomerCount = activeCases.filter(
    (item) => item.actionableState === "awaiting-customer"
  ).length

  const slaTrackedCases = activeCases.filter(
    (item) => item.rawSlaStatus !== null || item.nextDueAt !== null
  )
  const slaAdherencePercent =
    slaTrackedCases.length === 0
      ? 100
      : round(
          ((slaTrackedCases.length -
            slaTrackedCases.filter((item) => item.isBreached).length) /
            slaTrackedCases.length) *
            100
        )

  const freshnessMinutes =
    lastSyncAt === null ? Number.POSITIVE_INFINITY : differenceInMinutes(now, lastSyncAt)
  const stale = freshnessMinutes > 10

  const queues = buildQueueHealth(cases, now)
  const queueOffTrack = queues.some(
    (queue) => queue.breachedCount >= 2 || queue.dueSoonCount >= 6
  )

  const status = calculateHealthStatus({
    breachedCount,
    dueSoonCount,
    urgentHighRiskCount,
    unassignedCount,
    stale,
    queueOffTrack,
  })

  return {
    status,
    statusLabel: buildStatusLabel(status),
    activeCaseCount: activeCases.length,
    slaAdherencePercent,
    dueSoonCount,
    breachedCount,
    unassignedCount,
    urgentHighRiskCount,
    awaitingTeamCount,
    awaitingCustomerCount,
    oldestActionableAgeMinutes: getOldestActionableAgeMinutes(cases, now),
    freshnessTimestamp: lastSyncAt?.toISOString() ?? null,
    stale,
  }
}

export function buildQueueHealth(cases: SupportCaseRecord[], now: Date) {
  const grouped = new Map<string, SupportCaseRecord[]>()

  for (const item of cases.filter(isActionableCase)) {
    const key = item.teamName || "Unassigned"
    const list = grouped.get(key)
    if (list) {
      list.push(item)
    } else {
      grouped.set(key, [item])
    }
  }

  const queues: QueueHealth[] = Array.from(grouped.entries()).map(
    ([teamName, items]) => ({
      teamName,
      activeCaseCount: items.length,
      awaitingTeamCount: items.filter(
        (item) =>
          item.actionableState === "awaiting-team" ||
          item.actionableState === "due-soon" ||
          item.actionableState === "breached"
      ).length,
      dueSoonCount: items.filter((item) => item.isDueSoon).length,
      breachedCount: items.filter((item) => item.isBreached).length,
      unassignedCount: items.filter((item) => item.actionableState === "unassigned")
        .length,
      urgentCount: items.filter((item) => item.priority === "urgent").length,
      enterpriseCount: items.filter((item) => item.customerTier === "enterprise")
        .length,
      oldestActionableAgeMinutes: items.length
        ? Math.max(
            ...items.map((item) =>
              differenceInMinutes(now, item.waitingSinceAt ?? item.createdAt)
            )
          )
        : null,
      priorityMix: {
        low: items.filter((item) => item.priority === "low").length,
        normal: items.filter((item) => item.priority === "normal").length,
        high: items.filter((item) => item.priority === "high").length,
        urgent: items.filter((item) => item.priority === "urgent").length,
      },
    })
  )

  return queues.sort((left, right) => {
    const leftScore =
      left.breachedCount * 100 +
      left.dueSoonCount * 20 +
      left.unassignedCount * 15 +
      (left.oldestActionableAgeMinutes ?? 0)
    const rightScore =
      right.breachedCount * 100 +
      right.dueSoonCount * 20 +
      right.unassignedCount * 15 +
      (right.oldestActionableAgeMinutes ?? 0)
    return rightScore - leftScore
  })
}

export function buildActionItems(queues: QueueHealth[]): ActionItem[] {
  return queues.slice(0, 3).map((queue, index) => {
    const severity = queue.breachedCount > 0 || queue.urgentCount > 0 ? "red" : "yellow"

    let label = `${queue.teamName} is on track`
    let detail = `${queue.activeCaseCount} active cases`

    if (queue.breachedCount > 0) {
      label = `${queue.teamName} has ${queue.breachedCount} breached`
      detail = `${queue.dueSoonCount} more due soon`
    } else if (queue.dueSoonCount > 0) {
      label = `${queue.teamName} has ${queue.dueSoonCount} due soon`
      detail = `${queue.unassignedCount} unassigned, ${queue.urgentCount} urgent`
    } else if (queue.unassignedCount > 0) {
      label = `${queue.teamName} has ${queue.unassignedCount} unassigned`
      detail = `${queue.activeCaseCount} active in queue`
    }

    return {
      id: `${queue.teamName}-${index}`,
      severity,
      label,
      detail,
      queueName: queue.teamName,
    }
  })
}

function getPeriodEligibleCases(
  cases: SupportCaseRecord[],
  start: Date,
  end: Date
) {
  return cases.filter((item) => {
    const resolvedAt = item.resolvedAt ?? item.updatedAt
    return isWithinInterval(resolvedAt, { start, end }) && item.actionableState === "resolved"
  })
}

export function buildCxPeriodSummary(
  cases: SupportCaseRecord[],
  label: string,
  start: Date,
  end: Date,
  previousStart: Date,
  previousEnd: Date
): CxPeriodSummary {
  const eligible = getPeriodEligibleCases(cases, start, end)
  const rated = eligible.filter((item) => item.cxScore !== null)
  const previousRated = getPeriodEligibleCases(cases, previousStart, previousEnd).filter(
    (item) => item.cxScore !== null
  )

  const score =
    rated.length === 0
      ? null
      : round(rated.reduce((sum, item) => sum + (item.cxScore ?? 0), 0) / rated.length, 2)
  const previousScore =
    previousRated.length === 0
      ? null
      : round(
          previousRated.reduce((sum, item) => sum + (item.cxScore ?? 0), 0) /
            previousRated.length,
          2
        )

  return {
    label,
    score,
    responseRatePercent:
      eligible.length === 0 ? 0 : round((rated.length / eligible.length) * 100),
    ratedCount: rated.length,
    eligibleCount: eligible.length,
    deltaFromPrevious:
      score === null || previousScore === null ? null : round(score - previousScore, 2),
  }
}

export function buildCxSeries(cases: SupportCaseRecord[], now: Date): TrendPoint[] {
  const start = startOfMonth(now)
  const days = eachDayOfInterval({ start, end: endOfDay(now) })
  return days.map((day) => {
    const dayEnd = endOfDay(day)
    const rated = cases.filter((item) => {
      if (item.cxScore === null) return false
      const resolvedAt = item.resolvedAt ?? item.updatedAt
      return isWithinInterval(resolvedAt, { start: day, end: dayEnd })
    })

    return {
      label: format(day, "d"),
      value:
        rated.length === 0
          ? null
          : round(rated.reduce((sum, item) => sum + (item.cxScore ?? 0), 0) / rated.length, 2),
    }
  })
}

function collectTagCounts(cases: SupportCaseRecord[]) {
  const counts = new Map<string, number>()
  for (const item of cases) {
    for (const tag of item.tags) {
      if (!tag) continue
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }
  return counts
}

export function buildThemeTrends(cases: SupportCaseRecord[], now: Date) {
  const currentStart = subDays(startOfDay(now), 29)
  const previousStart = subDays(currentStart, 30)
  const previousEnd = subDays(currentStart, 1)

  const currentCases = cases.filter((item) =>
    isWithinInterval(item.createdAt, { start: currentStart, end: now })
  )
  const previousCases = cases.filter((item) =>
    isWithinInterval(item.createdAt, { start: previousStart, end: previousEnd })
  )

  const currentCounts = collectTagCounts(currentCases)
  const previousCounts = collectTagCounts(previousCases)

  return Array.from(currentCounts.entries())
    .map(([label, currentCount]) => ({
      label,
      currentCount,
      previousCount: previousCounts.get(label) ?? 0,
      delta: currentCount - (previousCounts.get(label) ?? 0),
    }))
    .sort((left, right) => {
      if (right.delta !== left.delta) return right.delta - left.delta
      return right.currentCount - left.currentCount
    })
    .slice(0, 5)
}

export function buildQueuePressure(cases: SupportCaseRecord[], now: Date) {
  const currentStart = subDays(startOfDay(now), 6)
  const previousStart = subDays(currentStart, 7)
  const previousEnd = subDays(currentStart, 1)

  const countByTeam = (items: SupportCaseRecord[]) => {
    const counts = new Map<string, number>()
    for (const item of items) {
      counts.set(item.teamName, (counts.get(item.teamName) ?? 0) + 1)
    }
    return counts
  }

  const currentCounts = countByTeam(
    cases.filter((item) => isWithinInterval(item.createdAt, { start: currentStart, end: now }))
  )
  const previousCounts = countByTeam(
    cases.filter((item) =>
      isWithinInterval(item.createdAt, { start: previousStart, end: previousEnd })
    )
  )

  return Array.from(currentCounts.entries())
    .map(([teamName, currentOpenCount]) => ({
      teamName,
      currentOpenCount,
      previousOpenCount: previousCounts.get(teamName) ?? 0,
      delta: currentOpenCount - (previousCounts.get(teamName) ?? 0),
    }))
    .sort((left, right) => right.delta - left.delta)
    .slice(0, 4)
}

export function buildReopenTrend(cases: SupportCaseRecord[], now: Date) {
  const start = subDays(startOfDay(now), 13)
  const days = eachDayOfInterval({ start, end: endOfDay(now) })
  return days.map((day) => {
    const dayEnd = endOfDay(day)
    const reopenCount = cases
      .filter((item) => isWithinInterval(item.updatedAt, { start: day, end: dayEnd }))
      .reduce((sum, item) => sum + item.reopenCount, 0)

    return {
      label: format(day, "d MMM"),
      value: reopenCount,
    }
  })
}

export function buildLiveWallboardData(
  cases: SupportCaseRecord[],
  lastSyncAt: Date | null,
  now: Date
): LiveWallboardData {
  const snapshot = buildSupportHealthSnapshot(cases, lastSyncAt, now)
  const queues = buildQueueHealth(cases, now)
  return {
    snapshot,
    queues,
    actionItems: buildActionItems(queues),
    refreshedAt: now.toISOString(),
  }
}

export function buildTrendsWallboardData(
  cases: SupportCaseRecord[],
  lastSyncAt: Date | null,
  now: Date
): TrendsWallboardData {
  const snapshot = buildSupportHealthSnapshot(cases, lastSyncAt, now)
  return {
    snapshot,
    periods: [
      buildCxPeriodSummary(
        cases,
        "Month",
        startOfMonth(now),
        now,
        subMonths(startOfMonth(now), 1),
        subDays(startOfMonth(now), 1)
      ),
      buildCxPeriodSummary(
        cases,
        "Quarter",
        startOfQuarter(now),
        now,
        subQuarters(startOfQuarter(now), 1),
        subDays(startOfQuarter(now), 1)
      ),
      buildCxPeriodSummary(
        cases,
        "Year",
        startOfYear(now),
        now,
        subYears(startOfYear(now), 1),
        subDays(startOfYear(now), 1)
      ),
    ],
    cxSeries: buildCxSeries(cases, now),
    themeTrends: buildThemeTrends(cases, now),
    queuePressure: buildQueuePressure(cases, now),
    reopenTrend: buildReopenTrend(cases, now),
    refreshedAt: now.toISOString(),
  }
}
