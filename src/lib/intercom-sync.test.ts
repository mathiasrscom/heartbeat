import { describe, expect, it } from "vitest";
import { shouldRefreshExistingCaseContact } from "./intercom-sync-policy";

describe("intercom case contact refresh", () => {
	it("refreshes existing contact entities during incremental case sync only", () => {
		expect(shouldRefreshExistingCaseContact(null)).toBe(false);
		expect(
			shouldRefreshExistingCaseContact(new Date("2026-05-06T09:31:45.000Z")),
		).toBe(true);
	});
});
