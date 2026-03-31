import { describe, expect, it } from "vitest"
import {
  buildLiveWallboardData,
  buildTrendsWallboardData,
  calculateHealthStatus,
  classifyActionableState,
  isCaseBreached,
  isCaseDueSoon,
} from "./logic"
import type { SupportCaseRecord } from "./types"

const now = new Date("2026-03-31T12:00:00.000Z")

function makeCase(overrides: Partial<SupportCaseRecord> = {}): SupportCaseRecord {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    externalId: overrides.externalId ?? "ext-1",
    source: "intercom",
    subtype: "conversation",
    status: overrides.status ?? "open",
    priority: overrides.priority ?? "normal",
    title: overrides.title ?? "Customer issue",
    description: overrides.description ?? null,
    tags: overrides.tags ?? ["billing"],
    teamName: overrides.teamName ?? "Billing",
    assigneeName: overrides.assigneeName ?? "Casey",
    customerTier: overrides.customerTier ?? "pro",
    createdAt: overrides.createdAt ?? new Date("2026-03-31T09:00:00.000Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-03-31T11:00:00.000Z"),
    resolvedAt: overrides.resolvedAt ?? null,
    waitingSinceAt: overrides.waitingSinceAt ?? new Date("2026-03-31T10:30:00.000Z"),
    nextDueAt: overrides.nextDueAt ?? new Date("2026-03-31T13:15:00.000Z"),
    rawSlaStatus: overrides.rawSlaStatus ?? "active",
    cxScore: overrides.cxScore ?? null,
    cxComment: overrides.cxComment ?? null,
    responseTimeMinutes: overrides.responseTimeMinutes ?? 22,
    resolutionTimeHours: overrides.resolutionTimeHours ?? null,
    reopenCount: overrides.reopenCount ?? 0,
    actionableState: overrides.actionableState ?? "awaiting-team",
    isBreached: overrides.isBreached ?? false,
    isDueSoon: overrides.isDueSoon ?? false,
    isHighRisk: overrides.isHighRisk ?? false,
  }
}

describe("support health logic", () => {
  it("classifies actionable state correctly", () => {
    expect(
      classifyActionableState({
        status: "closed",
        assigneeName: "Casey",
        rawSlaStatus: "hit",
        nextDueAt: null,
        waitingSinceAt: now,
        priority: "normal",
        customerTier: "pro",
        isAwaitingCustomer: false,
        now,
      })
    ).toBe("resolved")

    expect(
      classifyActionableState({
        status: "open",
        assigneeName: null,
        rawSlaStatus: "active",
        nextDueAt: new Date("2026-03-31T14:00:00.000Z"),
        waitingSinceAt: now,
        priority: "normal",
        customerTier: "pro",
        isAwaitingCustomer: false,
        now,
      })
    ).toBe("unassigned")

    expect(
      classifyActionableState({
        status: "open",
        assigneeName: "Casey",
        rawSlaStatus: "missed",
        nextDueAt: new Date("2026-03-31T11:00:00.000Z"),
        waitingSinceAt: now,
        priority: "high",
        customerTier: "enterprise",
        isAwaitingCustomer: false,
        now,
      })
    ).toBe("breached")

    expect(
      classifyActionableState({
        status: "open",
        assigneeName: "Casey",
        rawSlaStatus: "active",
        nextDueAt: new Date("2026-03-31T12:45:00.000Z"),
        waitingSinceAt: now,
        priority: "high",
        customerTier: "enterprise",
        isAwaitingCustomer: false,
        now,
      })
    ).toBe("due-soon")

    expect(
      classifyActionableState({
        status: "open",
        assigneeName: "Casey",
        rawSlaStatus: "active",
        nextDueAt: new Date("2026-03-31T15:00:00.000Z"),
        waitingSinceAt: now,
        priority: "normal",
        customerTier: "pro",
        isAwaitingCustomer: true,
        now,
      })
    ).toBe("awaiting-customer")
  })

  it("detects due soon and breached cases", () => {
    expect(
      isCaseBreached({
        status: "open",
        assigneeName: "Casey",
        rawSlaStatus: "missed",
        nextDueAt: new Date("2026-03-31T11:00:00.000Z"),
        waitingSinceAt: now,
        priority: "normal",
        customerTier: "pro",
        isAwaitingCustomer: false,
        now,
      })
    ).toBe(true)

    expect(
      isCaseDueSoon({
        status: "open",
        assigneeName: "Casey",
        rawSlaStatus: "active",
        nextDueAt: new Date("2026-03-31T12:40:00.000Z"),
        waitingSinceAt: now,
        priority: "normal",
        customerTier: "pro",
        isAwaitingCustomer: false,
        now,
      })
    ).toBe(true)
  })

  it("calculates health status from SLA risk instead of closures", () => {
    expect(
      calculateHealthStatus({
        breachedCount: 0,
        dueSoonCount: 1,
        urgentHighRiskCount: 0,
        unassignedCount: 0,
        stale: false,
        queueOffTrack: false,
      })
    ).toBe("green")

    expect(
      calculateHealthStatus({
        breachedCount: 1,
        dueSoonCount: 2,
        urgentHighRiskCount: 0,
        unassignedCount: 0,
        stale: false,
        queueOffTrack: false,
      })
    ).toBe("yellow")

    expect(
      calculateHealthStatus({
        breachedCount: 2,
        dueSoonCount: 4,
        urgentHighRiskCount: 1,
        unassignedCount: 0,
        stale: false,
        queueOffTrack: false,
      })
    ).toBe("red")
  })

  it("builds month, quarter, and year CX summaries", () => {
    const cases = [
      makeCase({
        status: "closed",
        resolvedAt: new Date("2026-03-15T10:00:00.000Z"),
        updatedAt: new Date("2026-03-15T10:00:00.000Z"),
        cxScore: 8,
        actionableState: "resolved",
      }),
      makeCase({
        id: "2",
        status: "closed",
        resolvedAt: new Date("2026-02-18T10:00:00.000Z"),
        updatedAt: new Date("2026-02-18T10:00:00.000Z"),
        cxScore: 6,
        actionableState: "resolved",
      }),
      makeCase({
        id: "3",
        status: "closed",
        resolvedAt: new Date("2026-01-10T10:00:00.000Z"),
        updatedAt: new Date("2026-01-10T10:00:00.000Z"),
        cxScore: 10,
        actionableState: "resolved",
      }),
    ]

    const trends = buildTrendsWallboardData(cases, new Date("2026-03-31T11:57:00.000Z"), now)

    expect(trends.periods).toHaveLength(3)
    expect(trends.periods[0].label).toBe("Month")
    expect(trends.periods[0].score).toBe(8)
    expect(trends.periods[1].label).toBe("Quarter")
    expect(trends.periods[1].score).toBe(8)
    expect(trends.periods[2].label).toBe("Year")
    expect(trends.periods[2].score).toBe(8)
  })

  it("keeps public wallboard output free of customer identifiers", () => {
    const cases = [
      makeCase({
        title: "Acme Corp billing failure",
        description: "john@acme.test needs a response",
        tags: ["billing"],
        teamName: "Billing",
        actionableState: "due-soon",
        isDueSoon: true,
      }),
    ]

    const live = buildLiveWallboardData(cases, new Date("2026-03-31T11:57:00.000Z"), now)
    const trends = buildTrendsWallboardData(cases, new Date("2026-03-31T11:57:00.000Z"), now)
    const payload = JSON.stringify({ live, trends })

    expect(payload).not.toContain("Acme")
    expect(payload).not.toContain("john@acme.test")
  })
})
