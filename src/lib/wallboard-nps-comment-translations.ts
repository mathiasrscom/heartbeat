import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { NpsRecord } from "@/lib/support-health/types";
import {
	generateWallboardText,
	type TickerLlmConfig,
	type WallboardLlmSource,
} from "./wallboard-llm";
import { hashWallboardLlmInput } from "./wallboard-llm-cache";

const SETTINGS_KEY = "wallboard_nps_comment_translations";
const MAX_COMMENT_LENGTH = 220;
const MAX_TRANSLATION_LENGTH = 220;
const MAX_COMMENTS = 60;
const NPS_COMMENT_TRANSLATIONS_OUTPUT_SCHEMA = {
	type: "array",
	items: {
		type: "object",
		properties: {
			key: { type: "string" },
			englishComment: {
				anyOf: [{ type: "string" }, { type: "null" }],
			},
		},
		required: ["key", "englishComment"],
		additionalProperties: false,
	},
	maxItems: MAX_COMMENTS,
};

type JsonRecord = Record<string, unknown>;

export interface WallboardNpsCommentTranslations {
	generatedAt: string;
	source: WallboardLlmSource;
	model: string | null;
	inputHash?: string | null;
	translations: Record<string, string | null>;
}

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampText(value: string, max = MAX_TRANSLATION_LENGTH) {
	const trimmed = value.replace(/\s+/g, " ").trim();
	if (trimmed.length <= max) return trimmed;
	return `${trimmed.slice(0, max - 1).trim()}…`;
}

function anonymizeComment(text: string): string {
	let out = text.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]");
	out = out.replace(/https?:\/\/\S+/gi, "[link]");
	return out;
}

function getMeaningfulComment(value: unknown) {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (/^[-–—._\s]+$/.test(trimmed)) return null;
	return trimmed;
}

export function buildNpsCommentTranslationKey(input: {
	score: number;
	comment: string | null;
	ratedAt: Date | null;
}) {
	const comment = input.comment?.trim() ?? "";
	const ratedAt = input.ratedAt?.toISOString() ?? "";

	return createHash("sha1")
		.update(`${input.score}|${ratedAt}|${comment}`)
		.digest("hex");
}

function extractJsonArray(text: string): unknown[] | null {
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

function sanitizeTranslations(
	raw: unknown[],
	validKeys: Set<string>,
): Record<string, string | null> {
	const translations: Record<string, string | null> = {};

	for (const item of raw) {
		if (!isRecord(item)) continue;
		const key = typeof item.key === "string" ? item.key.trim() : "";
		if (!key || !validKeys.has(key)) continue;

		if (item.englishComment === null) {
			translations[key] = null;
			continue;
		}

		if (typeof item.englishComment !== "string") continue;
		const englishComment = clampText(
			item.englishComment,
			MAX_TRANSLATION_LENGTH,
		);
		translations[key] = englishComment.length > 0 ? englishComment : null;
	}

	return translations;
}

const ENGLISH_STOPWORDS =
	/\b(the|and|is|are|was|were|very|good|bad|thanks|thank|nice|great|fast|slow|help|helped|quick|easy|hard|nothing|yes)\b/i;

function isAsciiOnly(text: string): boolean {
	for (let i = 0; i < text.length; i++) {
		if (text.charCodeAt(i) > 127) return false;
	}
	return true;
}

export function isLikelyEnglish(text: string): boolean {
	if (!isAsciiOnly(text)) return false;
	return ENGLISH_STOPWORDS.test(text);
}

export interface KeyedComment {
	key: string;
	score: number;
	comment: string;
	ratedAtMs: number;
}

export function partitionCommentsForTranslation(input: {
	keyedComments: KeyedComment[];
	existingTranslations: Record<string, string | null>;
}): {
	toTranslate: KeyedComment[];
	locallyResolved: Record<string, string | null>;
} {
	const toTranslate: KeyedComment[] = [];
	const locallyResolved: Record<string, string | null> = {};

	for (const candidate of input.keyedComments) {
		if (candidate.key in input.existingTranslations) {
			continue;
		}
		if (isLikelyEnglish(candidate.comment)) {
			locallyResolved[candidate.key] = null;
			continue;
		}
		toTranslate.push(candidate);
	}

	return { toTranslate, locallyResolved };
}

function buildKeyedComments(records: NpsRecord[]): KeyedComment[] {
	return records
		.map((record) => {
			const comment = getMeaningfulComment(record.comment);
			if (!comment) return null;
			return {
				key: buildNpsCommentTranslationKey(record),
				score: record.score,
				comment,
				ratedAtMs: record.ratedAt?.getTime() ?? 0,
			};
		})
		.filter((record): record is KeyedComment => record !== null)
		.sort((left, right) => right.ratedAtMs - left.ratedAtMs)
		.filter((record, index, list) => {
			return (
				list.findIndex((candidate) => candidate.key === record.key) === index
			);
		})
		.slice(0, MAX_COMMENTS);
}

function buildNpsCommentTranslationsPrompt(keyedComments: KeyedComment[]) {
	if (keyedComments.length === 0) return null;

	return [
		"You are translating customer feedback comments for an internal trends wallboard.",
		"Return ONLY a JSON array with objects containing: key, englishComment.",
		"Rules:",
		"- If the original comment is already natural English, set englishComment to null.",
		"- If the comment is only punctuation, a dash, or has no meaning, set englishComment to null.",
		"- Otherwise translate the comment into natural English.",
		"- Keep the meaning faithful and concise.",
		"- Do not explain the translation.",
		"- englishComment max 220 chars.",
		"",
		"Comments:",
		...keyedComments.map(
			(record, index) =>
				`${index + 1}. key=${record.key} [${record.score}/10] "${anonymizeComment(record.comment).slice(0, MAX_COMMENT_LENGTH)}"`,
		),
	].join("\n");
}

export function buildNpsCommentTranslationsInputHash(records: NpsRecord[]) {
	const keyedComments = buildKeyedComments(records);
	const prompt = buildNpsCommentTranslationsPrompt(keyedComments);
	if (!prompt) return null;
	return hashWallboardLlmInput(prompt);
}

export async function rewriteNpsCommentTranslationsWithLlm(
	records: NpsRecord[],
	config: TickerLlmConfig,
): Promise<WallboardNpsCommentTranslations | null> {
	const keyedComments = buildKeyedComments(records);
	if (keyedComments.length === 0) return null;

	const stored = await readWallboardNpsCommentTranslations();
	const existingTranslations = stored?.translations ?? {};

	const { toTranslate, locallyResolved } = partitionCommentsForTranslation({
		keyedComments,
		existingTranslations,
	});

	if (toTranslate.length === 0 && Object.keys(locallyResolved).length === 0) {
		return null;
	}

	let codexTranslations: Record<string, string | null> = {};
	let source: WallboardLlmSource = stored?.source ?? "deterministic";
	let model: string | null = stored?.model ?? null;

	if (toTranslate.length > 0) {
		const prompt = buildNpsCommentTranslationsPrompt(toTranslate);
		if (prompt) {
			const result = await generateWallboardText({
				config,
				prompt,
				temperature: 0.1,
				outputSchema: NPS_COMMENT_TRANSLATIONS_OUTPUT_SCHEMA,
			});
			if (result) {
				const parsed = extractJsonArray(result.content);
				if (parsed) {
					codexTranslations = sanitizeTranslations(
						parsed,
						new Set(toTranslate.map((record) => record.key)),
					);
					source = result.provider;
					model = result.model;
				}
			}
		}
	}

	const newTranslations = { ...locallyResolved, ...codexTranslations };
	if (Object.keys(newTranslations).length === 0) return null;

	return {
		generatedAt: new Date().toISOString(),
		source,
		model,
		translations: newTranslations,
	};
}

export async function writeWallboardNpsCommentTranslations(
	value: WallboardNpsCommentTranslations,
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

	const existingValue = rows[0]?.value;
	const existingTranslations =
		isRecord(existingValue) && isRecord(existingValue.translations)
			? existingValue.translations
			: {};

	const translations = Object.fromEntries(
		Object.entries({
			...existingTranslations,
			...value.translations,
		}).filter(
			([key, translation]) =>
				key.trim().length > 0 &&
				(translation === null || typeof translation === "string"),
		),
	);

	const nextValue: WallboardNpsCommentTranslations = {
		...value,
		translations,
	};

	if (rows.length > 0) {
		await db
			.update(settings)
			.set({ value: nextValue, updatedAt: new Date() })
			.where(eq(settings.key, SETTINGS_KEY));
		return;
	}

	await db.insert(settings).values({
		key: SETTINGS_KEY,
		value: nextValue,
		updatedAt: new Date(),
	});
}

export async function readWallboardNpsCommentTranslations(): Promise<WallboardNpsCommentTranslations | null> {
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
	if (!isRecord(value) || !isRecord(value.translations)) return null;

	const translations = Object.fromEntries(
		Object.entries(value.translations)
			.map(([key, translation]) => {
				if (translation === null) return [key, null];
				if (typeof translation !== "string") return null;
				return [key, clampText(translation, MAX_TRANSLATION_LENGTH)] as const;
			})
			.filter(
				(entry): entry is readonly [string, string | null] => entry !== null,
			),
	);

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
		translations,
	};
}
