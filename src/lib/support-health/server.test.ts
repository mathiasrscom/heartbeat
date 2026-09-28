import { describe, expect, it } from "vitest";
import {
	buildTrackedTeammateAssignments,
	resolveSupportCaseSubtype,
	resolveSupportNextActionOwner,
} from "./server";
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
		assigneeExternalId: overrides.assigneeExternalId ?? null,
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

describe("support health server normalization", () => {
	it("resolves explicit Intercom next-action ownership", () => {
		expect(
			resolveSupportNextActionOwner({
				ticket: { ticket_custom_state_admin_label: "Waiting on customer" },
			}),
		).toBe("customer");
		expect(
			resolveSupportNextActionOwner({
				ticket: { ticket_custom_state_admin_label: "Waiting on developers" },
			}),
		).toBe("development");
		expect(
			resolveSupportNextActionOwner({
				ticket: { ticket_custom_state_admin_label: "Waiting on others" },
			}),
		).toBe("other");
		expect(
			resolveSupportNextActionOwner({
				ticket: { state: "waiting_on_colleagues" },
			}),
		).toBe("other");
		expect(
			resolveSupportNextActionOwner({ state: "waiting_on_customer" }),
		).toBe("customer");
		expect(
			resolveSupportNextActionOwner({
				ticket: { ticket_custom_state_admin_label: "Waiting for support" },
			}),
		).toBe("support");
	});

	it("treats conversation rows with embedded ticket payloads as tickets", () => {
		expect(
			resolveSupportCaseSubtype("conversation", {
				ticket: {
					id: "215560948759660",
					state: "open",
				},
			}),
		).toBe("ticket");
	});

	it("keeps plain conversations as conversations", () => {
		expect(
			resolveSupportCaseSubtype("conversation", {
				source: {
					id: "115180450",
				},
				ticket: {},
			}),
		).toBe("conversation");
	});

	it("keeps explicit tickets as tickets", () => {
		expect(resolveSupportCaseSubtype("ticket", {})).toBe("ticket");
	});

	it("builds tracked teammate active-case counts from scoped actionable work", () => {
		const rows = buildTrackedTeammateAssignments(
			[
				makeCase({
					id: "a",
					externalId: "a",
					assigneeExternalId: "kasper",
					assigneeName: "Kasper Christensen",
					actionableState: "awaiting-team",
				}),
				makeCase({
					id: "b",
					externalId: "b",
					assigneeExternalId: "kasper",
					assigneeName: "Kasper Christensen",
					actionableState: "resolved",
				}),
				makeCase({
					id: "waiting-development",
					externalId: "waiting-development",
					assigneeExternalId: "kasper",
					assigneeName: "Kasper Christensen",
					actionableState: "awaiting-customer",
					nextActionOwner: "development",
				}),
				makeCase({
					id: "waiting-colleague",
					externalId: "waiting-colleague",
					assigneeExternalId: "kasper",
					assigneeName: "Kasper Christensen",
					actionableState: "awaiting-customer",
					nextActionOwner: "other",
				}),
				makeCase({
					id: "c",
					externalId: "c",
					assigneeExternalId: "ellinor",
					assigneeName: "Ellinor",
					actionableState: "breached",
				}),
			],
			["kasper", "ellinor"],
			[
				{
					externalId: "kasper",
					name: "Kasper Christensen",
					avatarUrl: null,
					isAvailable: true,
				},
				{
					externalId: "ellinor",
					name: "Ellinor",
					avatarUrl: null,
					isAvailable: false,
				},
			],
		);

		expect(rows).toEqual([
			{
				externalId: "kasper",
				name: "Kasper Christensen",
				avatarUrl: null,
				isAvailable: true,
				activeCaseCount: 1,
			},
			{
				externalId: "ellinor",
				name: "Ellinor",
				avatarUrl: null,
				isAvailable: false,
				activeCaseCount: 1,
			},
		]);
	});
});
