import { describe, expect, it } from "vitest";
import { shouldReuseWallboardLlmResult } from "./wallboard-llm-cache";

describe("wallboard LLM cache reuse", () => {
	it("reuses matching Codex results when the prompt hash is unchanged", () => {
		expect(
			shouldReuseWallboardLlmResult({
				provider: "codex",
				enabled: true,
				model: null,
				inputHash: "abc123",
				stored: {
					source: "codex",
					model: "gpt-5.4",
					inputHash: "abc123",
				},
			}),
		).toBe(true);
	});

	it("does not reuse when the provider changes", () => {
		expect(
			shouldReuseWallboardLlmResult({
				provider: "codex",
				enabled: true,
				model: null,
				inputHash: "abc123",
				stored: {
					source: "ollama",
					model: "llama3.2",
					inputHash: "abc123",
				},
			}),
		).toBe(false);
	});

	it("does not reuse Ollama output when the configured model changes", () => {
		expect(
			shouldReuseWallboardLlmResult({
				provider: "ollama",
				enabled: true,
				model: "llama3.2",
				inputHash: "abc123",
				stored: {
					source: "ollama",
					model: "mistral",
					inputHash: "abc123",
				},
			}),
		).toBe(false);
	});
});
