export type WallboardLlmProvider = "ollama" | "codex" | null;
export type WallboardLlmSource = "deterministic" | "ollama" | "codex";

export interface TickerLlmConfig {
	provider: WallboardLlmProvider;
	enabled: boolean;
	model: string | null;
	baseUrl: string;
	/** Optional bearer token for authenticated Ollama-compatible endpoints. */
	authToken?: string | null;
}

export const DEFAULT_CODEX_MODEL = "gpt-5.3-codex";
export const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
