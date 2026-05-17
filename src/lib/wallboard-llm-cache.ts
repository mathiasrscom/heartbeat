import { createHash } from "node:crypto";
import type {
	WallboardLlmProvider,
	WallboardLlmSource,
} from "./wallboard-llm-config";

export interface WallboardLlmCachedResult {
	source: WallboardLlmSource;
	model?: string | null;
	inputHash?: string | null;
	generatedAt?: string | null;
}

export function hashWallboardLlmInput(value: string) {
	return createHash("sha1").update(value).digest("hex");
}

function isWithinMinimumRefreshAge(input: {
	generatedAt: string | null | undefined;
	minRefreshAgeMs: number | null | undefined;
	now: Date;
}) {
	if (!input.minRefreshAgeMs || input.minRefreshAgeMs <= 0) return false;
	if (!input.generatedAt) return false;

	const generatedAtMs = Date.parse(input.generatedAt);
	if (!Number.isFinite(generatedAtMs)) return false;

	const ageMs = input.now.getTime() - generatedAtMs;
	return ageMs >= 0 && ageMs < input.minRefreshAgeMs;
}

export function shouldReuseWallboardLlmResult(input: {
	provider: WallboardLlmProvider;
	enabled: boolean;
	model: string | null;
	inputHash: string | null;
	stored: WallboardLlmCachedResult | null | undefined;
	minRefreshAgeMs?: number;
	now?: Date;
}) {
	const requestedOllamaModel =
		input.provider === "ollama" ? (input.model?.trim() ?? null) : null;
	const storedOllamaModel =
		input.provider === "ollama" ? (input.stored?.model?.trim() ?? null) : null;

	const canReuseProvider = Boolean(
		input.enabled &&
			input.provider &&
			input.inputHash &&
			input.stored &&
			input.stored.source === input.provider &&
			(input.provider !== "ollama" ||
				storedOllamaModel === requestedOllamaModel),
	);

	if (!canReuseProvider || !input.stored) return false;
	if (input.stored.inputHash === input.inputHash) return true;

	return isWithinMinimumRefreshAge({
		generatedAt: input.stored.generatedAt,
		minRefreshAgeMs: input.minRefreshAgeMs,
		now: input.now ?? new Date(),
	});
}
