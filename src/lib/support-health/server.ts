import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { extractIntercomCx } from "@/lib/intercom-cx";
import {
	getDefaultIntercomAppUrl,
	normalizeIntercomAppUrl,
} from "@/lib/intercom-links";
import { readLiveWallboardFocusPlan } from "@/lib/wallboard-focus-plan";
import { buildDeterministicInsights, readWallboardInsights } from "@/lib/wallboard-insights";
import { readWallboardTickerMessages } from "@/lib/wallboard-ticker-messages";
import {
	buildLiveWallboardData,
	buildTrendsWallboardData,
	buildWorkflowCounts,
	classifyActionableState,
	isCaseBreached,
	isCaseDueSoon,
} from "./logic";
import {
	normalizeSupportPeriodInput,
	resolveSupportPeriod,
	type SupportPeriodInput,
} from "./period";
import {
	classifySupportCase,
	getKnownSupportProducts,
	resolveSupportCaseProductViews,
} from "./policy";
import {
	readSupportTargetsFromSettings,
	resolveSelectedSupportTargets,
	resolveSupportTargets,
} from "./targets";
import type {
	LiveWallboardData,
	SupportCasePriority,
	SupportCaseRecord,
	SupportTier,
	TrendsWallboardData,
} from "./types";

export type SupportViewInput = SupportPeriodInput;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasMeaningfulValue(value: unknown): boolean {
	if (typeof value === "string") return value.trim().length > 0;
	if (typeof value === "number") return Number.isFinite(value);
	if (Array.isArray(value)) return value.some(hasMeaningfulValue);
	if (isRecord(value)) return Object.values(value).some(hasMeaningfulValue);
	return false;
}

function toDate(value: unknown): Date | null {
	if (value instanceof Date) return value;
	if (typeof value === "string") {
		const parsed = new Date(value);
		return Number.isNaN(parsed.getTime()) ? null : parsed;
	}
	if (typeof value === "number") {
		const ms = value > 1_000_000_000_000 ? value : value * 1000;
		const parsed = new Date(ms);
		return Number.isNaN(parsed.getTime()) ? null : parsed;
	}
	return null;
}

function getNestedValue(obj: unknown, path: string[]) {
	let current = obj;
	for (const key of path) {
		if (!isRecord(current)) return undefined;
		current = current[key];
	}
	return current;
}

function getFirstDate(raw: unknown, paths: string[][]) {
	for (const path of paths) {
		const parsed = toDate(getNestedValue(raw, path));
		if (parsed) return parsed;
	}
	return null;
}

function getFirstNumber(raw: unknown, paths: string[][]) {
	for (const path of paths) {
		const value = getNestedValue(raw, path);
		if (typeof value === "number" && Number.isFinite(value)) return value;
	}
	return 0;
}

function getFirstString(raw: unknown, paths: string[][]) {
	for (const path of paths) {
		const value = getNestedValue(raw, path);
		if (typeof value === "string" && value.trim().length > 0) {
			return value.trim();
		}
		if (
			isRecord(value) &&
			typeof value.name === "string" &&
			value.name.trim()
		) {
			return value.name.trim();
		}
	}
	return null;
}

function getFirstTimestamp(raw: unknown, paths: string[][]) {
	for (const path of paths) {
		const value = getNestedValue(raw, path);
		if (typeof value === "number" && Number.isFinite(value)) return value;
		if (typeof value === "string" && value.trim().length > 0) {
			const parsed = Number(value);
			if (Number.isFinite(parsed)) return parsed;
		}
	}
	return null;
}

function getTicketType(raw: unknown) {
	return getFirstString(raw, [
		["ticket", "ticket_type"],
		["ticket_type", "name"],
		["ticket_type"],
	]);
}

function getTicketStateLabel(raw: unknown) {
	return getFirstString(raw, [
		["ticket", "ticket_custom_state_admin_label"],
		["ticket", "ticket_custom_state_user_label"],
		["ticket", "ticket_state", "internal_label"],
		["ticket", "ticket_state", "external_label"],
		["ticket_state", "internal_label"],
		["ticket_state", "external_label"],
		["ticket_state", "name"],
		["ticket", "state"],
		["state"],
	]);
}

export function resolveSupportCaseSubtype(
	type: string | null,
	raw: unknown,
): SupportCaseRecord["subtype"] | null {
	if (
		[
			getNestedValue(raw, ["ticket", "id"]),
			getNestedValue(raw, ["ticket", "ticket_id"]),
			getNestedValue(raw, ["ticket", "state"]),
			getNestedValue(raw, ["ticket", "ticket_type"]),
			getNestedValue(raw, ["ticket", "ticket_state"]),
			getNestedValue(raw, ["ticket", "ticket_custom_state_admin_label"]),
			getNestedValue(raw, ["ticket", "ticket_custom_state_user_label"]),
		].some(hasMeaningfulValue)
	) {
		return "ticket";
	}

	if (type === "ticket") return "ticket";
	if (type === "conversation") return "conversation";
	return null;
}

function isAssignedToDeveloperTeam(raw: unknown, ticketType: string | null) {
	const teamAssigneeName = getFirstString(raw, [
		["team_assignee", "name"],
		["team_assignee"],
		["team", "name"],
	]);

	if (teamAssigneeName?.toLowerCase().includes("developer")) {
		return true;
	}

	const teamAssigneeId = getNestedValue(raw, ["team_assignee_id"]);
	return (
		ticketType?.toLowerCase() === "developer" &&
		((typeof teamAssigneeId === "string" && teamAssigneeId.trim().length > 0) ||
			(typeof teamAssigneeId === "number" && Number.isFinite(teamAssigneeId)))
	);
}

function getTier(value: unknown): SupportTier {
	if (!isRecord(value)) return "unknown";
	const direct = value.tier;
	const plan = value.plan;

	const normalized =
		typeof direct === "string"
			? direct.toLowerCase()
			: typeof plan === "string"
				? plan.toLowerCase()
				: "unknown";

	if (
		normalized === "free" ||
		normalized === "starter" ||
		normalized === "pro" ||
		normalized === "enterprise"
	) {
		return normalized;
	}

	return "unknown";
}

function getPriority(value: unknown): SupportCasePriority {
	if (
		value === "low" ||
		value === "normal" ||
		value === "high" ||
		value === "urgent"
	) {
		return value;
	}
	if (value === "priority") return "high";
	return "normal";
}

function getSlaStatus(raw: unknown) {
	const candidates = [
		getNestedValue(raw, ["sla_applied", "sla_status"]),
		getNestedValue(raw, ["sla", "sla_status"]),
		getNestedValue(raw, ["sla_status"]),
	];

	for (const candidate of candidates) {
		if (typeof candidate === "string" && candidate.length > 0) {
			return candidate;
		}
	}

	return null;
}

function getQueueName(raw: unknown, teamName: string | null) {
	const candidate = [
		teamName,
		getNestedValue(raw, ["team", "name"]),
		getNestedValue(raw, ["ticket_type", "name"]),
		getNestedValue(raw, ["ticket_state", "name"]),
		getNestedValue(raw, ["inbox", "name"]),
	].find((value) => typeof value === "string" && value.trim().length > 0);

	return typeof candidate === "string" ? candidate : "General";
}

function getTeamAssignmentId(raw: unknown) {
	const candidates = [
		getNestedValue(raw, ["team_assignee_id"]),
		getNestedValue(raw, ["team", "id"]),
	];

	for (const candidate of candidates) {
		if (typeof candidate === "string" && candidate.trim().length > 0) {
			return candidate;
		}
		if (typeof candidate === "number" && Number.isFinite(candidate)) {
			return String(candidate);
		}
	}

	return null;
}

function getTags(raw: unknown, current: unknown) {
	if (
		Array.isArray(current) &&
		current.every((item) => typeof item === "string")
	) {
		return current;
	}

	const rawTags = getNestedValue(raw, ["tags", "tags"]);
	if (Array.isArray(rawTags)) {
		return rawTags
			.map((item) =>
				isRecord(item) && typeof item.name === "string" ? item.name : null,
			)
			.filter((item): item is string => item !== null);
	}

	return [];
}

function isAwaitingCustomer(raw: unknown) {
	const stateCandidates = [
		getNestedValue(raw, ["state"]),
		getNestedValue(raw, ["ticket_state", "state"]),
		getNestedValue(raw, ["ticket_state", "name"]),
		getNestedValue(raw, ["ticket_state", "internal_label"]),
		getNestedValue(raw, ["ticket_state", "external_label"]),
		getNestedValue(raw, ["ticket", "state"]),
		getNestedValue(raw, ["ticket", "ticket_custom_state_admin_label"]),
		getNestedValue(raw, ["ticket", "ticket_custom_state_user_label"]),
		getNestedValue(raw, ["ticket", "ticket_state", "category"]),
		getNestedValue(raw, ["ticket", "ticket_state", "internal_label"]),
		getNestedValue(raw, ["ticket", "ticket_state", "external_label"]),
	];

	if (
		stateCandidates.some(
			(value) =>
				typeof value === "string" &&
				(value.toLowerCase().includes("customer") ||
					value.toLowerCase().includes("waiting on developers")),
		)
	) {
		return true;
	}

	const lastAdminReplyAt = getFirstTimestamp(raw, [
		["statistics", "last_admin_reply_at"],
		["last_admin_reply_at"],
	]);
	const lastContactReplyAt = getFirstTimestamp(raw, [
		["statistics", "last_contact_reply_at"],
		["last_contact_reply_at"],
	]);

	if (
		lastAdminReplyAt !== null &&
		lastContactReplyAt !== null &&
		lastAdminReplyAt > lastContactReplyAt
	) {
		return true;
	}

	const snoozedUntil = toDate(getNestedValue(raw, ["snoozed_until"]));
	return snoozedUntil !== null && snoozedUntil.getTime() > Date.now();
}

function getExplicitSlaDueAt(raw: unknown) {
	return getFirstDate(raw, [
		["sla_applied", "first_response", "due_at"],
		["sla_applied", "next_response", "due_at"],
		["sla_due_at"],
		["sla", "due_at"],
		["sla_applied", "next_event_at"],
		["sla_applied", "due_at"],
		["statistics", "next_reply_at"],
	]);
}

function normalizeSupportCase(input: {
	id: string;
	externalId: string;
	source: string;
	type: string | null;
	status: string;
	priority: unknown;
	title: string | null;
	description: string | null;
	tags: unknown;
	createdAt: Date | null;
	updatedAt: Date | null;
	resolvedAt: Date | null;
	rawData: unknown;
	assigneeName: string | null;
	assigneeAvatarUrl: string | null;
	teamName: string | null;
	entityValue: unknown;
	cxScore: number | null;
	cxComment: string | null;
	responseTimeMinutes: number | null;
	resolutionTimeHours: number | null;
}): SupportCaseRecord | null {
	const subtype = resolveSupportCaseSubtype(input.type, input.rawData);
	if (subtype === null) return null;
	const createdAt = input.createdAt ?? input.updatedAt ?? new Date();
	const updatedAt = input.updatedAt ?? createdAt;

	const tier = getTier(input.entityValue);
	const priority = getPriority(input.priority);
	const waitingSinceAt =
		getFirstDate(input.rawData, [
			["waiting_since"],
			["statistics", "last_contact_reply_at"],
			["last_contact_reply_at"],
		]) ?? updatedAt;
	const rawSlaStatus = getSlaStatus(input.rawData);
	const nextDueAt = getExplicitSlaDueAt(input.rawData);
	const hasSlaTracking = rawSlaStatus !== null || nextDueAt !== null;
	const tags = getTags(input.rawData, input.tags);
	const ticketType = getTicketType(input.rawData);
	const ticketStateLabel = getTicketStateLabel(input.rawData);
	const isDeveloperTicket = ticketType?.toLowerCase() === "developer";
	const normalizedTicketState = ticketStateLabel?.toLowerCase() ?? null;
	const queueName = getQueueName(input.rawData, input.teamName);
	const teamAssignmentId = getTeamAssignmentId(input.rawData);
	const hasAssignment = Boolean(input.assigneeName || teamAssignmentId);
	const classification = classifySupportCase({
		title: input.title,
		description: input.description,
		tags,
		queueName,
		rawData: input.rawData,
	});
	const cxFromRaw = extractIntercomCx(input.rawData);
	const resolvedCxScore =
		input.cxScore ?? (subtype === "conversation" ? cxFromRaw.score : null);
	const resolvedCxComment =
		input.cxComment ?? (subtype === "conversation" ? cxFromRaw.comment : null);
	const actionableState = classifyActionableState({
		status: input.status,
		hasAssignment,
		rawSlaStatus,
		hasSlaTracking,
		nextDueAt,
		waitingSinceAt,
		priority,
		customerTier: tier,
		isAwaitingCustomer: isAwaitingCustomer(input.rawData),
		now: new Date(),
	});

	const draft = {
		status: input.status,
		hasAssignment,
		rawSlaStatus,
		hasSlaTracking,
		nextDueAt,
		waitingSinceAt,
		priority,
		customerTier: tier,
		isAwaitingCustomer: actionableState === "awaiting-customer",
		now: new Date(),
	};

	const isBreached = isCaseBreached(draft);
	const isDueSoon = isCaseDueSoon(draft);
	const isHighRisk =
		(isBreached || isDueSoon || actionableState === "unassigned") &&
		(priority === "urgent" || priority === "high" || tier === "enterprise");

	return {
		id: input.id,
		externalId: input.externalId,
		source: input.source,
		subtype,
		status: input.status,
		priority,
		title: input.title,
		description: input.description,
		tags,
		teamName: queueName,
		productName: classification.productName,
		serviceBucket: classification.serviceBucket,
		servicePolicyName: classification.servicePolicyName,
		productViewNames: resolveSupportCaseProductViews({
			productName: classification.productName,
			assigneeName: input.assigneeName,
			rawData: input.rawData,
		}),
		assigneeName: input.assigneeName,
		assigneeAvatarUrl: input.assigneeAvatarUrl,
		hasAssignment,
		customerTier: tier,
		createdAt,
		updatedAt,
		resolvedAt: input.resolvedAt,
		waitingSinceAt,
		nextDueAt,
		rawSlaStatus,
		hasSlaTracking,
		cxScore: resolvedCxScore,
		cxComment: resolvedCxComment,
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
		isDeveloperTicket,
		isTicketReview:
			isDeveloperTicket &&
			(normalizedTicketState === "submitted" ||
				normalizedTicketState === "waiting on support"),
		isAssignedToDeveloperTeam: isAssignedToDeveloperTeam(
			input.rawData,
			ticketType,
		),
	};
}

export async function loadSupportCases() {
	const now = new Date();

	try {
		const [{ db }, schema] = await Promise.all([
			import("@/db"),
			import("@/db/schema"),
		]);

		const { adapterConfigs, nodes, entities, teamMembers, syncState } = schema;

		const [rows, syncRows, configRows] = await Promise.all([
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
					assigneeAvatarUrl: teamMembers.avatarUrl,
					teamName: teamMembers.teamName,
					entityValue: entities.value,
				})
				.from(nodes)
				.leftJoin(entities, eq(nodes.entityId, entities.id))
				.leftJoin(teamMembers, eq(nodes.assigneeId, teamMembers.id))
				.where(eq(nodes.source, "intercom")),
			db
				.select()
				.from(syncState)
				.where(eq(syncState.adapterId, "intercom"))
				.limit(1),
			db
				.select()
				.from(adapterConfigs)
				.where(eq(adapterConfigs.adapterId, "intercom"))
				.limit(1),
		]);

		const cases = rows
			.map((row) => normalizeSupportCase(row))
			.filter((item): item is SupportCaseRecord => item !== null);

		const configRow = configRows[0] ?? null;
		const settings = isRecord(configRow?.settings) ? configRow.settings : {};
		const supportTargets = readSupportTargetsFromSettings(settings);

		return {
			now,
			lastSyncAt: syncRows[0]?.lastSyncAt ?? null,
			intercomAppUrl:
				normalizeIntercomAppUrl(settings.appUrl) ?? getDefaultIntercomAppUrl(),
			supportTargets,
			wallboardTheme:
				settings.wallboardTheme === "light"
					? ("light" as const)
					: ("dark" as const),
			wallboardProducts: Array.isArray(settings.wallboardProducts)
				? (settings.wallboardProducts as string[]).filter(
						(v) => typeof v === "string" && v.trim().length > 0,
					)
				: [],
			cases,
		};
	} catch (error) {
		console.error("Failed to load support wallboard data", error);
		return {
			now,
			lastSyncAt: null,
			intercomAppUrl: getDefaultIntercomAppUrl(),
			supportTargets: readSupportTargetsFromSettings(null),
			wallboardTheme: "dark" as const,
			wallboardProducts: [] as string[],
			cases: [] as SupportCaseRecord[],
		};
	}
}

function getAvailableProducts(cases: SupportCaseRecord[]) {
	const seen = new Set<string>();
	const products: string[] = [];

	for (const productName of getKnownSupportProducts()) {
		if (!seen.has(productName)) {
			seen.add(productName);
			products.push(productName);
		}
	}

	for (const item of cases) {
		if (item.serviceBucket === "unknown") continue;
		if (seen.has(item.productName)) continue;
		seen.add(item.productName);
		products.push(item.productName);
	}

	return products;
}

function filterSupportCasesByProduct(
	cases: SupportCaseRecord[],
	selectedProducts: string[],
	options?: {
		includeUnknownWhenAll?: boolean;
	},
) {
	const includeUnknownWhenAll = options?.includeUnknownWhenAll ?? true;
	if (selectedProducts.length === 0) {
		return includeUnknownWhenAll
			? cases
			: cases.filter((item) => item.serviceBucket !== "unknown");
	}

	const selected = new Set(selectedProducts);
	return cases.filter(
		(item) =>
			item.serviceBucket !== "unknown" &&
			(item.productViewNames ?? [item.productName]).some((productName) =>
				selected.has(productName),
			),
	);
}

export const getLiveWallboard = createServerFn({ method: "GET" })
	.handler(async (): Promise<LiveWallboardData> => {
		const [
			{ cases, lastSyncAt, now, intercomAppUrl, supportTargets, wallboardTheme, wallboardProducts },
			storedPeopleMoments,
			storedInsights,
		] = await Promise.all([
			loadSupportCases(),
			readWallboardTickerMessages(),
			readWallboardInsights(),
		]);
		const workflowCounts = buildWorkflowCounts(cases);
		const availableProducts = getAvailableProducts(cases);
		const selectedProducts = wallboardProducts.filter((product) =>
			availableProducts.includes(product),
		);
		const filteredCases = filterSupportCasesByProduct(cases, selectedProducts, {
			includeUnknownWhenAll: true,
		});
		const payload = buildLiveWallboardData(filteredCases, lastSyncAt, now);
		const focusPlan = await readLiveWallboardFocusPlan({
			availableProducts,
			lookupCases: payload.lookupCases,
		});

		return {
			...payload,
			workflowCounts,
			defaultTargets: supportTargets.defaultTargets,
			selectedTargets: resolveSelectedSupportTargets(
				supportTargets,
				selectedProducts,
			),
			productTargets: supportTargets.productTargets,
			focusPlan,
			peopleMoments:
				storedPeopleMoments.length > 0
					? storedPeopleMoments
					: payload.peopleMoments,
			intercomAppUrl,
			availableProducts,
			selectedProducts,
			wallboardTheme,
			insights:
				storedInsights?.products ??
				buildDeterministicInsights(cases, availableProducts).products,
		};
	});

export const getTrendsWallboard = createServerFn({ method: "GET" })
	.inputValidator((data: SupportViewInput | undefined) =>
		normalizeSupportPeriodInput(data),
	)
	.handler(async ({ data }): Promise<TrendsWallboardData> => {
		const [
			{ cases, lastSyncAt, now, intercomAppUrl, supportTargets, wallboardTheme, wallboardProducts },
			storedPeopleMoments,
			storedInsights,
		] = await Promise.all([
			loadSupportCases(),
			readWallboardTickerMessages(),
			readWallboardInsights(),
		]);
		const workflowCounts = buildWorkflowCounts(cases);
		const availableProducts = getAvailableProducts(cases);
		const selectedProducts = wallboardProducts.filter((product) =>
			availableProducts.includes(product),
		);
		const filteredCases = filterSupportCasesByProduct(cases, selectedProducts, {
			includeUnknownWhenAll: false,
		});
		const period = resolveSupportPeriod(data, now);
		const payload = buildTrendsWallboardData(
			filteredCases,
			lastSyncAt,
			now,
			period,
			(productName) => resolveSupportTargets(supportTargets, productName),
		);

		return {
			...payload,
			workflowCounts,
			defaultTargets: supportTargets.defaultTargets,
			selectedTargets: resolveSelectedSupportTargets(
				supportTargets,
				selectedProducts,
			),
			productTargets: supportTargets.productTargets,
			peopleMoments:
				storedPeopleMoments.length > 0
					? storedPeopleMoments
					: payload.peopleMoments,
			intercomAppUrl,
			availableProducts,
			selectedProducts,
			wallboardTheme,
			insights:
				storedInsights?.products ??
				buildDeterministicInsights(cases, availableProducts).products,
		};
	});
