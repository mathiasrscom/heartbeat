/**
 * Dump the raw `conversation_rating` + assignee trail for a small sample of
 * rated Intercom conversations, so we can see whether Intercom is actually
 * omitting `conversation_rating.teammate` or whether our sync is dropping it.
 *
 * Usage:
 *   pnpm tsx scripts/inspect-rating-raw.ts [--limit 5] [--id <conversationId>]
 *
 * With --id, inspects just that conversation. Otherwise picks a sample.
 */

import { config } from "dotenv";
import { and, eq, isNotNull } from "drizzle-orm";

config({ path: [".env.local", ".env"] });

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

async function main() {
	const argv = process.argv.slice(2);
	const idFlag = argv.indexOf("--id");
	const specificId = idFlag >= 0 ? argv[idFlag + 1] : null;
	const limitFlag = argv.indexOf("--limit");
	const limit = limitFlag >= 0 ? Number(argv[limitFlag + 1]) : 5;

	const [{ db }, { nodes }] = await Promise.all([
		import("@/db"),
		import("@/db/schema"),
	]);

	const where = specificId
		? and(eq(nodes.source, "intercom"), eq(nodes.externalId, specificId))
		: and(eq(nodes.source, "intercom"), isNotNull(nodes.cxScore));

	const rows = await db
		.select({
			externalId: nodes.externalId,
			resolvedAt: nodes.resolvedAt,
			cxScore: nodes.cxScore,
			rawData: nodes.rawData,
		})
		.from(nodes)
		.where(where)
		.limit(specificId ? 1 : limit);

	if (rows.length === 0) {
		console.log("No matching conversations.");
		return;
	}

	const { extractIntercomCx } = await import("@/lib/intercom-cx");

	for (const row of rows) {
		console.log(`\n── Conversation ${row.externalId} ──`);
		console.log(
			`  resolvedAt: ${row.resolvedAt?.toISOString() ?? "—"}   cxScore(1-10): ${row.cxScore}`,
		);

		const raw = isRecord(row.rawData) ? row.rawData : null;

		// Which extractor actually produced the cxScore we persisted?
		const derived = extractIntercomCx(row.rawData);
		console.log(
			`  rating source (extractIntercomCx): ${derived.source ?? "—"}   score: ${derived.score}`,
		);

		const rating = raw && isRecord(raw.conversation_rating)
			? raw.conversation_rating
			: null;
		if (!rating) {
			console.log("  conversation_rating: (missing)");
		} else {
			console.log("  conversation_rating:", JSON.stringify(rating, null, 2));
		}

		const aiAgent = raw && isRecord(raw.ai_agent) ? raw.ai_agent : null;
		if (aiAgent) {
			console.log("  ai_agent:", JSON.stringify(aiAgent, null, 2));
		}

		const custom = raw && isRecord(raw.custom_attributes)
			? raw.custom_attributes
			: null;
		if (custom) {
			const cxKeys = Object.keys(custom).filter((k) =>
				/cx|rating|score|feedback/i.test(k),
			);
			if (cxKeys.length > 0) {
				const subset: Record<string, unknown> = {};
				for (const k of cxKeys) subset[k] = custom[k];
				console.log("  custom_attributes (cx-related):", JSON.stringify(subset, null, 2));
			}
		}

		const adminAssigneeId = raw ? raw.admin_assignee_id : undefined;
		const teamAssigneeId = raw ? raw.team_assignee_id : undefined;
		console.log(`  admin_assignee_id: ${JSON.stringify(adminAssigneeId)}`);
		console.log(`  team_assignee_id : ${JSON.stringify(teamAssigneeId)}`);

		const stats = raw && isRecord(raw.statistics) ? raw.statistics : null;
		if (stats) {
			console.log(
				`  statistics.last_admin_reply_at : ${JSON.stringify(stats.last_admin_reply_at)}`,
			);
			console.log(
				`  statistics.first_admin_reply_at: ${JSON.stringify(stats.first_admin_reply_at)}`,
			);
			console.log(
				`  statistics.time_to_last_close  : ${JSON.stringify(stats.time_to_last_close)}`,
			);
		}

		const updatedAt = raw ? raw.updated_at : undefined;
		if (typeof updatedAt === "number") {
			console.log(
				`  updated_at: ${updatedAt} (${new Date(updatedAt * 1000).toISOString()})`,
			);
		}
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
