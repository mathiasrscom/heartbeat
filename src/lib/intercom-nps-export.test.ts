import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
	parseIntercomNpsCombinedCsv,
	readIntercomNpsExport,
} from "./intercom-nps-export";

const csv = `receipt_id,user_id,user_external_id,name,email,company_id,company_external_id,created_via,received_at,completed_at,How likely are you to recommend Addo Sign to a friend or colleague?,What is the main reason for your score?\n961758128,contact-1,926,Lars,lars@example.com,'-1,,shown_automatically,2026-04-13T12:32:22.000Z,2026-04-13T12:32:40.000Z,10,"Simple, fast, and reliable"\n`;

describe("Intercom NPS export", () => {
	it("parses typed responses from the combined CSV", () => {
		expect(parseIntercomNpsCombinedCsv(csv)).toEqual([
			expect.objectContaining({
				receiptId: "961758128",
				contactExternalId: "contact-1",
				score: 10,
				comment: "Simple, fast, and reliable",
				respondedAt: "2026-04-13T12:32:40.000Z",
			}),
		]);
	});

	it("finds the combined answer file inside the Intercom ZIP", () => {
		const incompleteCsv = csv.replace("2026-04-13T12:32:40.000Z,10", ",10");
		const zip = zipSync({
			"receipt_20260806.csv": strToU8("receipt_id\n1\n"),
			"answer_20260806.csv": strToU8(
				"receipt_id,answered_at,question_id,question,response_type,response\n961758128,2026-04-13T12:32:26.000Z,49278,NPS,rating_scale,10\n",
			),
			"answer_combined_20260806.csv": strToU8(incompleteCsv),
		});
		expect(readIntercomNpsExport("export.zip", zip)[0].respondedAt).toBe(
			"2026-04-13T12:32:26.000Z",
		);
	});

	it("rejects invalid NPS scores", () => {
		expect(() =>
			parseIntercomNpsCombinedCsv(csv.replace(",10,", ",11,")),
		).toThrow("invalid score");
	});
});
