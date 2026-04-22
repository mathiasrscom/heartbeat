import { createHash } from "node:crypto";
import type {
	WallboardLlmProvider,
	WallboardLlmSource,
} from "./wallboard-llm-config";

export interface WallboardLlmCachedResult {
	source: WallboardLlmSource;
	model?: string | null;
	inputHash?: string | null;
}

export function hashWallboardLlmInput(value: string) {
	return createHash("sha1").update(value).digest("hex");
}

export function shouldReuseWallboardLlmResult(input: {
	provider: WallboardLlmProvider;
	enabled: boolean;
	model: string | null;
	inputHash: string | null;
	stored: WallboardLlmCachedResult | null | undefined;
}) {
	const requestedOllamaModel =
		input.provider === "ollama" ? input.model?.trim() ?? null : null;
	const storedOllamaModel =
		input.provider === "ollama" ? input.stored?.model?.trim() ?? null : null;

	return Boolean(
		input.enabled &&
			input.provider &&
			input.inputHash &&
			input.stored &&
			input.stored.source === input.provider &&
			input.stored.inputHash === input.inputHash &&
			(input.provider !== "ollama" ||
				storedOllamaModel === requestedOllamaModel),
	);
}
