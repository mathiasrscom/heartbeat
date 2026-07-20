import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	DEFAULT_OLLAMA_BASE_URL,
	type TickerLlmConfig,
	type WallboardLlmProvider,
} from "./wallboard-llm-config";
import {
	prepareCodexOutputSchema,
	unwrapCodexOutputContent,
} from "./wallboard-llm-schema";

export type {
	TickerLlmConfig,
	WallboardLlmProvider,
	WallboardLlmSource,
} from "./wallboard-llm-config";
export { DEFAULT_OLLAMA_BASE_URL } from "./wallboard-llm-config";

interface GenerateWallboardTextInput {
	config: TickerLlmConfig;
	prompt: string;
	temperature?: number;
	outputSchema?: Record<string, unknown>;
	cwd?: string;
	timeoutMs?: number;
}

interface GenerateWallboardTextResult {
	content: string;
	model: string;
	provider: Exclude<WallboardLlmProvider, null>;
}

interface SpawnResult {
	code: number | null;
	stdout: string;
	stderr: string;
}

let codexAuthPromise: Promise<void> | null = null;

function runSpawn(
	command: string,
	args: string[],
	options: {
		cwd?: string;
		input?: string;
		timeoutMs?: number;
	},
): Promise<SpawnResult> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: options.cwd,
			env: process.env,
			stdio: ["pipe", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";
		let settled = false;

		const timer = setTimeout(() => {
			child.kill("SIGTERM");
			setTimeout(() => child.kill("SIGKILL"), 5_000);
		}, options.timeoutMs ?? 120_000);

		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString();
		});

		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});

		child.on("close", (code) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve({ code, stdout, stderr });
		});

		child.on("error", (error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			reject(error);
		});

		if (options.input) {
			child.stdin.write(options.input);
		}
		child.stdin.end();
	});
}

function getCodexModelHint(model: string | null, output: string) {
	const match = output.match(/^model:\s*(.+)$/m);
	if (match?.[1]) {
		return match[1].trim();
	}

	return model?.trim() || "codex";
}

async function ensureCodexAuth(cwd: string) {
	if (!codexAuthPromise) {
		codexAuthPromise = (async () => {
			const status = await runSpawn("codex", ["login", "status"], {
				cwd,
				timeoutMs: 15_000,
			});
			if (status.code === 0) return;

			throw new Error(
				"Codex CLI is not authenticated. Run `codex login` in the same environment as the Heartbeat worker before starting the app.",
			);
		})().catch((error) => {
			codexAuthPromise = null;
			throw error;
		});
	}

	return codexAuthPromise;
}

async function generateWithOllama(input: GenerateWallboardTextInput) {
	const model = input.config.model?.trim();
	if (!model) return null;

	const baseUrl = (input.config.baseUrl || DEFAULT_OLLAMA_BASE_URL).replace(
		/\/$/,
		"",
	);
	const response = await fetch(`${baseUrl}/api/generate`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			...(input.config.authToken
				? { authorization: `Bearer ${input.config.authToken}` }
				: {}),
		},
		body: JSON.stringify({
			model,
			prompt: input.prompt,
			stream: false,
			options: {
				temperature: input.temperature ?? 0.35,
			},
		}),
	});

	if (!response.ok) {
		const detail = await response.text();
		throw new Error(`Ollama API error (${response.status}): ${detail}`);
	}

	const payload = (await response.json()) as { response?: unknown };
	const content = typeof payload.response === "string" ? payload.response : "";
	if (!content.trim()) return null;

	return {
		content,
		model,
		provider: "ollama",
	} satisfies GenerateWallboardTextResult;
}

async function generateWithCodex(input: GenerateWallboardTextInput) {
	const model = input.config.model?.trim();

	const cwd = input.cwd ?? process.cwd();
	await ensureCodexAuth(cwd);

	const tempDir = await mkdtemp(join(tmpdir(), "heartbeat-codex-"));
	const outputPath = join(tempDir, "output.json");
	const schemaPath = join(tempDir, "schema.json");
	const schemaPlan = input.outputSchema
		? prepareCodexOutputSchema(input.outputSchema)
		: null;

	try {
		if (schemaPlan) {
			await writeFile(
				schemaPath,
				`${JSON.stringify(schemaPlan.schema, null, 2)}\n`,
				"utf8",
			);
		}

		const args = [
			"exec",
			"--skip-git-repo-check",
			"--ephemeral",
			"--color",
			"never",
			"--output-last-message",
			outputPath,
		];

		if (model) {
			args.push("--model", model);
		}

		if (schemaPlan) {
			args.push("--output-schema", schemaPath);
		}

		args.push("-");

		const prompt = schemaPlan?.promptSuffix
			? `${input.prompt}\n\n${schemaPlan.promptSuffix}`
			: input.prompt;

		const result = await runSpawn("codex", args, {
			cwd,
			input: `${prompt}\n`,
			timeoutMs: input.timeoutMs ?? 180_000,
		});

		let content = "";
		try {
			content = (await readFile(outputPath, "utf8")).trim();
		} catch {
			content = result.stdout.trim();
		}

		if (result.code !== 0 && !content) {
			throw new Error(
				(result.stderr || result.stdout).trim() ||
					`Codex CLI exited with code ${result.code}`,
			);
		}

		content = unwrapCodexOutputContent(content, schemaPlan?.unwrapKey ?? null);

		if (!content) return null;

		return {
			content,
			model: getCodexModelHint(model, `${result.stderr}\n${result.stdout}`),
			provider: "codex",
		} satisfies GenerateWallboardTextResult;
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
}

export async function generateWallboardText(
	input: GenerateWallboardTextInput,
): Promise<GenerateWallboardTextResult | null> {
	if (!input.config.enabled) return null;
	if (input.config.provider === "ollama") {
		return generateWithOllama(input);
	}
	if (input.config.provider === "codex") {
		return generateWithCodex(input);
	}
	return null;
}
