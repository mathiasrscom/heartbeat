import { describe, expect, it } from "vitest";
import {
	createNpsSignature,
	resolveNpsCaptureAction,
} from "./intercom-nps-history-policy";

describe("Intercom NPS history", () => {
	it("creates stable signatures for idempotent snapshots", () => {
		expect(createNpsSignature(9, "Great")).toBe(createNpsSignature(9, "Great"));
		expect(createNpsSignature(9, "Great")).not.toBe(
			createNpsSignature(9, "Different"),
		);
	});

	it("records a new score, but not an unchanged sync", () => {
		expect(
			resolveNpsCaptureAction(
				{ score: null, comment: null },
				{ score: 10, comment: "Excellent" },
			),
		).toBe("response");
		expect(
			resolveNpsCaptureAction(
				{ score: 10, comment: "Excellent" },
				{ score: 10, comment: "Excellent" },
			),
		).toBe("none");
	});

	it("amends a late comment without double-counting the response", () => {
		expect(
			resolveNpsCaptureAction(
				{ score: 6, comment: null },
				{ score: 6, comment: "Too expensive" },
			),
		).toBe("comment");
	});
});
