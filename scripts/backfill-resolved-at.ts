/**
 * One-off backfill: recompute `resolvedAt` for existing closed Intercom
 * conversations and tickets that were polluted by the old sync behaviour
 * (which stamped `resolvedAt = updated_at` on every sync pass, bumping the
 * value forward every time anything about the row changed).
 *
 * Strategy for conversations:
 *   - If `rawData.created_at + statistics.time_to_last_close` is available,
 *     use that (Intercom's canonical close time — immutable).
 *   - Otherwise leave the row alone.
 *
 * Tickets don't have a reliable close-duration statistic, so we don't touch
 * their `resolvedAt` retroactively — going forward the sync preserves the
 * first observed close time instead of bumping it.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-resolved-at.ts           # dry run
 *   pnpm tsx scripts/backfill-resolved-at.ts --apply   # write changes
 */

import { config } from "dotenv";
import { and, eq, isNotNull } from "drizzle-orm";

config({ path: [".env.local", ".env"] });

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

async function main() {
	const apply = process.argv.includes("--apply");

	const [{ db }, { nodes }] = await Promise.all([
		import("@/db"),
		import("@/db/schema"),
	]);

	const rows = await db
		.select({
			id: nodes.id,
			externalId: nodes.externalId,
			type: nodes.type,
			status: nodes.status,
			resolvedAt: nodes.resolvedAt,
			rawData: nodes.rawData,
		})
		.from(nodes)
		.where(
			and(
				eq(nodes.source, "intercom"),
				eq(nodes.type, "conversation"),
				isNotNull(nodes.resolvedAt),
			),
		);

	let considered = 0;
	let toFix = 0;
	let unchanged = 0;
	let noData = 0;

	for (const row of rows) {
		considered++;
		if (!isRecord(row.rawData)) {
			noData++;
			continue;
		}
		const createdAt = row.rawData.created_at;
		const stats = isRecord(row.rawData.statistics) ? row.rawData.statistics : null;
		const timeToLastClose = stats?.time_to_last_close;
		if (
			typeof createdAt !== "number" ||
			typeof timeToLastClose !== "number" ||
			!Number.isFinite(createdAt) ||
			!Number.isFinite(timeToLastClose)
		) {
			noData++;
			continue;
		}

		const derived = new Date((createdAt + timeToLastClose) * 1000);
		const current = row.resolvedAt?.getTime() ?? 0;
		const diffSeconds = Math.round((current - derived.getTime()) / 1000);

		// Only fix rows where the current resolvedAt is meaningfully later than
		// the derived close time. Small drift (< 10 min) is noise we leave alone.
		if (diffSeconds < 600) {
			unchanged++;
			continue;
		}

		toFix++;
		if (apply) {
			await db
				.update(nodes)
				.set({ resolvedAt: derived })
				.where(eq(nodes.id, row.id));
		} else {
			// Show a few concrete examples so the user can sanity-check before
			// committing. Only log the first 10 to keep output manageable.
			if (toFix <= 10) {
				console.log(
					`  ${row.externalId}  current=${row.resolvedAt?.toISOString()}  derived=${derived.toISOString()}  drift=${Math.round(diffSeconds / 86400)}d`,
				);
			}
		}
	}

	console.log(`\nScanned ${considered} closed Intercom conversations.`);
	console.log(`  Will fix       : ${toFix}`);
	console.log(`  Already correct: ${unchanged}`);
	console.log(`  Missing raw    : ${noData}`);
	if (!apply) {
		console.log(
			"\nDry run. Re-run with --apply to write changes.",
		);
	} else {
		console.log(`\nApplied. Updated ${toFix} rows.`);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
