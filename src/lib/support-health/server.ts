import { eq } from "drizzle-orm"
import { createServerFn } from "@tanstack/react-start"
import {
  buildLiveWallboardData,
  buildTrendsWallboardData,
  classifyActionableState,
  isCaseBreached,
  isCaseDueSoon,
  resolveResponseTargetMinutes,
} from "./logic"
import type {
  LiveWallboardData,
  SupportCasePriority,
  SupportCaseRecord,
  SupportTier,
  TrendsWallboardData,
} from "./types"

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value
  if (typeof value === "string") {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  if (typeof value === "number") {
    const ms = value > 1_000_000_000_000 ? value : value * 1000
    const parsed = new Date(ms)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}

function getNestedValue(obj: unknown, path: string[]) {
  let current = obj
  for (const key of path) {
    if (!isRecord(current)) return undefined
    current = current[key]
  }
  return current
}

function getFirstDate(raw: unknown, paths: string[][]) {
  for (const path of paths) {
    const parsed = toDate(getNestedValue(raw, path))
    if (parsed) return parsed
  }
  return null
}

function getFirstNumber(raw: unknown, paths: string[][]) {
  for (const path of paths) {
    const value = getNestedValue(raw, path)
    if (typeof value === "number" && Number.isFinite(value)) return value
  }
  return 0
}

function getTier(value: unknown): SupportTier {
  if (!isRecord(value)) return "unknown"
  const direct = value.tier
  const plan = value.plan

  const normalized =
    typeof direct === "string"
      ? direct.toLowerCase()
      : typeof plan === "string"
        ? plan.toLowerCase()
        : "unknown"

  if (
    normalized === "free" ||
    normalized === "starter" ||
    normalized === "pro" ||
    normalized === "enterprise"
  ) {
    return normalized
  }

  return "unknown"
}

function getPriority(value: unknown): SupportCasePriority {
  if (value === "low" || value === "normal" || value === "high" || value === "urgent") {
    return value
  }
  if (value === "priority") return "high"
  return "normal"
}

function getSlaStatus(raw: unknown) {
  const candidates = [
    getNestedValue(raw, ["sla_applied", "sla_status"]),
    getNestedValue(raw, ["sla", "sla_status"]),
    getNestedValue(raw, ["sla_status"]),
  ]

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate
    }
  }

  return null
}

function getQueueName(raw: unknown, teamName: string | null) {
  const candidate = [
    teamName,
    getNestedValue(raw, ["team", "name"]),
    getNestedValue(raw, ["ticket_type", "name"]),
    getNestedValue(raw, ["ticket_state", "name"]),
    getNestedValue(raw, ["inbox", "name"]),
  ].find((value) => typeof value === "string" && value.trim().length > 0)

  return typeof candidate === "string" ? candidate : "General"
}

function getTags(raw: unknown, current: unknown) {
  if (Array.isArray(current) && current.every((item) => typeof item === "string")) {
    return current
  }

  const rawTags = getNestedValue(raw, ["tags", "tags"])
  if (Array.isArray(rawTags)) {
    return rawTags
      .map((item) => (isRecord(item) && typeof item.name === "string" ? item.name : null))
      .filter((item): item is string => item !== null)
  }

  return []
}

function isAwaitingCustomer(raw: unknown) {
  const stateCandidates = [
    getNestedValue(raw, ["state"]),
    getNestedValue(raw, ["ticket_state", "state"]),
    getNestedValue(raw, ["ticket_state", "name"]),
  ]

  if (
    stateCandidates.some(
      (value) =>
        typeof value === "string" &&
        value.toLowerCase().includes("customer")
    )
  ) {
    return true
  }

  const snoozedUntil = toDate(getNestedValue(raw, ["snoozed_until"]))
  return snoozedUntil !== null && snoozedUntil.getTime() > Date.now()
}

function getNextDueAt(raw: unknown, waitingSinceAt: Date | null, priority: SupportCasePriority, tier: SupportTier) {
  const dueAt = getFirstDate(raw, [
    ["sla_due_at"],
    ["sla", "due_at"],
    ["sla_applied", "next_event_at"],
    ["sla_applied", "due_at"],
    ["statistics", "next_reply_at"],
  ])

  if (dueAt) return dueAt
  if (!waitingSinceAt) return null

  return new Date(
    waitingSinceAt.getTime() + resolveResponseTargetMinutes(priority, tier) * 60_000
  )
}

function normalizeSupportCase(input: {
  id: string
  externalId: string
  source: string
  type: string | null
  status: string
  priority: unknown
  title: string | null
  description: string | null
  tags: unknown
  createdAt: Date
  updatedAt: Date
  resolvedAt: Date | null
  rawData: unknown
  assigneeName: string | null
  teamName: string | null
  entityValue: unknown
  cxScore: number | null
  cxComment: string | null
  responseTimeMinutes: number | null
  resolutionTimeHours: number | null
}): SupportCaseRecord | null {
  const subtype = input.type === "ticket" ? "ticket" : input.type === "conversation" ? "conversation" : null
  if (subtype === null) return null

  const tier = getTier(input.entityValue)
  const priority = getPriority(input.priority)
  const waitingSinceAt =
    getFirstDate(input.rawData, [
      ["waiting_since"],
      ["statistics", "last_contact_reply_at"],
      ["last_contact_reply_at"],
    ]) ?? input.updatedAt
  const rawSlaStatus = getSlaStatus(input.rawData)
  const nextDueAt = getNextDueAt(input.rawData, waitingSinceAt, priority, tier)
  const actionableState = classifyActionableState({
    status: input.status,
    assigneeName: input.assigneeName,
    rawSlaStatus,
    nextDueAt,
    waitingSinceAt,
    priority,
    customerTier: tier,
    isAwaitingCustomer: isAwaitingCustomer(input.rawData),
    now: new Date(),
  })

  const draft = {
    status: input.status,
    assigneeName: input.assigneeName,
    rawSlaStatus,
    nextDueAt,
    waitingSinceAt,
    priority,
    customerTier: tier,
    isAwaitingCustomer: actionableState === "awaiting-customer",
    now: new Date(),
  }

  const isBreached = isCaseBreached(draft)
  const isDueSoon = isCaseDueSoon(draft)
  const isHighRisk =
    (isBreached || isDueSoon || actionableState === "unassigned") &&
    (priority === "urgent" || priority === "high" || tier === "enterprise")

  return {
    id: input.id,
    externalId: input.externalId,
    source: input.source,
    subtype,
    status: input.status,
    priority,
    title: input.title,
    description: input.description,
    tags: getTags(input.rawData, input.tags),
    teamName: getQueueName(input.rawData, input.teamName),
    assigneeName: input.assigneeName,
    customerTier: tier,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    resolvedAt: input.resolvedAt,
    waitingSinceAt,
    nextDueAt,
    rawSlaStatus,
    cxScore: input.cxScore,
    cxComment: input.cxComment,
    responseTimeMinutes: input.responseTimeMinutes,
    resolutionTimeHours: input.resolutionTimeHours,
    reopenCount: getFirstNumber(input.rawData, [
      ["reopen_count"],
      ["statistics", "reopens"],
      ["statistics", "reopen_count"],
    ]),
    actionableState,
    isBreached,
    isDueSoon,
    isHighRisk,
  }
}

async function loadSupportCases() {
  const now = new Date()

  try {
    const [{ db }, schema] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
    ])

    const { nodes, entities, teamMembers, syncState } = schema

    const [rows, syncRows] = await Promise.all([
      db
        .select({
          id: nodes.id,
          externalId: nodes.externalId,
          source: nodes.source,
          type: nodes.type,
          status: nodes.status,
          priority: nodes.priority,
          title: nodes.title,
          description: nodes.description,
          tags: nodes.tags,
          createdAt: nodes.createdAt,
          updatedAt: nodes.updatedAt,
          resolvedAt: nodes.resolvedAt,
          rawData: nodes.rawData,
          cxScore: nodes.cxScore,
          cxComment: nodes.cxComment,
          responseTimeMinutes: nodes.responseTimeMinutes,
          resolutionTimeHours: nodes.resolutionTimeHours,
          assigneeName: teamMembers.name,
          teamName: teamMembers.teamName,
          entityValue: entities.value,
        })
        .from(nodes)
        .leftJoin(entities, eq(nodes.entityId, entities.id))
        .leftJoin(teamMembers, eq(nodes.assigneeId, teamMembers.id))
        .where(eq(nodes.source, "intercom")),
      db.select().from(syncState).where(eq(syncState.adapterId, "intercom")).limit(1),
    ])

    const cases = rows
      .map((row) => normalizeSupportCase(row))
      .filter((item): item is SupportCaseRecord => item !== null)

    return {
      now,
      lastSyncAt: syncRows[0]?.lastSyncAt ?? null,
      cases,
    }
  } catch (error) {
    console.error("Failed to load support wallboard data", error)
    return {
      now,
      lastSyncAt: null,
      cases: [] as SupportCaseRecord[],
    }
  }
}

export const getLiveWallboard = createServerFn({ method: "GET" }).handler(
  async (): Promise<LiveWallboardData> => {
    const { cases, lastSyncAt, now } = await loadSupportCases()
    return buildLiveWallboardData(cases, lastSyncAt, now)
  }
)

export const getTrendsWallboard = createServerFn({ method: "GET" }).handler(
  async (): Promise<TrendsWallboardData> => {
    const { cases, lastSyncAt, now } = await loadSupportCases()
    return buildTrendsWallboardData(cases, lastSyncAt, now)
  }
)
