import { eq } from "drizzle-orm";
import type {
	CaseLookupItem,
	LiveFocusLane,
	LiveWallboardData,
	LiveWallboardFocusPlan,
	QueueHealth,
	SupportHealthSnapshot,
} from "@/lib/support-health/types";
import { generateWallboardText, type TickerLlmConfig } from "./wallboard-llm";
import { hashWallboardLlmInput } from "./wallboard-llm-cache";

const WALLBOARD_LIVE_FOCUS_PLAN_KEY = "wallboard_live_focus_plan";
const MAX_TOP_CASE_IDS = 4;
const MAX_TEXT_LENGTH = 180;
const LANE_ORDER: LiveFocusLane[] = ["over-sla", "due-soon", "unassigned"];
const FOCUS_PLAN_OUTPUT_SCHEMA = {
	type: "object",
	properties: {
		focusProductName: {
			anyOf: [{ type: "string" }, { type: "null" }],
		},
		headline: { type: "string" },
		supportingText: { type: "string" },
		topCaseExternalIds: {
			type: "array",
			items: { type: "string" },
			maxItems: MAX_TOP_CASE_IDS,
		},
		laneOrder: {
			type: "array",
			items: {
				type: "string",
				enum: LANE_ORDER,
			},
			minItems: LANE_ORDER.length,
			maxItems: LANE_ORDER.length,
		},
	},
	required: [
		"focusProductName",
		"headline",
		"supportingText",
		"topCaseExternalIds",
		"laneOrder",
	],
	additionalProperties: false,
};

interface LiveFocusPlanPatch {
	focusProductName?: string | null;
	headline?: string;
	supportingText?: string;
	topCaseExternalIds?: string[];
	laneOrder?: LiveFocusLane[];
}

interface RewriteFocusPlanResult {
	plan: LiveWallboardFocusPlan;
	model: string;
}

interface FocusContext {
	availableProducts: Set<string>;
	validCaseExternalIds: Set<string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value: unknown) {
	if (typeof value !== "string") return null;
	const normalized = value.replace(/\s+/g, " ").trim();
	if (!normalized) return null;
	return normalized.slice(0, MAX_TEXT_LENGTH);
}

function normalizeTopCaseExternalIds(
	value: unknown,
	validCaseExternalIds: Set<string>,
) {
	if (!Array.isArray(value)) return null;
	const seen = new Set<string>();
	const ids: string[] = [];

	for (const item of value) {
		if (typeof item !== "string") continue;
		const normalized = item.trim();
		if (!normalized) continue;
		if (!validCaseExternalIds.has(normalized)) continue;
		if (seen.has(normalized)) continue;
		seen.add(normalized);
		ids.push(normalized);
		if (ids.length >= MAX_TOP_CASE_IDS) break;
	}

	return ids;
}

function normalizeLaneOrder(value: unknown): LiveFocusLane[] | null {
	if (!Array.isArray(value)) return null;
	const unique = new Set<LiveFocusLane>();

	for (const item of value) {
		if (item === "over-sla" || item === "due-soon" || item === "unassigned") {
			unique.add(item);
		}
	}

	if (unique.size !== LANE_ORDER.length) return null;
	return Array.from(unique);
}

function extractJsonObjectFromText(text: string) {
	const trimmed = text.trim();
	if (!trimmed) return null;

	try {
		const parsed = JSON.parse(trimmed);
		return isRecord(parsed) ? parsed : null;
	} catch {
		// fall through
	}

	const objectMatch = trimmed.match(/\{[\s\S]*\}/);
	if (!objectMatch) return null;

	try {
		const parsed = JSON.parse(objectMatch[0]);
		return isRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function buildFocusContext(live: {
	mappedQueues: QueueHealth[];
	lookupCases: CaseLookupItem[];
}) {
	const availableProducts = new Set(
		live.mappedQueues
			.map((queue) => queue.teamName)
			.filter((name) => typeof name === "string" && name.trim().length > 0),
	);
	const validCaseExternalIds = new Set(
		live.lookupCases
			.map((item) => item.externalId?.trim())
			.filter((value): value is string => Boolean(value)),
	);

	return {
		availableProducts,
		validCaseExternalIds,
	};
}

function sanitizePlanPatch(
	value: unknown,
	context: FocusContext,
): LiveFocusPlanPatch | null {
	if (!isRecord(value)) return null;

	const patch: LiveFocusPlanPatch = {};

	if (value.focusProductName === null) {
		patch.focusProductName = null;
	} else if (typeof value.focusProductName === "string") {
		const normalized = value.focusProductName.trim();
		patch.focusProductName =
			normalized.length > 0 && context.availableProducts.has(normalized)
				? normalized
				: null;
	}

	const headline = normalizeText(value.headline);
	if (headline) patch.headline = headline;

	const supportingText = normalizeText(value.supportingText);
	if (supportingText) patch.supportingText = supportingText;

	const topCaseExternalIds = normalizeTopCaseExternalIds(
		value.topCaseExternalIds,
		context.validCaseExternalIds,
	);
	if (topCaseExternalIds) patch.topCaseExternalIds = topCaseExternalIds;

	const laneOrder = normalizeLaneOrder(value.laneOrder);
	if (laneOrder) patch.laneOrder = laneOrder;

	return Object.keys(patch).length > 0 ? patch : null;
}

function scoreQueueRisk(queue: QueueHealth) {
	return (
		queue.breachedCount * 100 +
		queue.dueSoonCount * 30 +
		queue.unassignedCount * 20 +
		queue.awaitingTeamCount * 4
	);
}

function pickFocusQueue(live: {
	mappedQueues: QueueHealth[];
	snapshot: SupportHealthSnapshot;
}) {
	if (live.mappedQueues.length === 0) return null;
	return (
		[...live.mappedQueues]
			.sort((left, right) => scoreQueueRisk(right) - scoreQueueRisk(left))
			.at(0) ?? null
	);
}

function buildDeterministicHeadline(
	snapshot: SupportHealthSnapshot,
	focusQueue: QueueHealth | null,
) {
	if (snapshot.currentBreachedCount > 0) {
		return `${snapshot.currentBreachedCount} case${
			snapshot.currentBreachedCount === 1 ? "" : "s"
		} are over SLA. Start there now.`;
	}
	if (snapshot.currentDueSoonCount > 0) {
		return `${snapshot.currentDueSoonCount} case${
			snapshot.currentDueSoonCount === 1 ? "" : "s"
		} are due in 60 minutes. Prevent new breaches now.`;
	}
	if (snapshot.currentUnassignedCount > 0) {
		return `${snapshot.currentUnassignedCount} case${
			snapshot.currentUnassignedCount === 1 ? "" : "s"
		} are unassigned. Assign owners first.`;
	}
	if (focusQueue && focusQueue.awaitingTeamCount > 0) {
		return `${focusQueue.awaitingTeamCount} case${
			focusQueue.awaitingTeamCount === 1 ? "" : "s"
		} in ${focusQueue.teamName} are waiting on support.`;
	}
	return "No urgent lane pressure right now. Keep steady response pace.";
}

function buildDeterministicSupportingText(
	snapshot: SupportHealthSnapshot,
	focusQueue: QueueHealth | null,
) {
	if (focusQueue) {
		return `${focusQueue.teamName}: ${focusQueue.activeCaseCount} open • ${focusQueue.awaitingTeamCount} waiting • ${focusQueue.breachedCount} over SLA • ${focusQueue.unassignedCount} unassigned`;
	}

	return `${snapshot.currentActiveCaseCount} open • ${snapshot.currentAwaitingTeamCount} waiting on support • ${snapshot.currentAwaitingCustomerCount} waiting on customer`;
}

function buildLaneOrder(snapshot: SupportHealthSnapshot): LiveFocusLane[] {
	const laneCounts: Array<{ lane: LiveFocusLane; count: number }> = [
		{ lane: "over-sla", count: snapshot.currentBreachedCount },
		{ lane: "due-soon", count: snapshot.currentDueSoonCount },
		{ lane: "unassigned", count: snapshot.currentUnassignedCount },
	];

	return laneCounts
		.sort((left, right) => {
			if (right.count !== left.count) return right.count - left.count;
			return LANE_ORDER.indexOf(left.lane) - LANE_ORDER.indexOf(right.lane);
		})
		.map((item) => item.lane);
}

function rankLookupCases(lookupCases: CaseLookupItem[]) {
	return [...lookupCases].sort((left, right) => {
		const leftScore =
			(left.isBreached ? 100 : 0) +
			(left.isDueSoon ? 30 : 0) +
			(left.isHighRisk ? 10 : 0);
		const rightScore =
			(right.isBreached ? 100 : 0) +
			(right.isDueSoon ? 30 : 0) +
			(right.isHighRisk ? 10 : 0);
		if (rightScore !== leftScore) return rightScore - leftScore;
		return left.externalId.localeCompare(right.externalId);
	});
}

function pickTopCaseExternalIds(
	lookupCases: CaseLookupItem[],
	focusProductName: string | null,
) {
	const pool =
		focusProductName === null
			? lookupCases
			: lookupCases.filter((item) => item.productName === focusProductName);

	const ranked = rankLookupCases(pool.length > 0 ? pool : lookupCases);
	return ranked.slice(0, MAX_TOP_CASE_IDS).map((item) => item.externalId);
}

function buildOllamaPrompt(
	deterministicPlan: LiveWallboardFocusPlan,
	live: {
		snapshot: SupportHealthSnapshot;
		mappedQueues: QueueHealth[];
		lookupCases: CaseLookupItem[];
	},
) {
	const queueFacts = live.mappedQueues.slice(0, 6).map((queue, index) => {
		return `${index + 1}. ${queue.teamName}: open ${queue.activeCaseCount}, waiting ${queue.awaitingTeamCount}, overSLA ${queue.breachedCount}, dueSoon ${queue.dueSoonCount}, unassigned ${queue.unassignedCount}`;
	});

	const lookupFacts = live.lookupCases.slice(0, 8).map((item, index) => {
		return `${index + 1}. #${item.externalId} (${item.productName}) ${item.stateLabel} ${item.ageLabel}`;
	});

	return [
		"You are selecting what a support wallboard should emphasize right now.",
		"Return JSON object only, no markdown.",
		"Required keys: focusProductName, headline, supportingText, topCaseExternalIds, laneOrder",
		"Rules:",
		"- Write ALL output in English. Do not use any other language.",
		"- Keep facts true to provided data.",
		"- Office-safe: no customer names or company names.",
		"- focusProductName must be one of provided products or null.",
		"- topCaseExternalIds must come from provided lookup IDs.",
		'- laneOrder must contain exactly ["over-sla","due-soon","unassigned"] in chosen priority order.',
		"- headline max 140 chars.",
		"- supportingText max 180 chars.",
		"",
		"Current snapshot:",
		`openNow=${live.snapshot.currentActiveCaseCount}, waitingOnUs=${live.snapshot.currentAwaitingTeamCount}, overSLA=${live.snapshot.currentBreachedCount}, dueSoon=${live.snapshot.currentDueSoonCount}, unassigned=${live.snapshot.currentUnassignedCount}`,
		"",
		"Available products:",
		live.mappedQueues.map((queue) => queue.teamName).join(", ") || "none",
		"",
		"Queue facts:",
		...queueFacts,
		"",
		"Lookup IDs:",
		...lookupFacts,
		"",
		"Deterministic fallback plan:",
		JSON.stringify({
			focusProductName: deterministicPlan.focusProductName,
			headline: deterministicPlan.headline,
			supportingText: deterministicPlan.supportingText,
			topCaseExternalIds: deterministicPlan.topCaseExternalIds,
			laneOrder: deterministicPlan.laneOrder,
		}),
	].join("\n");
}

async function upsertFocusPlan(value: LiveWallboardFocusPlan) {
	const [{ db }, { settings }] = await Promise.all([
		import("@/db"),
		import("@/db/schema"),
	]);
	const rows = await db
		.select()
		.from(settings)
		.where(eq(settings.key, WALLBOARD_LIVE_FOCUS_PLAN_KEY))
		.limit(1);

	if (rows.length > 0) {
		await db
			.update(settings)
			.set({
				value,
				updatedAt: new Date(),
			})
			.where(eq(settings.key, WALLBOARD_LIVE_FOCUS_PLAN_KEY));
		return;
	}

	await db.insert(settings).values({
		key: WALLBOARD_LIVE_FOCUS_PLAN_KEY,
		value,
		updatedAt: new Date(),
	});
}

export function buildDeterministicLiveFocusPlan(
	live: Pick<LiveWallboardData, "snapshot" | "mappedQueues" | "lookupCases">,
): LiveWallboardFocusPlan {
	const focusQueue = pickFocusQueue(live);
	const focusProductName = focusQueue?.teamName ?? null;

	return {
		generatedAt: new Date().toISOString(),
		source: "deterministic",
		model: null,
		focusProductName,
		headline: buildDeterministicHeadline(live.snapshot, focusQueue),
		supportingText: buildDeterministicSupportingText(live.snapshot, focusQueue),
		topCaseExternalIds: pickTopCaseExternalIds(
			live.lookupCases,
			focusProductName,
		),
		laneOrder: buildLaneOrder(live.snapshot),
	};
}

export function buildLiveFocusPlanInputHash(
	deterministicPlan: LiveWallboardFocusPlan,
	live: Pick<LiveWallboardData, "snapshot" | "mappedQueues" | "lookupCases">,
) {
	if (live.mappedQueues.length === 0 && live.lookupCases.length === 0) {
		return null;
	}

	return hashWallboardLlmInput(buildOllamaPrompt(deterministicPlan, live));
}

export async function rewriteLiveFocusPlanWithLlm(
	deterministicPlan: LiveWallboardFocusPlan,
	live: Pick<LiveWallboardData, "snapshot" | "mappedQueues" | "lookupCases">,
	config: TickerLlmConfig,
): Promise<RewriteFocusPlanResult | null> {
	if (live.mappedQueues.length === 0 && live.lookupCases.length === 0)
		return null;

	const prompt = buildOllamaPrompt(deterministicPlan, live);
	const result = await generateWallboardText({
		config,
		prompt,
		temperature: 0.2,
		outputSchema: FOCUS_PLAN_OUTPUT_SCHEMA,
	});
	if (!result) return null;
	const content = result.content;
	const parsed = extractJsonObjectFromText(content);
	if (!parsed) return null;

	const patch = sanitizePlanPatch(parsed, buildFocusContext(live));
	if (!patch) return null;

	const plan: LiveWallboardFocusPlan = {
		...deterministicPlan,
		focusProductName:
			patch.focusProductName === undefined
				? deterministicPlan.focusProductName
				: patch.focusProductName,
		headline: patch.headline ?? deterministicPlan.headline,
		supportingText: patch.supportingText ?? deterministicPlan.supportingText,
		topCaseExternalIds:
			patch.topCaseExternalIds ?? deterministicPlan.topCaseExternalIds,
		laneOrder: patch.laneOrder ?? deterministicPlan.laneOrder,
		generatedAt: new Date().toISOString(),
		source: result.provider,
		model: result.model,
	};

	return {
		plan,
		model: result.model,
	};
}

export async function writeLiveWallboardFocusPlan(
	plan: LiveWallboardFocusPlan,
) {
	await upsertFocusPlan(plan);
}

export async function readLiveWallboardFocusPlan(input?: {
	availableProducts?: string[];
	lookupCases?: CaseLookupItem[];
}) {
	const [{ db }, { settings }] = await Promise.all([
		import("@/db"),
		import("@/db/schema"),
	]);
	const rows = await db
		.select()
		.from(settings)
		.where(eq(settings.key, WALLBOARD_LIVE_FOCUS_PLAN_KEY))
		.limit(1);

	const value = rows[0]?.value;
	if (!isRecord(value)) return null;

	const availableProducts = new Set(input?.availableProducts ?? []);
	const validCaseExternalIds = new Set(
		(input?.lookupCases ?? []).map((item) => item.externalId).filter(Boolean),
	);
	const context: FocusContext = {
		availableProducts,
		validCaseExternalIds,
	};

	const patch = sanitizePlanPatch(value, context);
	if (!patch?.headline || !patch.supportingText || !patch.laneOrder) {
		return null;
	}

	const generatedAtRaw =
		typeof value.generatedAt === "string" ? new Date(value.generatedAt) : null;
	const generatedAt =
		generatedAtRaw && !Number.isNaN(generatedAtRaw.getTime())
			? generatedAtRaw.toISOString()
			: new Date().toISOString();

	return {
		generatedAt,
		source:
			value.source === "ollama" || value.source === "codex"
				? value.source
				: "deterministic",
		model: typeof value.model === "string" ? value.model : null,
		inputHash: typeof value.inputHash === "string" ? value.inputHash : null,
		focusProductName: patch.focusProductName ?? null,
		headline: patch.headline,
		supportingText: patch.supportingText,
		topCaseExternalIds: patch.topCaseExternalIds ?? [],
		laneOrder: patch.laneOrder,
	} satisfies LiveWallboardFocusPlan;
}
