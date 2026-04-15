/**
 * Audit which rated conversations are attributed to a specific teammate in a
 * given period, using the SAME pipeline the wallboard uses (`loadSupportCases`)
 * so the numbers match what appears under "Customer love".
 *
 * For each rating attributed to the person the script prints:
 *   - resolved date
 *   - CX rating (1–5)
 *   - product classifier bucket
 *   - Intercom conversation URL
 *   - ATTRIBUTION PATH:
 *       * "teammate"  — Intercom's `conversation_rating.teammate.id` matched
 *       * "assignee"  — no teammate on the rating; fell back to current
 *                       assignee (THIS IS THE INFLATION RISK)
 *
 * Usage:
 *   pnpm tsx scripts/audit-contributor-ratings.ts --name "Mathias" \
 *       --from 2026-03-01 --to 2026-03-31 [--positive-only]
 *
 * Dates are inclusive, local time. --positive-only filters to ratings >=4/5.
 */

import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

interface Args {
	name: string;
	from: Date;
	to: Date;
	positiveOnly: boolean;
}

function parseArgs(): Args {
	const argv = process.argv.slice(2);
	const get = (flag: string): string | undefined => {
		const i = argv.indexOf(flag);
		return i >= 0 ? argv[i + 1] : undefined;
	};
	const name = get("--name");
	const fromStr = get("--from");
	const toStr = get("--to");
	const positiveOnly = argv.includes("--positive-only");

	if (!name || !fromStr || !toStr) {
		console.error(
			"Usage: pnpm tsx scripts/audit-contributor-ratings.ts --name <substring> --from YYYY-MM-DD --to YYYY-MM-DD [--positive-only]",
		);
		process.exit(1);
	}

	const from = new Date(`${fromStr}T00:00:00`);
	const to = new Date(`${toStr}T23:59:59.999`);
	if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
		console.error("Invalid --from or --to date.");
		process.exit(1);
	}

	return { name, from, to, positiveOnly };
}

function toFivePointRating(score: number): number {
	// Cases store CX score on a 1–10 scale (doubled from Intercom's 1–5).
	return Math.round(score / 2);
}

async function main() {
	const args = parseArgs();
	const [
		{ loadSupportCases },
		{ buildIntercomCaseUrl, getDefaultIntercomAppUrl },
	] = await Promise.all([
		import("@/lib/support-health/server"),
		import("@/lib/intercom-links"),
	]);

	const bundle = await loadSupportCases();
	const { cases, teammateLookup, intercomAppUrl } = bundle;
	const appUrl = intercomAppUrl ?? getDefaultIntercomAppUrl();

	const nameLower = args.name.toLowerCase();

	interface Hit {
		resolvedAt: Date | null;
		fivePoint: number;
		externalId: string;
		productName: string;
		url: string | null;
		attribution: "teammate" | "assignee";
		attributedTo: string;
	}

	const hits: Hit[] = [];
	let inPeriodRated = 0;

	for (const item of cases) {
		if (item.subtype !== "conversation") continue;
		if (item.actionableState !== "resolved") continue;
		if (item.cxScore === null) continue;
		if (item.resolvedAt === null) continue;
		if (item.resolvedAt < args.from || item.resolvedAt > args.to) continue;

		inPeriodRated++;
		const fivePoint = toFivePointRating(item.cxScore);
		const isPositive = fivePoint >= 4;
		if (args.positiveOnly && !isPositive) continue;

		const ratedEntry = item.ratedTeammateExternalId
			? teammateLookup.get(item.ratedTeammateExternalId)
			: null;

		let attribution: "teammate" | "assignee" | null = null;
		let attributedTo: string | null = null;
		if (ratedEntry) {
			attribution = "teammate";
			attributedTo = ratedEntry.name;
		} else if (item.assigneeName) {
			attribution = "assignee";
			attributedTo = item.assigneeName;
		}
		if (!attribution || !attributedTo) continue;
		if (!attributedTo.toLowerCase().includes(nameLower)) continue;

		hits.push({
			resolvedAt: item.resolvedAt,
			fivePoint,
			externalId: item.externalId,
			productName: item.productName,
			url: buildIntercomCaseUrl(appUrl, {
				externalId: item.externalId,
				subtype: "conversation",
			}),
			attribution,
			attributedTo,
		});
	}

	hits.sort(
		(a, b) =>
			(b.resolvedAt?.getTime() ?? 0) - (a.resolvedAt?.getTime() ?? 0),
	);

	const teammateHits = hits.filter((h) => h.attribution === "teammate");
	const assigneeHits = hits.filter((h) => h.attribution === "assignee");
	const teammatePositive = teammateHits.filter((h) => h.fivePoint >= 4).length;
	const assigneePositive = assigneeHits.filter((h) => h.fivePoint >= 4).length;

	console.log(
		`\nScanned ${cases.length} total cases. ${inPeriodRated} rated resolved conversations in the period.`,
	);
	console.log(
		`Window: ${args.from.toISOString().slice(0, 10)} → ${args.to.toISOString().slice(0, 10)}`,
	);
	console.log(`Name filter: "${args.name}"\n`);

	console.log("Attribution breakdown");
	console.log("=====================");
	console.log(
		`  teammate-confirmed : ${teammateHits.length} total (${teammatePositive} positive)`,
	);
	console.log(
		`  assignee-fallback  : ${assigneeHits.length} total (${assigneePositive} positive)  ← inflation risk`,
	);
	console.log(
		`  combined positive  : ${teammatePositive + assigneePositive}  ← matches wallboard "positive CX ratings"\n`,
	);

	const show = (title: string, list: Hit[]) => {
		console.log(title);
		console.log("-".repeat(title.length));
		if (list.length === 0) {
			console.log("  (none)\n");
			return;
		}
		for (const h of list) {
			const when = h.resolvedAt
				? h.resolvedAt.toISOString().slice(0, 16).replace("T", " ")
				: "—";
			const scoreMark = h.fivePoint >= 4 ? "✓" : " ";
			console.log(
				`  ${scoreMark} ${when}  ${h.fivePoint}/5  ${h.productName.padEnd(16)}  ${h.attributedTo.padEnd(22)}  ${h.url ?? h.externalId}`,
			);
		}
		console.log();
	};

	show(
		"Teammate-confirmed (Intercom attributed the rating to them)",
		teammateHits,
	);
	show(
		"Assignee-fallback (Intercom had no teammate on the rating — credit went to the current assignee)",
		assigneeHits,
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
