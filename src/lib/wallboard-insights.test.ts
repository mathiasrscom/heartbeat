import { describe, expect, it } from "vitest";
import type { SupportCaseRecord } from "./support-health/types";
import { pickFeedbackComments, redactPII } from "./wallboard-insights";

function makeCase(
	overrides: Partial<SupportCaseRecord> = {},
): SupportCaseRecord {
	return {
		id: overrides.id ?? crypto.randomUUID(),
		externalId: overrides.externalId ?? "ext-1",
		source: "intercom",
		subtype: overrides.subtype ?? "conversation",
		status: overrides.status ?? "closed",
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
		createdAt: overrides.createdAt ?? new Date("2026-05-10T09:00:00.000Z"),
		updatedAt: overrides.updatedAt ?? new Date("2026-05-10T11:00:00.000Z"),
		resolvedAt: overrides.resolvedAt ?? new Date("2026-05-10T11:00:00.000Z"),
		waitingSinceAt: overrides.waitingSinceAt ?? null,
		nextDueAt: overrides.nextDueAt ?? null,
		rawSlaStatus: overrides.rawSlaStatus ?? "hit",
		hasSlaTracking: overrides.hasSlaTracking ?? true,
		cxScore: overrides.cxScore ?? null,
		cxComment: overrides.cxComment ?? null,
		ratedTeammateExternalId: overrides.ratedTeammateExternalId ?? null,
		responseTimeMinutes: overrides.responseTimeMinutes ?? 22,
		resolutionTimeHours: overrides.resolutionTimeHours ?? null,
		reopenCount: overrides.reopenCount ?? 0,
		actionableState: overrides.actionableState ?? "resolved",
		isBreached: overrides.isBreached ?? false,
		isDueSoon: overrides.isDueSoon ?? false,
		isHighRisk: overrides.isHighRisk ?? false,
		isDeveloperTicket: overrides.isDeveloperTicket ?? false,
		isTicketReview: overrides.isTicketReview ?? false,
		isAssignedToDeveloperTeam: overrides.isAssignedToDeveloperTeam ?? false,
	};
}

describe("redactPII", () => {
	it("replaces email addresses with [email]", () => {
		expect(redactPII("Contact me at user.name+tag@example.com please")).toBe(
			"Contact me at [email] please",
		);
	});

	it("replaces URLs with [link]", () => {
		expect(redactPII("see https://example.com/page?q=1 for details")).toBe(
			"see [link] for details",
		);
	});

	it("collapses runs of whitespace", () => {
		expect(redactPII("  too    many\nspaces  ")).toBe("too many spaces");
	});
});

describe("pickFeedbackComments", () => {
	it("ignores cases without a CX score or without a comment", () => {
		const cases = [
			makeCase({ cxScore: null, cxComment: "good but no score" }),
			makeCase({ cxScore: 8, cxComment: null }),
			makeCase({ cxScore: 8, cxComment: "   " }),
		];

		expect(pickFeedbackComments(cases, { limit: 5 })).toEqual([]);
	});

	it("sorts by updatedAt descending and clamps to the limit", () => {
		const cases = [
			makeCase({
				cxScore: 3,
				cxComment: "older comment",
				updatedAt: new Date("2026-05-01T00:00:00.000Z"),
			}),
			makeCase({
				cxScore: 2,
				cxComment: "newest comment",
				updatedAt: new Date("2026-05-12T00:00:00.000Z"),
			}),
			makeCase({
				cxScore: 4,
				cxComment: "middle comment",
				updatedAt: new Date("2026-05-08T00:00:00.000Z"),
			}),
		];

		const result = pickFeedbackComments(cases, { limit: 2 });
		expect(result.map((c) => c.comment)).toEqual([
			"newest comment",
			"middle comment",
		]);
	});

	it("redacts emails and links from the verbatim comment", () => {
		const cases = [
			makeCase({
				cxScore: 1,
				cxComment: "Reach me at foo@bar.com or https://example.com",
			}),
		];

		const result = pickFeedbackComments(cases, { limit: 5 });
		expect(result[0]?.comment).toBe("Reach me at [email] or [link]");
	});

	it("deduplicates identical redacted comments", () => {
		const cases = [
			makeCase({
				cxScore: 3,
				cxComment: "Same wording from two reporters",
				updatedAt: new Date("2026-05-10T00:00:00.000Z"),
			}),
			makeCase({
				cxScore: 4,
				cxComment: "Same wording from two reporters",
				updatedAt: new Date("2026-05-11T00:00:00.000Z"),
			}),
		];

		const result = pickFeedbackComments(cases, { limit: 5 });
		expect(result).toHaveLength(1);
	});

	it("clamps long comments with an ellipsis", () => {
		const longComment = "a".repeat(400);
		const cases = [makeCase({ cxScore: 2, cxComment: longComment })];

		const result = pickFeedbackComments(cases, { limit: 1, maxLength: 50 });
		expect(result[0]?.comment.length).toBe(50);
		expect(result[0]?.comment.endsWith("…")).toBe(true);
	});
});
