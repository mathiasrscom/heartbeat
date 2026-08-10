import { describe, expect, it } from "vitest";
import { normalizeSupportPeriodInput, resolveSupportPeriod } from "./period";

const now = new Date("2026-08-05T11:13:00+02:00");

describe("support period", () => {
	it.each([
		["rolling-90-days", "Last 90 days", "2026-05-08"],
		["rolling-180-days", "Last 180 days", "2026-02-07"],
	] as const)(
		"resolves %s as an inclusive rolling window",
		(preset, label, from) => {
			const period = resolveSupportPeriod({ period: preset }, now);

			expect(period.range).toEqual({
				preset,
				label,
				from,
				to: "2026-08-05",
			});
		},
	);

	it("accepts every Pulse picker period", () => {
		for (const period of [
			"current-week",
			"previous-week",
			"rolling-30-days",
			"rolling-90-days",
			"rolling-180-days",
		]) {
			expect(normalizeSupportPeriodInput({ period }).period).toBe(period);
		}
	});
});
