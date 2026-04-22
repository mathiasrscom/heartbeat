import { describe, expect, it } from "vitest";
import { filterSupportCasesByProduct } from "./server";
import type { SupportCaseRecord } from "./types";

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
		title: overrides.title ?? null,
		description: overrides.description ?? null,
		tags: overrides.tags ?? [],
		teamName: overrides.teamName ?? "Addo Sign",
		productName: overrides.productName ?? "Addo Sign",
		serviceBucket: overrides.serviceBucket ?? "headline",
		servicePolicyName: overrides.servicePolicyName ?? "Standard workflow",
		productViewNames: overrides.productViewNames ?? ["Addo Sign"],
		assigneeName: overrides.assigneeName ?? null,
		assigneeAvatarUrl: overrides.assigneeAvatarUrl ?? null,
		hasAssignment: overrides.hasAssignment ?? false,
		customerTier: overrides.customerTier ?? "pro",
		createdAt: overrides.createdAt ?? new Date("2026-04-22T10:00:00.000Z"),
		updatedAt: overrides.updatedAt ?? new Date("2026-04-22T10:00:00.000Z"),
		resolvedAt: overrides.resolvedAt ?? null,
		waitingSinceAt:
			overrides.waitingSinceAt ?? new Date("2026-04-22T10:00:00.000Z"),
		nextDueAt: overrides.nextDueAt ?? null,
		rawSlaStatus: overrides.rawSlaStatus ?? null,
		hasSlaTracking: overrides.hasSlaTracking ?? false,
		cxScore: overrides.cxScore ?? null,
		cxComment: overrides.cxComment ?? null,
		ratedTeammateExternalId: overrides.ratedTeammateExternalId ?? null,
		responseTimeMinutes: overrides.responseTimeMinutes ?? null,
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

describe("support product case filter", () => {
	it("excludes hidden product-view cases from selected products", () => {
		const cases = [
			makeCase({ id: "visible", externalId: "visible" }),
			makeCase({
				id: "hidden",
				externalId: "hidden",
				productViewNames: [],
			}),
		];

		expect(
			filterSupportCasesByProduct(cases, ["Addo Sign"], {
				includeUnknownWhenAll: false,
			}).map((item) => item.externalId),
		).toEqual(["visible"]);
	});

	it("excludes hidden product-view cases from all-products aggregates", () => {
		const cases = [
			makeCase({ id: "visible", externalId: "visible" }),
			makeCase({
				id: "hidden",
				externalId: "hidden",
				productViewNames: [],
			}),
			makeCase({
				id: "unknown",
				externalId: "unknown",
				productName: "Unmapped",
				serviceBucket: "unknown",
				productViewNames: [],
			}),
		];

		expect(
			filterSupportCasesByProduct(cases, [], {
				includeUnknownWhenAll: true,
			}).map((item) => item.externalId),
		).toEqual(["visible", "unknown"]);
	});
});
