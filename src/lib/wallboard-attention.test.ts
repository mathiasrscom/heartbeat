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
		expect(result.customerSignals[0]).toMatchObject({
			assigneeName: "Maria",
			assigneeAvatarUrl: null,
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

	it("shows ordinary waiting-on-support work without requiring a risk flag", () => {
		const result = buildCustomerAttentionSummary(
			[
				supportCase({
					title: "A simple question",
					description: "Could you confirm the account setting?",
					waitingSinceAt: now,
					nextDueAt: null,
					hasSlaTracking: false,
				}),
			],
			now,
		);

		expect(result.customerSignals).toHaveLength(1);
		expect(result.supportActionCount).toBe(1);
		expect(result.statusLabel).toBe("Support can act");
	});

	it("keeps enough ranked actions for tall wallboard layouts", () => {
		const cases = Array.from({ length: 7 }, (_, index) =>
			supportCase({
				id: `case-${index + 1}`,
				externalId: `${index + 1}`,
				contactName: `Customer ${index + 1}`,
			}),
		);

		const result = buildCustomerAttentionSummary(cases, now);

		expect(result.supportActionCount).toBe(7);
		expect(result.customerSignals).toHaveLength(6);
	});

	it("keeps externally blocked work out of support action cards", () => {
		const result = buildCustomerAttentionSummary(
			[
				supportCase({
					id: "customer-wait",
					externalId: "customer-wait",
					actionableState: "awaiting-customer",
					nextActionOwner: "customer",
				}),
				supportCase({
					id: "developer-wait",
					externalId: "developer-wait",
					nextActionOwner: "development",
					isAssignedToDeveloperTeam: true,
				}),
				supportCase({
					id: "other-wait",
					externalId: "other-wait",
					nextActionOwner: "other",
				}),
			],
			now,
		);

		expect(result.customerSignals).toEqual([]);
		expect(result.waitingElsewhere).toEqual({
			totalCount: 3,
			customerCount: 1,
			developmentCount: 1,
			otherCount: 1,
		});
	});

	it("does not use ordinary ticket age alone as a support action", () => {
		const result = buildCustomerAttentionSummary(
			[
				supportCase({
					subtype: "ticket",
					waitingSinceAt: new Date("2026-07-01T08:00:00.000Z"),
					description: "A long-running internal ticket",
				}),
			],
			now,
		);

		expect(result.customerSignals).toEqual([]);
		expect(result.waitingElsewhere.totalCount).toBe(1);
	});

	it("keeps developer tickets waiting on support actionable", () => {
		const result = buildCustomerAttentionSummary(
			[
				supportCase({
					subtype: "ticket",
					nextActionOwner: "support",
					isAssignedToDeveloperTeam: true,
					isTicketReview: true,
				}),
			],
			now,
		);

		expect(result.customerSignals).toHaveLength(1);
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

	it("does not present chat launcher choices as customer evidence", () => {
		const result = buildCustomerAttentionSummary(
			[
				supportCase({
					title: "Conversation",
					description: "❓ Stil et spørgsmål",
				}),
			],
			now,
		);

		expect(result.customerSignals[0]?.summary).toBe(
			"No additional customer message is available.",
		);
		expect(result.customerSignals[0]?.summary).not.toContain(
			"Stil et spørgsmål",
		);
	});

	it("removes all complete, escaped, and truncated HTML from monitor excerpts", () => {
		const complete = buildCustomerAttentionSummary(
			[
				supportCase({
					description:
						'<style>.hidden { display: none }</style><p>Please <strong>use this form</strong></p><a href="https://example.com/private">Open it</a><script>alert("hidden")</script>',
				}),
			],
			now,
		);
		expect(complete.customerSignals[0]?.summary).toBe(
			"Please use this form Open it",
		);
		expect(complete.customerSignals[0]?.summary).not.toMatch(
			/<|href=|display|alert/i,
		);

		const truncated = buildCustomerAttentionSummary(
			[
				supportCase({
					description:
						'&lt;img src="https://example.com/form.png" alt="Addo Sign - Bestillingsformular" style="border: 0;',
				}),
			],
			now,
		);
		expect(truncated.customerSignals[0]?.summary).toBe("Export fails");
		expect(truncated.customerSignals[0]?.summary).not.toMatch(/<|src=|style=/i);
	});
});
