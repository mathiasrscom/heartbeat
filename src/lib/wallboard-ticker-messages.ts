import { eq } from "drizzle-orm";
import {
	generateWallboardText,
	type TickerLlmConfig,
	type WallboardLlmSource,
} from "./wallboard-llm";

const WALLBOARD_TICKER_MESSAGES_KEY = "wallboard_ticker_messages";
const MAX_TICKER_ITEMS = 10;
const TICKER_OUTPUT_SCHEMA = {
	type: "array",
	items: {
		type: "string",
	},
	minItems: 1,
	maxItems: MAX_TICKER_ITEMS,
};

interface StoredTickerMessages {
	items: string[];
	generatedAt: string;
	source: WallboardLlmSource;
	model: string | null;
}

interface TickerRewriteResult {
	items: string[];
	model: string;
	source: Exclude<WallboardLlmSource, "deterministic">;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeMessage(value: unknown) {
	if (typeof value !== "string") return null;
	const normalized = value.replace(/\s+/g, " ").trim();
	if (!normalized) return null;
	return normalized.slice(0, 180);
}

function normalizeMessageList(value: unknown) {
	if (!Array.isArray(value)) return [];
	const seen = new Set<string>();
	const items: string[] = [];

	for (const item of value) {
		const normalized = normalizeMessage(item);
		if (!normalized) continue;
		const key = normalized.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		items.push(normalized);
		if (items.length >= MAX_TICKER_ITEMS) break;
	}

	return items;
}

function extractJsonArrayFromText(text: string) {
	const trimmed = text.trim();
	if (!trimmed) return null;

	try {
		const parsed = JSON.parse(trimmed);
		return Array.isArray(parsed) ? parsed : null;
	} catch {
		// Continue to fallback parsing.
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

function parseOllamaMessages(text: string) {
	const fromJson = extractJsonArrayFromText(text);
	if (fromJson) return normalizeMessageList(fromJson);

	const lines = text
		.split(/\r?\n/)
		.map((line) => line.replace(/^[-\d.)\s]+/, ""))
		.map((line) => normalizeMessage(line))
		.filter((line): line is string => line !== null);

	return normalizeMessageList(lines);
}

async function upsertTickerMessages(value: StoredTickerMessages) {
	const [{ db }, { settings }] = await Promise.all([
		import("@/db"),
		import("@/db/schema"),
	]);
	const rows = await db
		.select()
		.from(settings)
		.where(eq(settings.key, WALLBOARD_TICKER_MESSAGES_KEY))
		.limit(1);

	if (rows.length > 0) {
		await db
			.update(settings)
			.set({
				value,
				updatedAt: new Date(),
			})
			.where(eq(settings.key, WALLBOARD_TICKER_MESSAGES_KEY));
		return;
	}

	await db.insert(settings).values({
		key: WALLBOARD_TICKER_MESSAGES_KEY,
		value,
		updatedAt: new Date(),
	});
}

export async function readWallboardTickerMessages() {
	const [{ db }, { settings }] = await Promise.all([
		import("@/db"),
		import("@/db/schema"),
	]);
	const rows = await db
		.select()
		.from(settings)
		.where(eq(settings.key, WALLBOARD_TICKER_MESSAGES_KEY))
		.limit(1);

	const value = rows[0]?.value;
	if (!isRecord(value)) return [];
	return normalizeMessageList(value.items);
}

export async function writeWallboardTickerMessages(input: {
	items: string[];
	source: WallboardLlmSource;
	model: string | null;
}) {
	const items = normalizeMessageList(input.items);
	if (items.length === 0) return;

	await upsertTickerMessages({
		items,
		generatedAt: new Date().toISOString(),
		source: input.source,
		model: input.model,
	});
}

export async function rewriteTickerMessagesWithLlm(
	seedItems: string[],
	config: TickerLlmConfig,
) {
	const facts = normalizeMessageList(seedItems);
	if (facts.length === 0) return null;

	const prompt = [
		"Write short TV-news ticker messages for a support wallboard.",
		"Rules:",
		"- Write ALL messages in English. Do not use any other language.",
		"- Keep facts exactly true to input.",
		"- Keep it office-safe. No customer or company names.",
		"- Mention teammates and products when provided.",
		"- Use energetic but professional tone.",
		"- Return only JSON array of strings.",
		"",
		"Facts:",
		...facts.map((item, index) => `${index + 1}. ${item}`),
	].join("\n");

	const result = await generateWallboardText({
		config,
		prompt,
		temperature: 0.35,
		outputSchema: TICKER_OUTPUT_SCHEMA,
	});
	if (!result) return null;
	const items = parseOllamaMessages(result.content);

	if (items.length === 0) return null;

	const rewriteResult: TickerRewriteResult = {
		items,
		model: result.model,
		source: result.provider,
	};
	return rewriteResult;
}
