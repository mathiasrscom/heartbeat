import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { entities, npsResponses } from "@/db/schema";
import type { IntercomNpsExportRow } from "./intercom-nps-export";

export interface IntercomNpsImportResult {
	importedCount: number;
	alreadyImportedCount: number;
	matchedContactCount: number;
	totalStoredCount: number;
}

function validateRows(input: unknown): IntercomNpsExportRow[] {
	if (!Array.isArray(input) || input.length === 0 || input.length > 20_000) {
		throw new Error(
			"The NPS export must contain between 1 and 20,000 responses.",
		);
	}
	return input.map((value, index) => {
		if (typeof value !== "object" || value === null) {
			throw new Error(`NPS response ${index + 1} is invalid.`);
		}
		const row = value as Partial<IntercomNpsExportRow>;
		const score = Number(row.score);
		const respondedAt = new Date(row.respondedAt ?? "");
		if (
			!row.receiptId?.trim() ||
			!row.contactExternalId?.trim() ||
			!Number.isInteger(score) ||
			score < 0 ||
			score > 10 ||
			Number.isNaN(respondedAt.getTime())
		) {
			throw new Error(
				`NPS response ${index + 1} is missing valid required data.`,
			);
		}
		return {
			receiptId: row.receiptId.trim(),
			contactExternalId: row.contactExternalId.trim(),
			name: typeof row.name === "string" ? row.name.trim() || null : null,
			email: typeof row.email === "string" ? row.email.trim() || null : null,
			score,
			comment:
				typeof row.comment === "string" ? row.comment.trim() || null : null,
			receivedAt:
				typeof row.receivedAt === "string"
					? row.receivedAt.trim() || null
					: null,
			respondedAt: respondedAt.toISOString(),
			scoreQuestion:
				typeof row.scoreQuestion === "string" ? row.scoreQuestion : "NPS",
		};
	});
}

function inferProductName(question: string) {
	return question.match(/recommend\s+(.+?)\s+to\s+/i)?.[1]?.trim() ?? null;
}

export async function importIntercomNpsExport(input: unknown) {
	const rows = validateRows(input);
	const contactIds = Array.from(
		new Set(rows.map((row) => row.contactExternalId)),
	);
	const matchedEntities = await db
		.select({ id: entities.id, externalId: entities.externalId })
		.from(entities)
		.where(
			and(
				eq(entities.source, "intercom"),
				inArray(entities.externalId, contactIds),
			),
		);
	const entityIds = new Map(
		matchedEntities.map((entity) => [entity.externalId, entity.id]),
	);
	const capturedAt = new Date();
	let importedCount = 0;

	for (let index = 0; index < rows.length; index += 500) {
		const inserted = await db
			.insert(npsResponses)
			.values(
				rows.slice(index, index + 500).map((row) => ({
					source: "intercom",
					externalId: `survey-receipt:${row.receiptId}`,
					contactExternalId: row.contactExternalId,
					entityId: entityIds.get(row.contactExternalId) ?? null,
					score: row.score,
					comment: row.comment,
					respondedAt: new Date(row.respondedAt),
					capturedAt,
					origin: "intercom-nps-export",
					rawData: {
						receiptId: row.receiptId,
						receivedAt: row.receivedAt,
						contactName: row.name,
						contactEmail: row.email,
						scoreQuestion: row.scoreQuestion,
						productName: inferProductName(row.scoreQuestion),
					},
				})),
			)
			.onConflictDoNothing()
			.returning({ id: npsResponses.id });
		importedCount += inserted.length;
	}

	const [stored] = await db
		.select({ value: count() })
		.from(npsResponses)
		.where(eq(npsResponses.source, "intercom"));

	return {
		importedCount,
		alreadyImportedCount: rows.length - importedCount,
		matchedContactCount: rows.filter((row) =>
			entityIds.has(row.contactExternalId),
		).length,
		totalStoredCount: stored?.value ?? 0,
	} satisfies IntercomNpsImportResult;
}
