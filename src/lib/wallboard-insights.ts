import { eq } from "drizzle-orm";
import type { SupportCaseRecord } from "@/lib/support-health/types";
import {
	generateWallboardText,
	type TickerLlmConfig,
	type WallboardLlmSource,
} from "./wallboard-llm";
import { hashWallboardLlmInput } from "./wallboard-llm-cache";

const SETTINGS_KEY = "wallboard_product_insights";
const MAX_TEXT_LENGTH = 300;
const MAX_COMMENT_LENGTH = 180;
const MAX_LOW_RATING_COMMENTS_PER_PRODUCT = 8;
const MAX_POSITIVE_COMMENTS_PER_PRODUCT = 3;
const INSIGHTS_OUTPUT_SCHEMA = {
	type: "array",
	items: {
		type: "object",
		properties: {
			productName: { type: "string" },
			wentWell: { type: "string" },
			toImprove: { type: "string" },
		},
		required: ["productName", "wentWell", "toImprove"],
		additionalProperties: false,
	},
};

export interface ProductInsight {
	productName: string;
	wentWell: string;
	toImprove: string;
}

export interface WallboardProductInsights {
	generatedAt: string;
	source: WallboardLlmSource;
	model: string | null;
	inputHash?: string | null;
	products: ProductInsight[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampText(value: string) {
	return value.slice(0, MAX_TEXT_LENGTH);
}

export function redactPII(text: string): string {
	let out = text.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]");
	out = out.replace(/https?:\/\/\S+/gi, "[link]");
	return out.replace(/\s+/g, " ").trim();
}

interface FeedbackComment {
	score: number;
	comment: string;
}

export function pickFeedbackComments(
	cases: SupportCaseRecord[],
	options: { maxLength?: number; limit: number },
): FeedbackComment[] {
	const maxLength = options.maxLength ?? MAX_COMMENT_LENGTH;
	const seenComments = new Set<string>();
	const candidates: Array<{ score: number; comment: string; updatedAt: Date }> =
		[];

	for (const c of cases) {
		if (c.cxScore === null) continue;
		const raw = c.cxComment?.trim();
		if (!raw) continue;
		const redacted = redactPII(raw);
		if (!redacted) continue;
		const clamped =
			redacted.length > maxLength
				? `${redacted.slice(0, maxLength - 1)}…`
				: redacted;
		if (seenComments.has(clamped)) continue;
		seenComments.add(clamped);
		candidates.push({
			score: c.cxScore,
			comment: clamped,
			updatedAt: c.updatedAt,
		});
	}

	candidates.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
	return candidates
		.slice(0, options.limit)
		.map(({ score, comment }) => ({ score, comment }));
}

function toFivePointRating(score: number): number {
	const normalized = Math.round(score / 2);
	if (normalized <= 1) return 1;
	if (normalized >= 5) return 5;
	return normalized;
}

// ── Deterministic generation ────────────────────────────────────────

interface ProductCaseAnalysis {
	productName: string;
	productCases: SupportCaseRecord[];
	resolved: SupportCaseRecord[];
	actionable: SupportCaseRecord[];
	positiveByPerson: Map<string, number>;
	positiveCount: number;
	lowRatingCount: number;
	breachedCount: number;
	dueSoonCount: number;
	unassignedCount: number;
	awaitingTeamCount: number;
	reopenedCases: SupportCaseRecord[];
	longRunningCases: SupportCaseRecord[];
	slowResponseCases: SupportCaseRecord[];
	highRiskOpenCases: SupportCaseRecord[];
	lowRatingComments: FeedbackComment[];
	positiveComments: FeedbackComment[];
}

function analyzeProduct(
	cases: SupportCaseRecord[],
	productName: string,
): ProductCaseAnalysis {
	const productCases = cases.filter((c) => c.productName === productName);
	const resolved = productCases.filter(
		(c) => c.actionableState === "resolved" && c.subtype === "conversation",
	);
	const actionable = productCases.filter(
		(c) => c.actionableState !== "resolved",
	);
	const rated = resolved.filter(
		(c) => c.cxScore !== null && c.assigneeName?.trim(),
	);

	const positiveByPerson = new Map<string, number>();
	let positiveCount = 0;
	let lowRatingCount = 0;
	for (const c of rated) {
		const score = c.cxScore;
		if (score === null) continue;
		const rating = toFivePointRating(score);
		if (rating >= 4) {
			positiveCount++;
			const name = c.assigneeName?.trim();
			if (!name) continue;
			positiveByPerson.set(name, (positiveByPerson.get(name) ?? 0) + 1);
		} else if (rating <= 2) {
			lowRatingCount++;
		}
	}

	const lowRatedCases = rated.filter(
		(c) => c.cxScore !== null && toFivePointRating(c.cxScore) <= 2,
	);
	const positiveRatedCases = rated.filter(
		(c) => c.cxScore !== null && toFivePointRating(c.cxScore) >= 4,
	);

	return {
		productName,
		productCases,
		resolved,
		actionable,
		positiveByPerson,
		positiveCount,
		lowRatingCount,
		breachedCount: actionable.filter((c) => c.isBreached).length,
		dueSoonCount: actionable.filter((c) => c.isDueSoon).length,
		unassignedCount: actionable.filter((c) => !c.hasAssignment).length,
		awaitingTeamCount: actionable.filter(
			(c) => c.actionableState === "awaiting-team",
		).length,
		reopenedCases: productCases.filter((c) => c.reopenCount > 0),
		longRunningCases: actionable.filter(
			(c) => c.resolutionTimeHours !== null && c.resolutionTimeHours > 48,
		),
		slowResponseCases: actionable.filter(
			(c) => c.responseTimeMinutes !== null && c.responseTimeMinutes > 120,
		),
		highRiskOpenCases: actionable.filter((c) => c.isHighRisk),
		lowRatingComments: pickFeedbackComments(lowRatedCases, {
			limit: MAX_LOW_RATING_COMMENTS_PER_PRODUCT,
		}),
		positiveComments: pickFeedbackComments(positiveRatedCases, {
			limit: MAX_POSITIVE_COMMENTS_PER_PRODUCT,
		}),
	};
}

function buildWentWell(a: ProductCaseAnalysis): string {
	const parts: string[] = [];

	// Celebrate specific people
	if (a.positiveByPerson.size > 0) {
		const sorted = [...a.positiveByPerson.entries()].sort(
			(x, y) => y[1] - x[1],
		);
		const top = sorted.slice(0, 3);
		const shoutouts = top.map(([name, count]) =>
			count === 1 ? name : `${name} (${count})`,
		);
		parts.push(
			`Great CX from ${shoutouts.join(", ")} — customers are noticing the quality.`,
		);
	}

	// Fast response patterns
	const fastResponses = a.resolved.filter(
		(c) =>
			c.responseTimeMinutes !== null &&
			c.responseTimeMinutes < 30 &&
			c.assigneeName,
	);
	if (fastResponses.length >= 3) {
		const names = [
			...new Set(
				fastResponses.flatMap((c) => {
					const name = c.assigneeName?.trim();
					return name ? [name] : [];
				}),
			),
		].slice(0, 2);
		parts.push(
			`Quick first replies from ${names.join(" and ")} — keeping wait times low.`,
		);
	}

	// SLA discipline
	if (a.breachedCount === 0 && a.actionable.length > 5) {
		parts.push(
			"Zero SLA breaches with a full queue — solid ownership across the board.",
		);
	}

	// Clean queue
	if (a.unassignedCount === 0 && a.actionable.length > 0) {
		parts.push(
			"Every open case has an owner. Good discipline on taking ownership.",
		);
	}

	// Low reopen rate
	if (a.resolved.length > 5 && a.reopenedCases.length === 0) {
		parts.push(
			"No reopened cases — issues are being resolved thoroughly the first time.",
		);
	}

	if (parts.length === 0) {
		if (a.resolved.length > 0) {
			parts.push(
				"Cases are being resolved. Encourage customers to leave ratings so we can spot what's working.",
			);
		} else {
			parts.push(
				"Ask customers for feedback after resolution — ratings help us see what's working.",
			);
		}
	}

	return clampText(parts.slice(0, 2).join(" "));
}

function buildToImprove(a: ProductCaseAnalysis): string {
	const suggestions: string[] = [];

	// Ownership issues
	if (a.unassignedCount > 2) {
		suggestions.push(
			"Take ownership early — assign yourself to cases when you start working on them to avoid multiple advisors jumping on the same case.",
		);
	}

	// Reopened cases suggest incomplete resolutions
	if (a.reopenedCases.length >= 2) {
		suggestions.push(
			"Several cases were reopened after resolution. Double-check the customer's question is fully answered before closing, and confirm with the customer when possible.",
		);
	}

	// Slow responses
	if (a.slowResponseCases.length >= 2) {
		suggestions.push(
			"Some cases waited over 2 hours for a first reply. If you're stuck, leave a holding message so the customer knows you're on it.",
		);
	}

	// Long-running cases suggest escalation might help
	if (a.longRunningCases.length >= 2) {
		suggestions.push(
			"A few cases have been open for over 2 days. Consider calling the customer directly when a thread has too many back-and-forth messages — a quick call often resolves it faster.",
		);
	}

	// SLA pressure
	if (a.breachedCount > 0) {
		suggestions.push(
			"There are cases over SLA right now. Prioritize a reply on those before picking up new conversations — even a short update buys time.",
		);
	}

	// Low ratings without specific pattern
	if (a.lowRatingCount >= 3 && suggestions.length < 2) {
		suggestions.push(
			"We received some low CX ratings. Review the feedback comments together as a team — patterns often point to a process issue, not individual performance.",
		);
	}

	// High-risk cases open
	if (a.highRiskOpenCases.length >= 2 && suggestions.length < 2) {
		suggestions.push(
			"Multiple high-risk cases are open. Flag these in standup and consider pairing up on complex ones to move them forward.",
		);
	}

	// Waiting on support
	if (suggestions.length === 0 && a.awaitingTeamCount > 3) {
		suggestions.push(
			"Several customers are waiting on us. Try to batch similar cases together for efficiency, and set aside focused reply time.",
		);
	}

	if (suggestions.length === 0) {
		suggestions.push(
			"No major patterns to flag. Keep an eye on first-reply times and try to resolve cases in fewer messages where possible.",
		);
	}

	return clampText(suggestions.slice(0, 2).join(" "));
}

export function buildDeterministicInsights(
	cases: SupportCaseRecord[],
	productNames: string[],
): WallboardProductInsights {
	const analyses = productNames.map((name) => analyzeProduct(cases, name));

	return {
		generatedAt: new Date().toISOString(),
		source: "deterministic",
		model: null,
		products: analyses.map((a) => ({
			productName: a.productName,
			wentWell: buildWentWell(a),
			toImprove: buildToImprove(a),
		})),
	};
}

// ── Ollama rewrite ──────────────────────────────────────────────────

function buildOllamaPrompt(
	deterministic: WallboardProductInsights,
	cases: SupportCaseRecord[],
	productNames: string[],
) {
	const analyses = productNames.map((name) => analyzeProduct(cases, name));
	const productFacts = analyses.map((a) => {
		const topPositive = [...a.positiveByPerson.entries()]
			.sort((x, y) => y[1] - x[1])
			.slice(0, 3)
			.map(([name]) => name);
		const lines = [
			`Product: ${a.productName}`,
			`  Resolved: ${a.resolved.length}, Open: ${a.actionable.length}, Waiting on us: ${a.awaitingTeamCount}`,
			`  Positive ratings: ${a.positiveCount}${topPositive.length > 0 ? ` (${topPositive.join(", ")})` : ""}`,
			`  Low ratings: ${a.lowRatingCount}`,
			`  Over SLA: ${a.breachedCount}, Due soon: ${a.dueSoonCount}, Unassigned: ${a.unassignedCount}`,
			`  Reopened cases: ${a.reopenedCases.length}`,
			`  Cases open 2+ days: ${a.longRunningCases.length}`,
			`  Slow first reply (>2h): ${a.slowResponseCases.length}`,
			`  High-risk open: ${a.highRiskOpenCases.length}`,
		];
		if (a.lowRatingComments.length > 0) {
			lines.push("  Recent low-rating customer comments (verbatim):");
			for (const fc of a.lowRatingComments) {
				lines.push(`    - [${fc.score}/10] "${fc.comment}"`);
			}
		}
		if (a.positiveComments.length > 0) {
			lines.push("  Recent positive customer comments (verbatim):");
			for (const fc of a.positiveComments) {
				lines.push(`    - [${fc.score}/10] "${fc.comment}"`);
			}
		}
		return lines.join("\n");
	});

	return [
		"You are writing coaching insight cards for a support team wallboard on a TV in the office.",
		"For each product, write two short paragraphs (1-3 sentences each, max 280 chars each):",
		"",
		"1. wentWell: Celebrate wins warmly. Name specific people who delivered great CX when known. Reflect what customers themselves said in positive verbatim comments when present.",
		"",
		"2. toImprove: Drive the coaching from the verbatim low-rating customer comments when present. Identify 1–2 recurring behavioural patterns customers are actually describing, and recommend the concrete behaviour change that responds to it. Use the customer's framing when it sharpens the insight (e.g. 'customers say they have to repeat themselves — slow down and re-read the thread before replying').",
		"   Only fall back to generic process advice (assign early, holding reply, etc.) when there are no meaningful verbatim signals.",
		"   Never blame individuals — frame improvements as team-level behaviour changes.",
		"",
		"Rules:",
		"- Write ALL output in English. Verbatim comments may be in Danish, Swedish, Norwegian, German or other languages — translate and paraphrase into English in your output.",
		"- Office-safe: no customer names or company names. Emails and links have already been redacted.",
		"- Stay faithful to what customers actually said. Do not invent quotes or signals not in the input.",
		"- Be concise — TV wallboard, not a report.",
		"- Return a JSON array with keys: productName, wentWell, toImprove.",
		"- Return ONLY the JSON array, no markdown.",
		"",
		"Product data:",
		...productFacts,
		"",
		"Deterministic draft (improve on this, make it more human and grounded in customer voice):",
		JSON.stringify(deterministic.products, null, 2),
	].join("\n");
}

export function buildInsightsInputHash(
	deterministic: WallboardProductInsights,
	cases: SupportCaseRecord[],
	productNames: string[],
) {
	if (productNames.length === 0) return null;
	return hashWallboardLlmInput(
		buildOllamaPrompt(deterministic, cases, productNames),
	);
}

function extractJsonArrayFromText(text: string): unknown[] | null {
	const trimmed = text.trim();
	if (!trimmed) return null;

	try {
		const parsed = JSON.parse(trimmed);
		return Array.isArray(parsed) ? parsed : null;
	} catch {
		// fall through
	}

	const match = trimmed.match(/\[[\s\S]*\]/);
	if (!match) return null;

	try {
		const parsed = JSON.parse(match[0]);
		return Array.isArray(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function sanitizeOllamaInsights(
	raw: unknown[],
	validProducts: Set<string>,
): ProductInsight[] | null {
	const results: ProductInsight[] = [];

	for (const item of raw) {
		if (!isRecord(item)) continue;
		const productName =
			typeof item.productName === "string" ? item.productName.trim() : "";
		if (!validProducts.has(productName)) continue;
		const wentWell =
			typeof item.wentWell === "string"
				? clampText(item.wentWell.replace(/\s+/g, " ").trim())
				: "";
		const toImprove =
			typeof item.toImprove === "string"
				? clampText(item.toImprove.replace(/\s+/g, " ").trim())
				: "";
		if (!wentWell || !toImprove) continue;
		results.push({ productName, wentWell, toImprove });
	}

	return results.length > 0 ? results : null;
}

export async function rewriteInsightsWithLlm(
	deterministic: WallboardProductInsights,
	cases: SupportCaseRecord[],
	productNames: string[],
	config: TickerLlmConfig,
): Promise<WallboardProductInsights | null> {
	if (productNames.length === 0) return null;

	const prompt = buildOllamaPrompt(deterministic, cases, productNames);
	const result = await generateWallboardText({
		config,
		prompt,
		temperature: 0.4,
		outputSchema: INSIGHTS_OUTPUT_SCHEMA,
	});
	if (!result) return null;
	const content = result.content;
	const parsed = extractJsonArrayFromText(content);
	if (!parsed) return null;

	const validProducts = new Set(productNames);
	const products = sanitizeOllamaInsights(parsed, validProducts);
	if (!products) return null;

	return {
		generatedAt: new Date().toISOString(),
		source: result.provider,
		model: result.model,
		products,
	};
}

// ── DB persistence ──────────────────────────────────────────────────

export async function writeWallboardInsights(
	insights: WallboardProductInsights,
) {
	const [{ db }, { settings }] = await Promise.all([
		import("@/db"),
		import("@/db/schema"),
	]);

	const rows = await db
		.select()
		.from(settings)
		.where(eq(settings.key, SETTINGS_KEY))
		.limit(1);

	if (rows.length > 0) {
		await db
			.update(settings)
			.set({ value: insights, updatedAt: new Date() })
			.where(eq(settings.key, SETTINGS_KEY));
		return;
	}

	await db.insert(settings).values({
		key: SETTINGS_KEY,
		value: insights,
		updatedAt: new Date(),
	});
}

export async function readWallboardInsights(): Promise<WallboardProductInsights | null> {
	const [{ db }, { settings }] = await Promise.all([
		import("@/db"),
		import("@/db/schema"),
	]);

	const rows = await db
		.select()
		.from(settings)
		.where(eq(settings.key, SETTINGS_KEY))
		.limit(1);

	const value = rows[0]?.value;
	if (!isRecord(value)) return null;
	if (!Array.isArray(value.products)) return null;

	const products: ProductInsight[] = [];
	for (const item of value.products) {
		if (!isRecord(item)) continue;
		const productName =
			typeof item.productName === "string" ? item.productName.trim() : "";
		const wentWell =
			typeof item.wentWell === "string" ? item.wentWell.trim() : "";
		const toImprove =
			typeof item.toImprove === "string" ? item.toImprove.trim() : "";
		if (!productName || !wentWell || !toImprove) continue;
		products.push({ productName, wentWell, toImprove });
	}

	if (products.length === 0) return null;

	return {
		generatedAt:
			typeof value.generatedAt === "string"
				? value.generatedAt
				: new Date().toISOString(),
		source:
			value.source === "ollama" || value.source === "codex"
				? value.source
				: "deterministic",
		model: typeof value.model === "string" ? value.model : null,
		inputHash: typeof value.inputHash === "string" ? value.inputHash : null,
		products,
	};
}
