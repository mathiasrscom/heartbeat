import { describe, expect, it } from "vitest";
import { buildNpsSummary } from "./support-health/logic";
import { resolveSupportPeriod } from "./support-health/period";
import type { NpsRecord } from "./support-health/types";
import { extractNps } from "./nps";

describe("Intercom NPS data", () => {
	it("does not treat a generic contact update as the NPS response date", () => {
		expect(
			extractNps({
				updated_at: 1_785_933_600,
				custom_attributes: {
					nps_score: 4,
					nps_comment: "Too expensive",
				},
			}),
		).toEqual({
			score: 4,
			comment: "Too expensive",
			ratedAt: null,
		});
	});

	it("uses an explicit NPS timestamp when Intercom supplies one", () => {
		const result = extractNps({
			updated_at: 1_785_933_600,
			custom_attributes: {
				nps_score: 9,
				nps_rated_at: "2026-08-01T10:00:00.000Z",
			},
		});
		expect(result.ratedAt?.toISOString()).toBe("2026-08-01T10:00:00.000Z");
	});

	it("summarizes undated scores as a latest-known snapshot", () => {
		const records: NpsRecord[] = [
			makeRecord("promoter", 10, "Very easy"),
			makeRecord("passive", 8, null),
			makeRecord("detractor", 4, "Too expensive"),
		];
		const period = resolveSupportPeriod(
			{ period: "current-week" },
			new Date("2026-08-05T10:00:00.000Z"),
		);

		expect(buildNpsSummary(records, period)).toMatchObject({
			periodLabel: "Latest known",
			isSnapshot: true,
			score: 0,
			previousScore: null,
			delta: null,
			promoterCount: 1,
			passiveCount: 1,
			detractorCount: 1,
			responseCount: 3,
			commentCount: 2,
			averageScore: 7.3,
		});
	});
});

function makeRecord(
	bucket: NpsRecord["bucket"],
	score: number,
	comment: string | null,
): NpsRecord {
	return {
		entityId: `${bucket}-${score}`,
		name: bucket,
		score,
		comment,
		ratedAt: null,
		bucket,
	};
}
