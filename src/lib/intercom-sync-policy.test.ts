import { describe, expect, it } from "vitest";
import {
	INTERCOM_SYNC_OVERLAP_SECONDS,
	resolveIntercomSyncCutoff,
	resolveSuccessfulSyncTimestamp,
} from "./intercom-sync-policy";

describe("Intercom sync checkpoints", () => {
	it("replays a five-minute overlap for incremental searches", () => {
		const previous = new Date("2026-08-05T10:30:00.900Z");
		expect(resolveIntercomSyncCutoff(previous)).toBe(
			Math.floor(previous.getTime() / 1000) - INTERCOM_SYNC_OVERLAP_SECONDS,
		);
	});

	it("does not advance the successful checkpoint after a partial failure", () => {
		const previous = new Date("2026-08-05T10:30:00.000Z");
		const completedAt = new Date("2026-08-05T10:35:00.000Z");
		expect(
			resolveSuccessfulSyncTimestamp({
				previousSuccessfulSyncAt: previous,
				completedAt,
				errors: ["Contacts sync failed"],
			}),
		).toBe(previous);
	});

	it("advances the checkpoint only after a clean sync", () => {
		const completedAt = new Date("2026-08-05T10:35:00.000Z");
		expect(
			resolveSuccessfulSyncTimestamp({
				previousSuccessfulSyncAt: null,
				completedAt,
				errors: [],
			}),
		).toBe(completedAt);
	});
});
