import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { entities, npsContactState, npsResponses, settings } from "@/db/schema";
import type { IntercomContact } from "./intercom";
import {
	createNpsSignature,
	resolveNpsCaptureAction,
} from "./intercom-nps-history-policy";
import { extractNps } from "./nps";

const NPS_CAPTURE_INITIALIZED_KEY = "intercom_nps_capture_initialized_at";

function contactTimestamp(contact: IntercomContact, fallback: Date) {
	if (
		typeof contact.updated_at !== "number" ||
		!Number.isFinite(contact.updated_at)
	) {
		return fallback;
	}
	const date = new Date(contact.updated_at * 1000);
	return Number.isNaN(date.getTime()) ? fallback : date;
}

function createResponseExternalId(input: {
	contactExternalId: string;
	respondedAt: Date;
	score: number;
	previousSignature: string | null;
}) {
	return createHash("sha256")
		.update(
			JSON.stringify([
				input.contactExternalId,
				input.respondedAt.toISOString(),
				input.score,
				input.previousSignature,
			]),
		)
		.digest("hex");
}

/**
 * Seed a cursor for every already-synced contact before change capture starts.
 * Existing mutable NPS values deliberately do not become dated responses: the
 * Intercom Contacts API does not expose when those survey answers were given.
 */
export async function ensureNpsCaptureBaseline() {
	const initialized = await db
		.select({ value: settings.value })
		.from(settings)
		.where(eq(settings.key, NPS_CAPTURE_INITIALIZED_KEY))
		.limit(1);
	if (initialized.length > 0) return false;

	const contacts = await db
		.select({
			id: entities.id,
			externalId: entities.externalId,
			rawData: entities.rawData,
		})
		.from(entities)
		.where(eq(entities.source, "intercom"));
	const observedAt = new Date();

	for (let index = 0; index < contacts.length; index += 500) {
		const values = contacts.slice(index, index + 500).map((contact) => {
			const nps = extractNps(contact.rawData);
			return {
				source: "intercom",
				contactExternalId: contact.externalId,
				entityId: contact.id,
				score: nps.score,
				comment: nps.comment,
				signature: createNpsSignature(nps.score, nps.comment),
				firstSeenAt: observedAt,
				lastSeenAt: observedAt,
			};
		});
		if (values.length > 0) {
			await db.insert(npsContactState).values(values).onConflictDoNothing();
		}
	}

	await db
		.insert(settings)
		.values({
			key: NPS_CAPTURE_INITIALIZED_KEY,
			value: {
				initializedAt: observedAt.toISOString(),
				contactsBaselined: contacts.length,
			},
			updatedAt: observedAt,
		})
		.onConflictDoNothing();

	console.info(
		`[intercom-sync] NPS history baseline created for ${contacts.length} contacts.`,
	);
	return true;
}

/** Capture a real NPS change observed during a contact sync. */
export async function captureContactNps(
	contact: IntercomContact,
	entityId: string,
	observedAt = new Date(),
) {
	const nps = extractNps(contact);
	const signature = createNpsSignature(nps.score, nps.comment);
	const respondedAt = nps.ratedAt ?? contactTimestamp(contact, observedAt);

	await db.transaction(async (tx) => {
		const current = await tx
			.select()
			.from(npsContactState)
			.where(
				and(
					eq(npsContactState.source, "intercom"),
					eq(npsContactState.contactExternalId, contact.id),
				),
			)
			.limit(1);
		const previous = current[0];
		const action = resolveNpsCaptureAction(previous ?? null, nps);

		if (!previous) {
			await tx.insert(npsContactState).values({
				source: "intercom",
				contactExternalId: contact.id,
				entityId,
				score: nps.score,
				comment: nps.comment,
				signature,
				firstSeenAt: observedAt,
				lastSeenAt: observedAt,
				lastChangedAt: nps.score === null ? null : respondedAt,
			});

			// A contact created after capture was initialized can legitimately carry
			// its first score. Its Intercom updated_at is the best available timestamp.
			if (action === "response" && nps.score !== null) {
				await tx.insert(npsResponses).values({
					source: "intercom",
					externalId: createResponseExternalId({
						contactExternalId: contact.id,
						respondedAt,
						score: nps.score,
						previousSignature: null,
					}),
					contactExternalId: contact.id,
					entityId,
					score: nps.score,
					comment: nps.comment,
					respondedAt,
					capturedAt: observedAt,
					origin: "intercom-contact-sync",
					rawData: { intercomUpdatedAt: contact.updated_at ?? null },
				});
			}
			return;
		}

		if (action === "response" && nps.score !== null) {
			await tx
				.insert(npsResponses)
				.values({
					source: "intercom",
					externalId: createResponseExternalId({
						contactExternalId: contact.id,
						respondedAt,
						score: nps.score,
						previousSignature: previous.signature,
					}),
					contactExternalId: contact.id,
					entityId,
					score: nps.score,
					comment: nps.comment,
					respondedAt,
					capturedAt: observedAt,
					origin: "intercom-contact-sync",
					rawData: { intercomUpdatedAt: contact.updated_at ?? null },
				})
				.onConflictDoNothing();
		} else if (action === "comment") {
			// A survey comment can arrive just after the numeric score. Amend the
			// latest response instead of counting the comment as a second response.
			const latest = await tx
				.select({ id: npsResponses.id })
				.from(npsResponses)
				.where(
					and(
						eq(npsResponses.source, "intercom"),
						eq(npsResponses.contactExternalId, contact.id),
					),
				)
				.orderBy(desc(npsResponses.respondedAt))
				.limit(1);
			if (latest[0]) {
				await tx
					.update(npsResponses)
					.set({ comment: nps.comment, capturedAt: observedAt })
					.where(eq(npsResponses.id, latest[0].id));
			}
		}

		await tx
			.update(npsContactState)
			.set({
				entityId,
				score: nps.score,
				comment: nps.comment,
				signature,
				lastSeenAt: observedAt,
				lastChangedAt:
					previous.signature === signature
						? previous.lastChangedAt
						: respondedAt,
			})
			.where(eq(npsContactState.id, previous.id));
	});
}
