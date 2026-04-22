import { describe, expect, it } from "vitest";
import {
	prepareCodexOutputSchema,
	unwrapCodexOutputContent,
} from "./wallboard-llm-schema";

describe("wallboard codex schema helpers", () => {
	it("leaves object schemas unchanged", () => {
		const plan = prepareCodexOutputSchema({
			type: "object",
			properties: {
				headline: { type: "string" },
			},
			required: ["headline"],
			additionalProperties: false,
		});

		expect(plan.unwrapKey).toBeNull();
		expect(plan.promptSuffix).toBeNull();
		expect(plan.schema).toMatchObject({
			type: "object",
			properties: {
				headline: { type: "string" },
			},
		});
	});

	it("wraps array schemas for codex structured output", () => {
		const plan = prepareCodexOutputSchema({
			type: "array",
			items: {
				type: "string",
			},
		});

		expect(plan.unwrapKey).toBe("items");
		expect(plan.promptSuffix).toContain('"items"');
		expect(plan.schema).toEqual({
			type: "object",
			properties: {
				items: {
					type: "array",
					items: {
						type: "string",
					},
				},
			},
			required: ["items"],
			additionalProperties: false,
		});
	});

	it("unwraps wrapped codex content before downstream parsing", () => {
		expect(
			unwrapCodexOutputContent(
				JSON.stringify({
					items: ["one", "two"],
				}),
				"items",
			),
		).toBe('["one","two"]');
	});
});
