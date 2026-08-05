import { describe, expect, it } from "vitest";
import {
	buildAgentPerformanceComparison,
	buildCxSeries,
	buildDailyVolumeSlaSeries,
	buildLiveWallboardData,
	buildLookupCases,
	buildSupportHealthSnapshot,
	buildTrendsWallboardData,
	buildWorkflowCounts,
	calculateHealthStatus,
	classifyActionableState,
	isCaseBreached,
	isCaseDueSoon,
} from "./logic";
import { resolveSupportPeriod } from "./period";
import type { SupportCaseRecord } from "./types";

const now = new Date("2026-03-31T12:00:00.000Z");
const currentWeek = resolveSupportPeriod({ period: "current-week" }, now);

function makeCase(
	overrides: Partial<SupportCaseRecord> = {},
): SupportCaseRecord {
	return {
		id: overrides.id ?? crypto.randomUUID(),
		externalId: overrides.externalId ?? "ext-1",
		source: "intercom",
		subtype: overrides.subtype ?? "conversation",
		status: overrides.status ?? "open",
		priority: overrides.priority ?? "normal",
		title: overrides.title ?? "Customer issue",
		description: overrides.description ?? null,
		tags: overrides.tags ?? ["billing"],
		teamName: overrides.teamName ?? "Billing",
		productName: overrides.productName ?? "Billing",
		serviceBucket: overrides.serviceBucket ?? "headline",
		servicePolicyName: overrides.servicePolicyName ?? "Standard workflow",
		contactName: overrides.contactName ?? null,
		assigneeExternalId: overrides.assigneeExternalId ?? null,
		assigneeName: overrides.assigneeName ?? "Casey",
		assigneeAvatarUrl: overrides.assigneeAvatarUrl ?? null,
		hasAssignment: overrides.hasAssignment ?? true,
		customerTier: overrides.customerTier ?? "pro",
		createdAt: overrides.createdAt ?? new Date("2026-03-31T09:00:00.000Z"),
		updatedAt: overrides.updatedAt ?? new Date("2026-03-31T11:00:00.000Z"),
		resolvedAt: overrides.resolvedAt ?? null,
		waitingSinceAt:
			overrides.waitingSinceAt ?? new Date("2026-03-31T10:30:00.000Z"),
		nextDueAt: overrides.nextDueAt ?? new Date("2026-03-31T13:15:00.000Z"),
		rawSlaStatus: overrides.rawSlaStatus ?? "active",
		hasSlaTracking: overrides.hasSlaTracking ?? true,
		cxScore: overrides.cxScore ?? null,
		cxComment: overrides.cxComment ?? null,
		finParticipated: overrides.finParticipated ?? false,
		finResolutionState: overrides.finResolutionState ?? null,
		ratedTeammateExternalId: overrides.ratedTeammateExternalId ?? null,
		responseTimeMinutes: overrides.responseTimeMinutes ?? 22,
		resolutionTimeHours: overrides.resolutionTimeHours ?? null,
		reopenCount: overrides.reopenCount ?? 0,
		actionableState: overrides.actionableState ?? "awaiting-team",
		isBreached: overrides.isBreached ?? false,
		isDueSoon: overrides.isDueSoon ?? false,
		isHighRisk: overrides.isHighRisk ?? false,
		isDeveloperTicket: overrides.isDeveloperTicket ?? false,
		isTicketReview: overrides.isTicketReview ?? false,
		isAssignedToDeveloperTeam: overrides.isAssignedToDeveloperTeam ?? false,
	};
}

describe("support health logic", () => {
	it("compares Fin resolutions with teammate resolutions in the same period", () => {
		const comparison = buildAgentPerformanceComparison(
			[
				makeCase({
					id: "fin-resolved",
					actionableState: "resolved",
					status: "closed",
					resolvedAt: new Date("2026-03-31T10:00:00.000Z"),
					finParticipated: true,
					finResolutionState: "confirmed_resolution",
					cxScore: 10,
				}),
				makeCase({
					id: "human-resolved",
					actionableState: "resolved",
					status: "closed",
					resolvedAt: new Date("2026-03-31T10:30:00.000Z"),
					finParticipated: true,
					finResolutionState: "routed_to_team",
					cxScore: 6,
				}),
			],
			currentWeek,
		);

		expect(comparison.fin).toMatchObject({
			resolvedCount: 1,
			ratedCount: 1,
			happinessPercent: 100,
		});
		expect(comparison.teammates).toMatchObject({
			resolvedCount: 1,
			ratedCount: 1,
			happinessPercent: 0,
		});
		expect(comparison.finHandoffCount).toBe(1);
	});

	it("classifies actionable state correctly", () => {
		expect(
			classifyActionableState({
				status: "closed",
				hasAssignment: true,
				rawSlaStatus: "hit",
				hasSlaTracking: true,
				nextDueAt: null,
				waitingSinceAt: now,
				priority: "normal",
				customerTier: "pro",
				isAwaitingCustomer: false,
				now,
			}),
		).toBe("resolved");

		expect(
			classifyActionableState({
				status: "open",
				hasAssignment: false,
				rawSlaStatus: "active",
				hasSlaTracking: true,
				nextDueAt: new Date("2026-03-31T14:00:00.000Z"),
				waitingSinceAt: now,
				priority: "normal",
				customerTier: "pro",
				isAwaitingCustomer: false,
				now,
			}),
		).toBe("unassigned");

		expect(
			classifyActionableState({
				status: "open",
				hasAssignment: true,
				rawSlaStatus: "missed",
				hasSlaTracking: true,
				nextDueAt: new Date("2026-03-31T11:00:00.000Z"),
				waitingSinceAt: now,
				priority: "high",
				customerTier: "enterprise",
				isAwaitingCustomer: false,
				now,
			}),
		).toBe("breached");

		expect(
			classifyActionableState({
				status: "open",
				hasAssignment: true,
				rawSlaStatus: "active",
				hasSlaTracking: true,
				nextDueAt: new Date("2026-03-31T12:45:00.000Z"),
				waitingSinceAt: now,
				priority: "high",
				customerTier: "enterprise",
				isAwaitingCustomer: false,
				now,
			}),
		).toBe("due-soon");

		expect(
			classifyActionableState({
				status: "open",
				hasAssignment: true,
				rawSlaStatus: "active",
				hasSlaTracking: true,
				nextDueAt: new Date("2026-03-31T15:00:00.000Z"),
				waitingSinceAt: now,
				priority: "normal",
				customerTier: "pro",
				isAwaitingCustomer: true,
				now,
			}),
		).toBe("awaiting-customer");

		expect(
			classifyActionableState({
				status: "open",
				hasAssignment: true,
				rawSlaStatus: "missed",
				hasSlaTracking: true,
				nextDueAt: new Date("2026-03-31T11:00:00.000Z"),
				waitingSinceAt: now,
				priority: "high",
				customerTier: "enterprise",
				isAwaitingCustomer: true,
				now,
			}),
		).toBe("awaiting-customer");
	});

	it("detects due soon and breached cases", () => {
		expect(
			isCaseBreached({
				status: "open",
				hasAssignment: true,
				rawSlaStatus: "missed",
				hasSlaTracking: true,
				nextDueAt: new Date("2026-03-31T11:00:00.000Z"),
				waitingSinceAt: now,
				priority: "normal",
				customerTier: "pro",
				isAwaitingCustomer: false,
				now,
			}),
		).toBe(true);

		expect(
			isCaseBreached({
				status: "open",
				hasAssignment: true,
				rawSlaStatus: "missed",
				hasSlaTracking: true,
				nextDueAt: new Date("2026-03-31T11:00:00.000Z"),
				waitingSinceAt: now,
				priority: "normal",
				customerTier: "pro",
				isAwaitingCustomer: true,
				now,
			}),
		).toBe(false);

		expect(
			isCaseDueSoon({
				status: "open",
				hasAssignment: true,
				rawSlaStatus: "active",
				hasSlaTracking: true,
				nextDueAt: new Date("2026-03-31T12:40:00.000Z"),
				waitingSinceAt: now,
				priority: "normal",
				customerTier: "pro",
				isAwaitingCustomer: false,
				now,
			}),
		).toBe(true);

		expect(
			isCaseDueSoon({
				status: "open",
				hasAssignment: true,
				rawSlaStatus: "active",
				hasSlaTracking: true,
				nextDueAt: new Date("2026-03-31T12:40:00.000Z"),
				waitingSinceAt: now,
				priority: "normal",
				customerTier: "pro",
				isAwaitingCustomer: true,
				now,
			}),
		).toBe(false);
	});

	it("resolves the rolling 30 day period relative to now", () => {
		const period = resolveSupportPeriod({ period: "rolling-30-days" }, now);

		expect(period.range).toMatchObject({
			preset: "rolling-30-days",
			label: "Last 30 days",
			from: "2026-03-02",
			to: "2026-03-31",
		});
		expect(period.from.getHours()).toBe(0);
		expect(period.from.getMinutes()).toBe(0);
		expect(period.to).toBe(now);
	});

	it("builds workflow counts for ticket review and developer team assignment", () => {
		expect(
			buildWorkflowCounts([
				makeCase({
					id: "review",
					isDeveloperTicket: true,
					isTicketReview: true,
					isAssignedToDeveloperTeam: true,
				}),
				makeCase({
					id: "developer-team",
					isDeveloperTicket: true,
					isAssignedToDeveloperTeam: true,
				}),
				makeCase({
					id: "resolved-review",
					status: "closed",
					actionableState: "resolved",
					isDeveloperTicket: true,
					isTicketReview: true,
					isAssignedToDeveloperTeam: true,
				}),
			]),
		).toEqual({
			ticketReviewCount: 1,
			developerTeamAssignedCount: 2,
		});
	});

	it("calculates health status from SLA risk instead of closures", () => {
		expect(
			calculateHealthStatus({
				breachedCount: 0,
				dueSoonCount: 1,
				urgentHighRiskCount: 0,
				unassignedCount: 0,
				unknownCaseCount: 0,
				unknownBreachedCount: 0,
				stale: false,
				queueOffTrack: false,
			}),
		).toBe("green");

		expect(
			calculateHealthStatus({
				breachedCount: 1,
				dueSoonCount: 2,
				urgentHighRiskCount: 0,
				unassignedCount: 0,
				unknownCaseCount: 0,
				unknownBreachedCount: 0,
				stale: false,
				queueOffTrack: false,
			}),
		).toBe("yellow");

		expect(
			calculateHealthStatus({
				breachedCount: 2,
				dueSoonCount: 4,
				urgentHighRiskCount: 1,
				unassignedCount: 0,
				unknownCaseCount: 0,
				unknownBreachedCount: 0,
				stale: false,
				queueOffTrack: false,
			}),
		).toBe("red");
	});

	it("uses the configured stale threshold for the successful sync clock", () => {
		const lastSyncAt = new Date("2026-03-31T11:45:00.000Z");
		expect(buildSupportHealthSnapshot([], lastSyncAt, now, 20).stale).toBe(
			false,
		);
		expect(buildSupportHealthSnapshot([], lastSyncAt, now, 10).stale).toBe(
			true,
		);
	});

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
		];

		const trends = buildTrendsWallboardData(
			cases,
			new Date("2026-03-31T11:57:00.000Z"),
			now,
			currentWeek,
		);

		expect(trends.periods).toHaveLength(3);
		expect(trends.periods[0].label).toBe("Month");
		expect(trends.periods[0].score).toBe(8);
		expect(trends.periods[0].satisfactionScorePercent).toBe(100);
		expect(trends.periods[1].label).toBe("Quarter");
		expect(trends.periods[1].score).toBe(8);
		expect(trends.periods[1].satisfactionScorePercent).toBe(66.7);
		expect(trends.periods[2].label).toBe("Year");
		expect(trends.periods[2].score).toBe(8);
		expect(trends.periods[2].satisfactionScorePercent).toBe(66.7);
	});

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
		];

		const live = buildLiveWallboardData(
			cases,
			new Date("2026-03-31T11:57:00.000Z"),
			now,
		);
		const trends = buildTrendsWallboardData(
			cases,
			new Date("2026-03-31T11:57:00.000Z"),
			now,
			currentWeek,
		);
		const payload = JSON.stringify({ live, trends });

		expect(payload).not.toContain("Acme");
		expect(payload).not.toContain("john@acme.test");
	});

	it("builds people-focused ticker moments from assignee CX and ownership signals", () => {
		const cases = [
			makeCase({
				productName: "Addo Sign",
				title: "Customer needs integration help",
				tags: ["integration"],
				status: "closed",
				actionableState: "resolved",
				assigneeName: "Jason",
				cxScore: 8,
				resolvedAt: new Date("2026-03-31T10:00:00.000Z"),
				updatedAt: new Date("2026-03-31T10:00:00.000Z"),
			}),
			makeCase({
				id: "unassigned-1",
				productName: "twoday",
				assigneeName: null,
				hasAssignment: false,
				actionableState: "unassigned",
			}),
			makeCase({
				id: "unassigned-2",
				productName: "twoday",
				assigneeName: null,
				hasAssignment: false,
				actionableState: "unassigned",
			}),
		];

		const live = buildLiveWallboardData(
			cases,
			new Date("2026-03-31T11:57:00.000Z"),
			now,
		);
		const ticker = live.peopleMoments.join(" ");

		expect(ticker).toContain("Jason");
		expect(ticker).toContain("integrations");
		expect(ticker).toContain("twoday");
		expect(ticker).toContain("unassigned");
	});

	it("summarizes ticker moments into actionable pressure and one recognition line per teammate", () => {
		const cases = [
			makeCase({
				id: "kasper-mixed",
				productName: "Addo Sign",
				title: "Signing follow-up",
				tags: ["signing"],
				status: "closed",
				actionableState: "resolved",
				assigneeName: "Kasper Christensen",
				cxScore: 6,
				resolvedAt: new Date("2026-03-31T09:00:00.000Z"),
				updatedAt: new Date("2026-03-31T09:00:00.000Z"),
			}),
			makeCase({
				id: "kasper-positive",
				productName: "Addo Sign",
				title: "Signing case moved forward",
				tags: ["signing"],
				status: "closed",
				actionableState: "resolved",
				assigneeName: "Kasper Christensen",
				cxScore: 8,
				resolvedAt: new Date("2026-03-31T10:00:00.000Z"),
				updatedAt: new Date("2026-03-31T10:00:00.000Z"),
			}),
			makeCase({
				id: "fin-five",
				productName: "Addo Sign",
				title: "Signing completed",
				tags: ["signing"],
				status: "closed",
				actionableState: "resolved",
				assigneeName: "Fin",
				cxScore: 10,
				resolvedAt: new Date("2026-03-31T11:00:00.000Z"),
				updatedAt: new Date("2026-03-31T11:00:00.000Z"),
			}),
			makeCase({
				id: "fin-four",
				productName: "Addo Sign",
				title: "Signing progress update",
				tags: ["signing"],
				status: "closed",
				actionableState: "resolved",
				assigneeName: "Fin",
				cxScore: 8,
				resolvedAt: new Date("2026-03-31T10:30:00.000Z"),
				updatedAt: new Date("2026-03-31T10:30:00.000Z"),
			}),
			makeCase({
				id: "ellinor-breached",
				productName: "Addo Sign",
				assigneeName: "Ellinor",
				actionableState: "breached",
				isBreached: true,
				hasAssignment: true,
			}),
			makeCase({
				id: "unassigned-a",
				productName: "Addo Sign",
				assigneeName: null,
				hasAssignment: false,
				actionableState: "unassigned",
			}),
			makeCase({
				id: "unassigned-b",
				productName: "Addo Sign",
				assigneeName: null,
				hasAssignment: false,
				actionableState: "unassigned",
			}),
			makeCase({
				id: "unassigned-c",
				productName: "Addo Sign",
				assigneeName: null,
				hasAssignment: false,
				actionableState: "unassigned",
			}),
		];

		const live = buildLiveWallboardData(
			cases,
			new Date("2026-03-31T11:57:00.000Z"),
			now,
		);

		expect(
			live.peopleMoments.some(
				(item) =>
					item.includes("Addo Sign") &&
					item.includes("over-SLA") &&
					item.includes("unassigned") &&
					item.includes("Ellinor"),
			),
		).toBe(true);
		expect(
			live.peopleMoments.some(
				(item) => item.includes("Kasper Christensen") && item.includes("4/5"),
			),
		).toBe(true);
		expect(
			live.peopleMoments.some(
				(item) =>
					item.includes("Fin") && item.includes("2 recent strong CX results"),
			),
		).toBe(true);
		expect(
			live.peopleMoments.filter((item) => item.includes("Fin")),
		).toHaveLength(1);
		expect(
			live.peopleMoments.some((item) => item.includes("Worth a quick review")),
		).toBe(false);
		expect(
			live.peopleMoments.some((item) => item.includes("Strong AI CX read")),
		).toBe(false);
	});

	it("keeps exception lanes out of headline SLA health", () => {
		const cases = [
			makeCase({
				id: "headline-1",
				teamName: "Core Support",
				productName: "Core Support",
				serviceBucket: "headline",
				actionableState: "awaiting-team",
			}),
			makeCase({
				id: "exception-1",
				teamName: "General",
				productName: "Pension Broker",
				serviceBucket: "exception",
				servicePolicyName: "Separate workflow",
				actionableState: "breached",
				isBreached: true,
			}),
			makeCase({
				id: "unknown-1",
				teamName: "General",
				productName: "Unmapped",
				serviceBucket: "unknown",
				servicePolicyName: "Unmapped",
				actionableState: "awaiting-team",
			}),
		];

		const live = buildLiveWallboardData(
			cases,
			new Date("2026-03-31T11:57:00.000Z"),
			now,
		);

		expect(live.snapshot.activeCaseCount).toBe(1);
		expect(live.snapshot.currentActiveCaseCount).toBe(3);
		expect(live.snapshot.breachedCount).toBe(0);
		expect(live.snapshot.currentBreachedCount).toBe(1);
		expect(live.snapshot.exceptionCaseCount).toBe(1);
		expect(live.snapshot.exceptionBreachedCount).toBe(1);
		expect(live.snapshot.unknownCaseCount).toBe(1);
		expect(live.queues).toHaveLength(1);
		expect(live.exceptionQueues[0]?.teamName).toBe("Pension Broker");
		expect(live.mappedQueues).toHaveLength(2);
		expect(live.actionItems[0]?.label).toContain("Reply to");
	});

	it("keeps Aftaleportalen and Pension Broker as separate exception queues", () => {
		const live = buildLiveWallboardData(
			[
				makeCase({
					id: "aftaleportalen-1",
					teamName: "General",
					productName: "Aftaleportalen",
					serviceBucket: "exception",
					servicePolicyName: "Separate workflow",
					actionableState: "awaiting-team",
				}),
				makeCase({
					id: "pension-broker-1",
					teamName: "General",
					productName: "Pension Broker",
					serviceBucket: "exception",
					servicePolicyName: "Separate workflow",
					actionableState: "awaiting-team",
				}),
			],
			new Date("2026-03-31T11:57:00.000Z"),
			now,
		);

		expect(live.exceptionQueues.map((queue) => queue.teamName)).toEqual([
			"Aftaleportalen",
			"Pension Broker",
		]);
	});

	it("counts breached cases as unassigned when they have no person or team assignment", () => {
		const live = buildLiveWallboardData(
			[
				makeCase({
					id: "breached-unassigned",
					hasAssignment: false,
					assigneeName: null,
					actionableState: "breached",
					isBreached: true,
				}),
			],
			new Date("2026-03-31T11:57:00.000Z"),
			now,
		);

		expect(live.snapshot.breachedCount).toBe(1);
		expect(live.snapshot.unassignedCount).toBe(1);
		expect(live.snapshot.currentUnassignedCount).toBe(1);
		expect(live.queues[0]?.unassignedCount).toBe(1);
	});

	it("surfaces hints for unknown work when no monitored products are mapped", () => {
		const cases = [
			makeCase({
				id: "unknown-a",
				teamName: "General",
				tags: ["addo sign", "bankid"],
				productName: "Unmapped",
				serviceBucket: "unknown",
				servicePolicyName: "Unmapped",
				actionableState: "awaiting-team",
			}),
			makeCase({
				id: "unknown-b",
				teamName: "General",
				tags: ["addo sign"],
				productName: "Unmapped",
				serviceBucket: "unknown",
				servicePolicyName: "Unmapped",
				actionableState: "awaiting-team",
			}),
		];

		const live = buildLiveWallboardData(
			cases,
			new Date("2026-03-31T11:57:00.000Z"),
			now,
		);

		expect(live.queues).toHaveLength(0);
		expect(live.unknownSignals[0]).toMatchObject({
			label: "addo sign",
			count: 2,
			kind: "tag",
		});
	});

	it("keeps period product health tied to work from the selected period", () => {
		const cases = [
			makeCase({
				id: "resolved-this-week",
				productName: "Addo Sign",
				servicePolicyName: "Standard workflow",
				status: "closed",
				createdAt: new Date("2026-03-30T08:00:00.000Z"),
				updatedAt: new Date("2026-03-31T09:00:00.000Z"),
				resolvedAt: new Date("2026-03-31T09:00:00.000Z"),
				rawSlaStatus: "hit",
				cxScore: 9,
				actionableState: "resolved",
			}),
			makeCase({
				id: "old-open-case",
				productName: "Addo Sign",
				servicePolicyName: "Standard workflow",
				createdAt: new Date("2026-01-01T08:00:00.000Z"),
				updatedAt: new Date("2026-03-31T10:00:00.000Z"),
				actionableState: "awaiting-team",
				isBreached: true,
				rawSlaStatus: "missed",
			}),
		];

		const trends = buildTrendsWallboardData(
			cases,
			new Date("2026-03-31T11:57:00.000Z"),
			now,
			currentWeek,
		);

		expect(trends.periodSummary.openNowCount).toBe(1);
		expect(trends.periodSummary.breachedNowCount).toBe(1);
		expect(trends.productHealth[0]).toMatchObject({
			productName: "Addo Sign",
			openNowCount: 1,
			breachedNowCount: 1,
			slaAdherencePercent: 100,
			cxScore: 9,
			satisfactionScorePercent: 100,
		});
	});

	it("uses period breached/tracked counts for SLA summary", () => {
		const cases = [
			makeCase({
				id: "period-breached",
				productName: "Addo Sign",
				serviceBucket: "headline",
				servicePolicyName: "Standard workflow",
				createdAt: new Date("2026-03-30T08:00:00.000Z"),
				updatedAt: new Date("2026-03-31T10:00:00.000Z"),
				status: "open",
				actionableState: "breached",
				isBreached: true,
				rawSlaStatus: "missed",
			}),
			makeCase({
				id: "period-hit",
				productName: "Addo Sign",
				serviceBucket: "headline",
				servicePolicyName: "Standard workflow",
				createdAt: new Date("2026-03-31T08:00:00.000Z"),
				updatedAt: new Date("2026-03-31T11:00:00.000Z"),
				status: "closed",
				actionableState: "resolved",
				rawSlaStatus: "hit",
				resolvedAt: new Date("2026-03-31T11:00:00.000Z"),
			}),
		];

		const trends = buildTrendsWallboardData(
			cases,
			new Date("2026-03-31T11:57:00.000Z"),
			now,
			currentWeek,
		);

		expect(trends.periodSummary.slaTrackedCount).toBe(2);
		expect(trends.periodSummary.slaMissedCount).toBe(1);
		expect(trends.periodSummary.slaAdherencePercent).toBe(50);
	});

	it("counts open overdue work as missed in period SLA even when raw status says hit", () => {
		const cases = [
			makeCase({
				id: "period-open-overdue",
				productName: "Addo Sign",
				serviceBucket: "headline",
				servicePolicyName: "Standard workflow",
				createdAt: new Date("2026-03-31T08:00:00.000Z"),
				updatedAt: new Date("2026-03-31T11:00:00.000Z"),
				status: "open",
				actionableState: "breached",
				isBreached: true,
				rawSlaStatus: "hit",
				nextDueAt: new Date("2026-03-31T10:30:00.000Z"),
			}),
		];

		const trends = buildTrendsWallboardData(
			cases,
			new Date("2026-03-31T11:57:00.000Z"),
			now,
			currentWeek,
		);

		expect(trends.periodSummary.slaTrackedCount).toBe(1);
		expect(trends.periodSummary.slaMissedCount).toBe(1);
		expect(trends.periodSummary.slaAdherencePercent).toBe(0);
		expect(trends.productHealth[0]?.slaAdherencePercent).toBe(0);
	});

	it("builds selected-period CX from all eligible cases, not only mapped product rows", () => {
		const cases = [
			makeCase({
				id: "unknown-rated",
				productName: "Unmapped",
				serviceBucket: "unknown",
				servicePolicyName: "Unmapped",
				status: "closed",
				createdAt: new Date("2026-03-30T08:00:00.000Z"),
				updatedAt: new Date("2026-03-31T09:00:00.000Z"),
				resolvedAt: new Date("2026-03-31T09:00:00.000Z"),
				cxScore: 8,
				rawSlaStatus: "hit",
				actionableState: "resolved",
			}),
			makeCase({
				id: "mapped-unrated",
				productName: "Addo Sign",
				serviceBucket: "headline",
				servicePolicyName: "Standard workflow",
				status: "closed",
				createdAt: new Date("2026-03-30T08:00:00.000Z"),
				updatedAt: new Date("2026-03-31T10:00:00.000Z"),
				resolvedAt: new Date("2026-03-31T10:00:00.000Z"),
				cxScore: null,
				rawSlaStatus: "hit",
				actionableState: "resolved",
			}),
		];

		const trends = buildTrendsWallboardData(
			cases,
			new Date("2026-03-31T11:57:00.000Z"),
			now,
			currentWeek,
		);

		expect(trends.productHealth).toHaveLength(1);
		expect(trends.periodSummary.cxScore).toBe(8);
		expect(trends.periodSummary.satisfactionScorePercent).toBe(100);
		expect(trends.periodSummary.responseRatePercent).toBe(50);
		expect(trends.periodSummary.positiveCount).toBe(1);
		expect(trends.periodSummary.ratingMix[4]).toBe(1);
	});

	it("excludes tickets from CX eligibility and response-rate denominator", () => {
		const cases = [
			makeCase({
				id: "conversation-rated",
				subtype: "conversation",
				status: "closed",
				actionableState: "resolved",
				createdAt: new Date("2026-03-30T08:00:00.000Z"),
				updatedAt: new Date("2026-03-31T09:00:00.000Z"),
				resolvedAt: new Date("2026-03-31T09:00:00.000Z"),
				cxScore: 8,
			}),
			makeCase({
				id: "ticket-resolved",
				subtype: "ticket",
				status: "closed",
				actionableState: "resolved",
				createdAt: new Date("2026-03-30T08:00:00.000Z"),
				updatedAt: new Date("2026-03-31T10:00:00.000Z"),
				resolvedAt: new Date("2026-03-31T10:00:00.000Z"),
				cxScore: null,
			}),
		];

		const trends = buildTrendsWallboardData(
			cases,
			new Date("2026-03-31T11:57:00.000Z"),
			now,
			currentWeek,
		);

		expect(trends.periodSummary.eligibleCount).toBe(1);
		expect(trends.periodSummary.ratedCount).toBe(1);
		expect(trends.periodSummary.responseRatePercent).toBe(100);
		expect(trends.periodSummary.cxScore).toBe(8);
		expect(trends.periodSummary.satisfactionScorePercent).toBe(100);
		expect(trends.productHealth[0]?.resolvedCount).toBe(2);
		expect(trends.productHealth[0]?.eligibleCount).toBe(1);
		expect(trends.productHealth[0]?.ratedCount).toBe(1);
	});

	it("builds daily CX series as average five-point score from rated resolved conversations", () => {
		const series = buildCxSeries(
			[
				makeCase({
					id: "day-1-positive",
					subtype: "conversation",
					status: "closed",
					actionableState: "resolved",
					resolvedAt: new Date("2026-03-30T09:00:00.000Z"),
					updatedAt: new Date("2026-03-30T09:00:00.000Z"),
					cxScore: 10,
				}),
				makeCase({
					id: "day-1-negative",
					subtype: "conversation",
					status: "closed",
					actionableState: "resolved",
					resolvedAt: new Date("2026-03-30T10:00:00.000Z"),
					updatedAt: new Date("2026-03-30T10:00:00.000Z"),
					cxScore: 4,
				}),
				makeCase({
					id: "day-2-positive",
					subtype: "conversation",
					status: "closed",
					actionableState: "resolved",
					resolvedAt: new Date("2026-03-31T09:00:00.000Z"),
					updatedAt: new Date("2026-03-31T09:00:00.000Z"),
					cxScore: 8,
				}),
			],
			new Date("2026-03-30T00:00:00.000Z"),
			new Date("2026-03-31T23:59:59.000Z"),
		);

		const values = series
			.map((point) => point.value)
			.filter((value): value is number => value !== null);

		expect(values).toContain(3.5);
		expect(values).toContain(4);
	});

	it("builds a 30-day volume and SLA series from cases opened each day", () => {
		const series = buildDailyVolumeSlaSeries(
			[
				makeCase({
					id: "mar-30-hit",
					createdAt: new Date("2026-03-30T08:00:00.000Z"),
					status: "closed",
					actionableState: "resolved",
					rawSlaStatus: "hit",
					updatedAt: new Date("2026-03-30T12:00:00.000Z"),
					resolvedAt: new Date("2026-03-30T12:00:00.000Z"),
				}),
				makeCase({
					id: "mar-30-missed",
					createdAt: new Date("2026-03-30T09:00:00.000Z"),
					actionableState: "breached",
					isBreached: true,
					nextDueAt: new Date("2026-03-30T10:00:00.000Z"),
				}),
				makeCase({
					id: "mar-31-no-sla",
					createdAt: new Date("2026-03-31T09:00:00.000Z"),
					hasSlaTracking: false,
				}),
			],
			now,
		);

		expect(series).toHaveLength(30);
		expect(series.find((point) => point.label === "30 Mar")).toMatchObject({
			volume: 2,
			slaTrackedCount: 2,
			slaMissedCount: 1,
			slaAdherencePercent: 50,
		});
		expect(series.find((point) => point.label === "31 Mar")).toMatchObject({
			volume: 1,
			slaTrackedCount: 0,
			slaMissedCount: 0,
			slaAdherencePercent: null,
		});
	});

	it("shows only five lookup IDs that are due within 60 minutes", () => {
		const lookupCases = buildLookupCases(
			[
				makeCase({
					externalId: "breached",
					nextDueAt: new Date("2026-03-31T09:00:00.000Z"),
					actionableState: "breached",
					isBreached: true,
					waitingSinceAt: new Date("2026-03-31T08:00:00.000Z"),
				}),
				makeCase({
					id: "due-50",
					externalId: "due-50",
					nextDueAt: new Date("2026-03-31T12:50:00.000Z"),
					actionableState: "due-soon",
					isDueSoon: true,
				}),
				makeCase({
					id: "due-20",
					externalId: "due-20",
					nextDueAt: new Date("2026-03-31T12:20:00.000Z"),
					actionableState: "due-soon",
					isDueSoon: true,
				}),
				makeCase({
					id: "due-10",
					externalId: "due-10",
					nextDueAt: new Date("2026-03-31T12:10:00.000Z"),
					actionableState: "due-soon",
					isDueSoon: true,
				}),
				makeCase({
					id: "due-40",
					externalId: "due-40",
					nextDueAt: new Date("2026-03-31T12:40:00.000Z"),
					actionableState: "due-soon",
					isDueSoon: true,
				}),
				makeCase({
					id: "due-5",
					externalId: "due-5",
					nextDueAt: new Date("2026-03-31T12:05:00.000Z"),
					actionableState: "due-soon",
					isDueSoon: true,
				}),
				makeCase({
					id: "due-55",
					externalId: "due-55",
					nextDueAt: new Date("2026-03-31T12:55:00.000Z"),
					actionableState: "due-soon",
					isDueSoon: true,
				}),
				makeCase({
					id: "waiting",
					externalId: "waiting",
					nextDueAt: new Date("2026-03-31T15:20:00.000Z"),
					actionableState: "awaiting-team",
				}),
			],
			now,
		);

		expect(lookupCases).toHaveLength(5);
		expect(lookupCases.map((item) => item.externalId)).toEqual([
			"due-5",
			"due-10",
			"due-20",
			"due-40",
			"due-50",
		]);
		expect(lookupCases[0]?.ageLabel).toBe("Due in 5m");
	});

	it("excludes non-due-soon cases from lookup attention IDs", () => {
		const lookupCases = buildLookupCases(
			[
				makeCase({
					id: "customer-wait",
					externalId: "customer-wait",
					actionableState: "awaiting-customer",
				}),
				makeCase({
					id: "team-wait",
					externalId: "team-wait",
					actionableState: "awaiting-team",
				}),
				makeCase({
					id: "breached",
					externalId: "breached",
					actionableState: "breached",
					isBreached: true,
				}),
				makeCase({
					id: "due-soon",
					externalId: "due-soon",
					actionableState: "due-soon",
					isDueSoon: true,
					nextDueAt: new Date("2026-03-31T12:30:00.000Z"),
				}),
			],
			now,
		);

		expect(lookupCases.map((item) => item.externalId)).toEqual(["due-soon"]);
	});

	it("includes contact names in lookup attention items when available", () => {
		const lookupCases = buildLookupCases(
			[
				makeCase({
					id: "contact-case",
					externalId: "contact-case",
					contactName: "Jane Customer",
					actionableState: "due-soon",
					isDueSoon: true,
					nextDueAt: new Date("2026-03-31T12:15:00.000Z"),
				}),
			],
			now,
		);

		expect(lookupCases[0]?.contactName).toBe("Jane Customer");
	});

	it("keeps a deeper live lookup pool so focused products retain their own IDs", () => {
		const addoCases = Array.from({ length: 6 }, (_, index) =>
			makeCase({
				id: `addo-${index}`,
				externalId: `addo-${index}`,
				productName: "Addo Sign",
				teamName: "Addo Sign",
				nextDueAt: new Date(`2026-03-31T12:0${index}:00.000Z`),
				actionableState: "due-soon",
				isDueSoon: true,
			}),
		);
		const pensionBrokerCase = makeCase({
			id: "pension-broker-focus",
			externalId: "pension-broker-focus",
			productName: "Pension Broker",
			teamName: "Pension Broker",
			nextDueAt: new Date("2026-03-31T12:45:00.000Z"),
			actionableState: "due-soon",
			isDueSoon: true,
		});

		const live = buildLiveWallboardData(
			[...addoCases, pensionBrokerCase],
			new Date("2026-03-31T11:57:00.000Z"),
			now,
		);

		expect(live.lookupCases.length).toBeGreaterThan(5);
		expect(
			live.lookupCases.some(
				(item) => item.externalId === "pension-broker-focus",
			),
		).toBe(true);
	});
});
