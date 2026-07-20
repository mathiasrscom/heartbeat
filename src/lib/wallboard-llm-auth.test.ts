import { afterEach, describe, expect, it, vi } from "vitest";
import { generateWallboardText } from "./wallboard-llm";

describe("Ollama authentication", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("sends a configured token as bearer authentication", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ response: "ok" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		await generateWallboardText({
			config: {
				provider: "ollama",
				enabled: true,
				model: "local-model",
				baseUrl: "https://ollama.example.test",
				authToken: "secret-token",
			},
			prompt: "Summarize this signal",
		});

		expect(fetchMock).toHaveBeenCalledOnce();
		const [, options] = fetchMock.mock.calls[0] ?? [];
		expect(options?.headers).toMatchObject({
			authorization: "Bearer secret-token",
		});
	});
});
