import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { config as loadEnv } from "dotenv";

loadEnv({ path: [".env.local", ".env"] });

function resolveBin(command) {
	return process.platform === "win32" ? `${command}.cmd` : command;
}

function resolveLocalPostgresPort() {
	const dbUrl = process.env.DATABASE_URL?.trim();
	if (dbUrl) {
		try {
			const parsed = new URL(dbUrl);
			if (
				(parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") &&
				parsed.port
			) {
				return parsed.port;
			}
		} catch {
			// Ignore malformed DATABASE_URL and fall back to POSTGRES_PORT/default.
		}
	}

	return process.env.POSTGRES_PORT?.trim() || "5432";
}

function spawnCommand(command, args, options = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(resolveBin(command), args, {
			stdio: options.stdio ?? "inherit",
			env: options.env ?? process.env,
			cwd: options.cwd ?? process.cwd(),
		});

		child.on("error", reject);
		child.on("close", (code, signal) => {
			if (signal) {
				reject(new Error(`${command} ${args.join(" ")} exited via signal ${signal}`));
				return;
			}
			resolve(code ?? 0);
		});
	});
}

async function runOrThrow(command, args, options = {}) {
	const code = await spawnCommand(command, args, options);
	if (code !== 0) {
		throw new Error(`${command} ${args.join(" ")} failed with exit code ${code}`);
	}
}

async function waitForPostgres(composeEnv) {
	const pgUser = process.env.POSTGRES_USER?.trim() || "heartbeat";
	const pgDb = process.env.POSTGRES_DB?.trim() || "heartbeat";

	for (let attempt = 1; attempt <= 30; attempt += 1) {
		const code = await spawnCommand(
			"docker",
			["compose", "exec", "-T", "postgres", "pg_isready", "-U", pgUser, "-d", pgDb],
			{
				env: composeEnv,
				stdio: "ignore",
			},
		);

		if (code === 0) {
			return;
		}

		if (attempt === 1 || attempt % 5 === 0) {
			console.log(
				`[dev:full] Waiting for postgres to accept connections (${attempt}/30)...`,
			);
		}
		await delay(1_000);
	}

	throw new Error("Postgres did not become ready within 30 seconds.");
}

async function main() {
	const postgresPort = resolveLocalPostgresPort();
	const configuredPort = process.env.POSTGRES_PORT?.trim();
	const composeEnv = {
		...process.env,
		POSTGRES_PORT: postgresPort,
	};

	if (configuredPort && configuredPort !== postgresPort) {
		console.log(
			`[dev:full] Using POSTGRES_PORT=${postgresPort} to match DATABASE_URL instead of configured POSTGRES_PORT=${configuredPort}.`,
		);
	}

	console.log(`[dev:full] Starting postgres on host port ${postgresPort}...`);
	await runOrThrow("docker", ["compose", "up", "-d", "postgres"], {
		env: composeEnv,
	});

	await waitForPostgres(composeEnv);

	console.log("[dev:full] Applying database schema...");
	await runOrThrow("pnpm", ["db:push"], { env: process.env });

	console.log("[dev:full] Starting web app and worker...");
	const devEnv = {
		...process.env,
		HEARTBEAT_DISABLE_DEVTOOLS_EVENT_BUS: "1",
	};

	const child = spawn(resolveBin("pnpm"), ["dev"], {
		stdio: "inherit",
		env: devEnv,
		cwd: process.cwd(),
	});

	const forwardSignal = (signal) => {
		child.kill(signal);
	};

	process.on("SIGINT", forwardSignal);
	process.on("SIGTERM", forwardSignal);

	child.on("close", (code) => {
		process.exit(code ?? 0);
	});

	child.on("error", (error) => {
		console.error("[dev:full] Failed to start pnpm dev:", error);
		process.exit(1);
	});
}

main().catch((error) => {
	console.error(
		`[dev:full] ${error instanceof Error ? error.message : String(error)}`,
	);
	process.exit(1);
});
