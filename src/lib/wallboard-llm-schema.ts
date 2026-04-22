type JsonSchema = Record<string, unknown>;

export interface CodexOutputSchemaPlan {
	schema: JsonSchema;
	unwrapKey: string | null;
	promptSuffix: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function prepareCodexOutputSchema(
	outputSchema: JsonSchema,
): CodexOutputSchemaPlan {
	if (outputSchema.type === "object") {
		return {
			schema: outputSchema,
			unwrapKey: null,
			promptSuffix: null,
		};
	}

	const unwrapKey = outputSchema.type === "array" ? "items" : "value";
	const valueLabel = outputSchema.type === "array" ? "array" : "value";

	return {
		schema: {
			type: "object",
			properties: {
				[unwrapKey]: outputSchema,
			},
			required: [unwrapKey],
			additionalProperties: false,
		},
		unwrapKey,
		promptSuffix: `Schema note: return the requested JSON ${valueLabel} inside a top-level "${unwrapKey}" property. Heartbeat will unwrap it automatically.`,
	};
}

export function unwrapCodexOutputContent(
	content: string,
	unwrapKey: string | null,
) {
	const trimmed = content.trim();
	if (!trimmed || !unwrapKey) return trimmed;

	try {
		const parsed = JSON.parse(trimmed);
		if (!isRecord(parsed)) return trimmed;
		if (!Object.hasOwn(parsed, unwrapKey)) {
			return trimmed;
		}

		const serialized = JSON.stringify(parsed[unwrapKey]);
		return typeof serialized === "string" ? serialized : trimmed;
	} catch {
		return trimmed;
	}
}
