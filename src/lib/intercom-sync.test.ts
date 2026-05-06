import { describe, expect, it } from "vitest";
import {
	getContactIncrementalCutoff,
	getContactSearchUpdatedSinceTimestamp,
	shouldSyncChangedContact,
} from "./intercom-sync";

describe("intercom incremental contact sync", () => {
	it("searches from the UTC day boundary for the lookback cutoff", () => {
		const previousSync = new Date("2026-05-06T09:31:45.000Z");
		const cutoff = getContactIncrementalCutoff(previousSync);

		expect(cutoff.toISOString()).toBe("2026-05-06T07:31:45.000Z");
		expect(getContactSearchUpdatedSinceTimestamp(cutoff)).toBe(
			Date.UTC(2026, 4, 6) / 1000,
		);
	});

	it("filters search results to the exact lookback window after date search", () => {
		const cutoff = new Date("2026-05-06T07:31:45.000Z");

		expect(
			shouldSyncChangedContact(
				{ updated_at: Date.UTC(2026, 4, 6, 7, 31, 44) / 1000 },
				cutoff,
			),
		).toBe(false);
		expect(
			shouldSyncChangedContact(
				{ updated_at: Date.UTC(2026, 4, 6, 7, 31, 45) / 1000 },
				cutoff,
			),
		).toBe(true);
	});
});
