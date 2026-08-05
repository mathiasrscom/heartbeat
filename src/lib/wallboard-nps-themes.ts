import { eq } from "drizzle-orm";
import type { ResolvedSupportPeriod } from "@/lib/support-health/period";
import type { NpsRecord, NpsTheme } from "@/lib/support-health/types";
import {
	generateWallboardText,
	type TickerLlmConfig,
	type WallboardLlmSource,
} from "./wallboard-llm";
import { hashWallboardLlmInput } from "./wallboard-llm-cache";

const SETTINGS_KEY = "wallboard_nps_themes";
const MAX_TEXT_LENGTH = 220;
const MAX_QUOTE_LENGTH = 120;
const MAX_THEMES = 5;
const NPS_THEMES_OUTPUT_SCHEMA = {
	type: "array",
	items: {
		type: "object",
		properties: {
			headline: { type: "string" },
			summary: { type: "string" },
			sentiment: {
				type: "string",
				enum: ["positive", "mixed", "negative"],
			},
			quote: {
				anyOf: [{ type: "string" }, { type: "null" }],
			},
			mentionCount: { type: "number" },
			sourceIndex: { type: "number" },
		},
		required: [
			"headline",
			"summary",
			"sentiment",
			"quote",
			"mentionCount",
			"sourceIndex",
		],
		additionalProperties: false,
	},
};

export interface WallboardNpsThemes {
	generatedAt: string;
	source: WallboardLlmSource;
	model: string | null;
	inputHash?: string | null;
	themes: NpsTheme[];
}

interface KeywordBucket {
	key: string;
	label: string;
	headline: string;
	keywords: RegExp;
}

const DEFAULT_BUCKETS: KeywordBucket[] = [
	{
		key: "support",
		label: "support",
		headline: "Support response",
		keywords: /\b(support|respons|reply|answer|helpful|quick|fast|slow)\b/i,
	},
	{
		key: "product",
		label: "product",
		headline: "Product experience",
		keywords: /\b(product|feature|tool|platform|software)\b/i,
	},
	{
		key: "pricing",
		label: "pricing",
		headline: "Pricing & value",
		keywords: /\b(pric|cost|expensive|cheap|value|worth|pay)\b/i,
	},
	{
		key: "onboarding",
		label: "onboarding",
		headline: "Onboarding experience",
		keywords: /\b(onboard|setup|setup|start|begin|getting started|new)\b/i,
	},
	{
		key: "documentation",
		label: "documentation",
		headline: "Documentation & guides",
		keywords:
			/\b(doc|docs|documentation|guide|tutorial|manual|instructions)\b/i,
	},
	{
		key: "performance",
		label: "performance",
		headline: "Performance & reliability",
		keywords:
			/\b(performance|speed|slow|fast|reliable|crash|bug|error|broken)\b/i,
	},
];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampText(value: string, max = MAX_TEXT_LENGTH) {
	const trimmed = value.replace(/\s+/g, " ").trim();
	if (trimmed.length <= max) return trimmed;
	return `${trimmed.slice(0, max - 1).trim()}…`;
}

function anonymizeComment(text: string): string {
	// Strip email addresses
	let out = text.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]");
	// Strip URLs
	out = out.replace(/https?:\/\/\S+/gi, "[link]");
	return out;
}

function scoreSentiment(score: number): "positive" | "mixed" | "negative" {
	if (score >= 9) return "positive";
	if (score >= 7) return "mixed";
	return "negative";
}

export function buildDeterministicNpsThemes(
	records: NpsRecord[],
	period?: ResolvedSupportPeriod,
): WallboardNpsThemes {
	const eligible = records.filter((r) => {
		if (!r.comment || r.comment.trim().length === 0) return false;
		if (!period) return true;
		if (!r.ratedAt) return true;
		return r.ratedAt >= period.from && r.ratedAt <= period.to;
	});

	const bucketed = new Map<
		string,
		{
			config: KeywordBucket;
			records: NpsRecord[];
		}
	>();

	for (const record of eligible) {
		const comment = record.comment;
		if (!comment) continue;
		for (const bucket of DEFAULT_BUCKETS) {
			if (!bucket.keywords.test(comment)) continue;
			const entry = bucketed.get(bucket.key) ?? {
				config: bucket,
				records: [],
			};
			entry.records.push(record);
			bucketed.set(bucket.key, entry);
		}
	}

	const themes: NpsTheme[] = [...bucketed.values()]
		.sort((a, b) => b.records.length - a.records.length)
		.slice(0, MAX_THEMES)
		.map((entry) => {
			const sample = entry.records.sort((a, b) => b.score - a.score)[0];
			const avgScore =
				entry.records.reduce((sum, r) => sum + r.score, 0) /
				entry.records.length;
			const sentiment = scoreSentiment(avgScore);
			const sentenceSummary = `${entry.records.length} customer${
				entry.records.length === 1 ? "" : "s"
			} mentioned ${entry.config.label} — average NPS ${Math.round(avgScore)}.`;
			return {
				headline: entry.config.headline,
				summary: clampText(sentenceSummary),
				sentiment,
				quote: sample?.comment
					? clampText(anonymizeComment(sample.comment), MAX_QUOTE_LENGTH)
					: null,
				mentionCount: entry.records.length,
				sourceEntityExternalId: sample?.entityExternalId ?? null,
				sourceName: sample?.name ?? null,
			};
		});

	return {
		generatedAt: new Date().toISOString(),
		source: "deterministic",
		model: null,
		themes,
	};
}

function buildNpsThemesPrompt(
	deterministic: WallboardNpsThemes,
	records: NpsRecord[],
) {
	const eligibleComments = records
		.filter((r) => r.comment && r.comment.trim().length > 0)
		.sort((a, b) => {
			const aTime = a.ratedAt?.getTime() ?? 0;
			const bTime = b.ratedAt?.getTime() ?? 0;
			return bTime - aTime;
		})
		.slice(0, 40);

	if (eligibleComments.length === 0) return null;

	const commentLines = eligibleComments.flatMap((r, idx) => {
		const comment = r.comment;
		if (!comment) return [];
		return [
			`${idx + 1}. [${r.score}/10] "${anonymizeComment(comment).slice(0, 200)}"`,
		];
	});

	return [
		"You are summarising NPS customer feedback for a support team wallboard displayed on a TV.",
		"Read the NPS comments below and produce 3–5 themes.",
		"",
		"IMPORTANT: Write ALL output (headline, summary, and quote) in English.",
		"The NPS comments may be in Danish, Swedish, Norwegian, German, or other languages.",
		"Translate them to English for the headline and summary. For the quote, provide",
		"an English translation (keep it natural — do not include the original text).",
		"",
		"For each theme, produce an object with:",
		'- headline: short English phrase (max 60 chars), e.g. "Fast support responses"',
		"- summary: one English sentence (max 200 chars) describing what customers are saying",
		'- sentiment: one of "positive", "mixed", "negative"',
		"- quote: an English translation of one representative comment, max 120 chars",
		"- mentionCount: number of comments that mentioned this theme",
		"- sourceIndex: the numbered source comment used for quote",
		"",
		"Rules:",
		"- Office-safe: no customer names or company names (emails and URLs are already stripped).",
		"- Stay faithful to what customers actually said. Do not invent details.",
		"- Include both positive and negative themes when present.",
		"- Return ONLY a JSON array of theme objects, no markdown or commentary.",
		"- All text MUST be in English.",
		"",
		"Recent NPS comments (score / text):",
		...commentLines,
		"",
		"Deterministic draft (improve on this):",
		JSON.stringify(deterministic.themes, null, 2),
	].join("\n");
}

export function buildNpsThemesInputHash(
	deterministic: WallboardNpsThemes,
	records: NpsRecord[],
) {
	const prompt = buildNpsThemesPrompt(deterministic, records);
	if (!prompt) return null;
	return hashWallboardLlmInput(prompt);
}

function extractJsonArray(text: string): unknown[] | null {
	const trimmed = text.trim();
	if (!trimmed) return null;
	try {
		const parsed = JSON.parse(trimmed);
		return Array.isArray(parsed) ? parsed : null;
	} catch {
		/* fall through */
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

function sanitizeThemes(
	raw: unknown[],
	records: NpsRecord[] = [],
): NpsTheme[] | null {
	const sourceRecords = records
		.filter((record) => record.comment?.trim())
		.sort(
			(left, right) =>
				(right.ratedAt?.getTime() ?? 0) - (left.ratedAt?.getTime() ?? 0),
		)
		.slice(0, 40);
	const results: NpsTheme[] = [];
	for (const item of raw) {
		if (!isRecord(item)) continue;
		const headline =
			typeof item.headline === "string" ? clampText(item.headline, 80) : "";
		const summary =
			typeof item.summary === "string" ? clampText(item.summary) : "";
		if (!headline || !summary) continue;
		const sentimentRaw =
			typeof item.sentiment === "string" ? item.sentiment.toLowerCase() : "";
		const sentiment: NpsTheme["sentiment"] =
			sentimentRaw === "positive"
				? "positive"
				: sentimentRaw === "negative"
					? "negative"
					: "mixed";
		const quote =
			typeof item.quote === "string" && item.quote.trim().length > 0
				? clampText(anonymizeComment(item.quote), MAX_QUOTE_LENGTH)
				: null;
		const mentionCountRaw = item.mentionCount;
		const mentionCount =
			typeof mentionCountRaw === "number" && Number.isFinite(mentionCountRaw)
				? Math.max(0, Math.round(mentionCountRaw))
				: 0;
		const sourceIndex =
			typeof item.sourceIndex === "number" && Number.isFinite(item.sourceIndex)
				? Math.max(1, Math.round(item.sourceIndex))
				: null;
		const sourceRecord = sourceIndex ? sourceRecords[sourceIndex - 1] : null;
		const sourceEntityExternalId =
			sourceRecord?.entityExternalId ??
			(typeof item.sourceEntityExternalId === "string"
				? item.sourceEntityExternalId
				: null);
		const sourceName =
			sourceRecord?.name ??
			(typeof item.sourceName === "string" ? item.sourceName : null);
		results.push({
			headline,
			summary,
			sentiment,
			quote,
			mentionCount,
			sourceEntityExternalId,
			sourceName,
		});
		if (results.length >= MAX_THEMES) break;
	}
	return results.length > 0 ? results : null;
}

export async function rewriteNpsThemesWithLlm(
	deterministic: WallboardNpsThemes,
	records: NpsRecord[],
	config: TickerLlmConfig,
): Promise<WallboardNpsThemes | null> {
	const prompt = buildNpsThemesPrompt(deterministic, records);
	if (!prompt) return null;

	const result = await generateWallboardText({
		config,
		prompt,
		temperature: 0.35,
		outputSchema: NPS_THEMES_OUTPUT_SCHEMA,
	});
	if (!result) return null;
	const content = result.content;
	const parsed = extractJsonArray(content);
	if (!parsed) return null;

	const themes = sanitizeThemes(parsed, records);
	if (!themes) return null;

	return {
		generatedAt: new Date().toISOString(),
		source: result.provider,
		model: result.model,
		themes,
	};
}

export async function writeWallboardNpsThemes(value: WallboardNpsThemes) {
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
			.set({ value, updatedAt: new Date() })
			.where(eq(settings.key, SETTINGS_KEY));
		return;
	}

	await db.insert(settings).values({
		key: SETTINGS_KEY,
		value,
		updatedAt: new Date(),
	});
}

export async function readWallboardNpsThemes(): Promise<WallboardNpsThemes | null> {
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
	if (!Array.isArray(value.themes)) return null;

	const themes = sanitizeThemes(value.themes);
	if (!themes) return null;

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
		themes,
	};
}
