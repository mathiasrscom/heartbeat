import { describe, expect, it } from "vitest";
import {
	buildCxSeries,
	buildLiveWallboardData,
	buildLookupCases,
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
	});

	it("builds daily CX series as satisfaction percent from rated resolved conversations", () => {
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

		expect(values).toContain(50);
		expect(values).toContain(100);
	});

	it("shows only five lookup IDs and ranks longest-overdue breaches first", () => {
		const lookupCases = buildLookupCases(
			[
				makeCase({
					externalId: "breach-long",
					nextDueAt: new Date("2026-03-31T09:00:00.000Z"),
					actionableState: "breached",
					isBreached: true,
					waitingSinceAt: new Date("2026-03-31T08:00:00.000Z"),
				}),
				makeCase({
					id: "2",
					externalId: "breach-short",
					nextDueAt: new Date("2026-03-31T11:00:00.000Z"),
					actionableState: "breached",
					isBreached: true,
					waitingSinceAt: new Date("2026-03-31T10:00:00.000Z"),
				}),
				makeCase({
					id: "3",
					externalId: "due-soon",
					nextDueAt: new Date("2026-03-31T12:20:00.000Z"),
					actionableState: "due-soon",
					isDueSoon: true,
				}),
				makeCase({
					id: "4",
					externalId: "waiting-one",
					nextDueAt: new Date("2026-03-31T15:00:00.000Z"),
					actionableState: "awaiting-team",
				}),
				makeCase({
					id: "5",
					externalId: "waiting-two",
					nextDueAt: new Date("2026-03-31T15:10:00.000Z"),
					actionableState: "awaiting-team",
				}),
				makeCase({
					id: "6",
					externalId: "waiting-three",
					nextDueAt: new Date("2026-03-31T15:20:00.000Z"),
					actionableState: "awaiting-team",
				}),
			],
			now,
		);

		expect(lookupCases).toHaveLength(5);
		expect(lookupCases[0]?.externalId).toBe("breach-long");
		expect(lookupCases[1]?.externalId).toBe("breach-short");
		expect(lookupCases[0]?.ageLabel).toBe("3h overdue");
		expect(lookupCases[2]?.ageLabel).toBe("Due in 20m");
	});
});
