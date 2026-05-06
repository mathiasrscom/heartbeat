import { describe, expect, it } from "vitest";
import { buildDeterministicLiveFocusPlan } from "./wallboard-focus-plan";
import type {
	QueueHealth,
	SupportHealthSnapshot,
} from "./support-health/types";

function snapshot(
	overrides: Partial<SupportHealthSnapshot> = {},
): SupportHealthSnapshot {
	return {
		status: "green",
		statusLabel: "Healthy",
		activeCaseCount: 25,
		currentActiveCaseCount: 25,
		slaAdherencePercent: 100,
		dueSoonCount: 0,
		currentDueSoonCount: 0,
		breachedCount: 0,
		currentBreachedCount: 0,
		unassignedCount: 0,
		currentUnassignedCount: 0,
		urgentHighRiskCount: 0,
		currentUrgentHighRiskCount: 0,
		awaitingTeamCount: 7,
		currentAwaitingTeamCount: 7,
		awaitingCustomerCount: 18,
		currentAwaitingCustomerCount: 18,
		exceptionCaseCount: 0,
		exceptionBreachedCount: 0,
		unknownCaseCount: 0,
		unknownBreachedCount: 0,
		oldestActionableAgeMinutes: null,
		oldestExceptionAgeMinutes: null,
		freshnessTimestamp: null,
		stale: false,
		...overrides,
	};
}

function queue(overrides: Partial<QueueHealth> = {}): QueueHealth {
	return {
		teamName: "Addo Sign",
		sourceQueues: ["General"],
		serviceBucket: "headline",
		servicePolicyName: "Default",
		activeCaseCount: 22,
		awaitingTeamCount: 7,
		dueSoonCount: 0,
		breachedCount: 0,
		unassignedCount: 0,
		urgentCount: 0,
		enterpriseCount: 0,
		oldestActionableAgeMinutes: null,
		priorityMix: {
			low: 0,
			normal: 7,
			high: 0,
			urgent: 0,
		},
		...overrides,
	};
}

describe("wallboard Nova focus plan", () => {
	it("turns calm waiting pressure into an operator message, not a metric recap", () => {
		const plan = buildDeterministicLiveFocusPlan({
			snapshot: snapshot(),
			mappedQueues: [queue()],
			lookupCases: [],
		});

		expect(plan.headline).toContain("I’d use this calm window");
		expect(plan.headline).toContain("Addo Sign");
		expect(plan.supportingText).toContain("Have one person sweep Addo Sign");
		expect(`${plan.headline} ${plan.supportingText}`).not.toMatch(
			/0 over SLA|No SLA|Queue is stable/i,
		);
	});

	it("prioritizes breached work with direct action language", () => {
		const plan = buildDeterministicLiveFocusPlan({
			snapshot: snapshot({
				status: "red",
				currentBreachedCount: 2,
				breachedCount: 2,
			}),
			mappedQueues: [queue({ breachedCount: 2 })],
			lookupCases: [],
		});

		expect(plan.headline).toContain("pause new work");
		expect(plan.supportingText).toContain("Work the breached lane");
	});
});
