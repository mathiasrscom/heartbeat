import { describe, expect, it } from "vitest";
import type { SupportCaseRecord } from "./support-health/types";
import { buildCustomerAttentionSummary } from "./wallboard-attention";

const now = new Date("2026-07-20T10:00:00.000Z");

function supportCase(
	overrides: Partial<SupportCaseRecord> = {},
): SupportCaseRecord {
	return {
		id: "case-1",
		externalId: "123",
		source: "intercom",
		subtype: "conversation",
		status: "open",
		priority: "normal",
		title: "Export fails",
		description: "The export is not working and blocks our payroll run.",
		tags: ["exports"],
		teamName: "Support",
		productName: "Payroll",
		serviceBucket: "headline",
		servicePolicyName: "Default",
		contactName: "Acme",
		assigneeExternalId: "admin-1",
		assigneeName: "Maria",
		assigneeAvatarUrl: null,
		hasAssignment: true,
		customerTier: "pro",
		createdAt: new Date("2026-07-19T08:00:00.000Z"),
		updatedAt: new Date("2026-07-20T09:00:00.000Z"),
		resolvedAt: null,
		waitingSinceAt: new Date("2026-07-20T08:00:00.000Z"),
		nextDueAt: new Date("2026-07-20T11:00:00.000Z"),
		rawSlaStatus: "active",
		hasSlaTracking: true,
		cxScore: null,
		cxComment: null,
		ratedTeammateExternalId: null,
		responseTimeMinutes: 20,
		resolutionTimeHours: null,
		reopenCount: 0,
		actionableState: "awaiting-team",
		isBreached: false,
		isDueSoon: false,
		isHighRisk: false,
		isDeveloperTicket: false,
		isTicketReview: false,
		isAssignedToDeveloperTeam: false,
		...overrides,
	};
}

describe("buildCustomerAttentionSummary", () => {
	it("turns customer impact language into an actionable support signal", () => {
		const result = buildCustomerAttentionSummary([supportCase()], now);

		expect(result.customerSignals).toHaveLength(1);
		expect(result.customerSignals[0]).toMatchObject({
			kind: "customer",
			owner: "support",
			headline: "Acme appears blocked",
			conversationExternalIds: ["123"],
		});
		expect(result.customerSignals[0]?.reasons).toContain(
			"customer may be blocked",
		);
	});

	it("groups repeated evidence into a cross-product signal", () => {
		const cases = [
			supportCase(),
			supportCase({
				id: "case-2",
				externalId: "456",
				productName: "Time",
				contactName: "Globex",
				description: "Exports are delayed.",
			}),
		];

		const result = buildCustomerAttentionSummary(cases, now);
		expect(result.productSignals).toHaveLength(1);
		expect(result.productSignals[0]).toMatchObject({
			kind: "product",
			owner: "shared",
			affectedCustomerCount: 2,
			productNames: ["Payroll", "Time"],
		});
		expect(result.productSignals[0]?.conversationExternalIds).toEqual([
			"123",
			"456",
		]);
	});

	it("does not invent recurring themes from a single tagged conversation", () => {
		const result = buildCustomerAttentionSummary([supportCase()], now);
		expect(result.productSignals).toEqual([]);
	});

	it("removes email addresses and links from monitor excerpts", () => {
		const result = buildCustomerAttentionSummary(
			[
				supportCase({
					description:
						"This is still not working. Contact jane@example.com or see https://example.com/private",
				}),
			],
			now,
		);

		expect(result.customerSignals[0]?.summary).toContain("[email]");
		expect(result.customerSignals[0]?.summary).toContain("[link]");
		expect(result.customerSignals[0]?.summary).not.toContain(
			"jane@example.com",
		);
	});
});
