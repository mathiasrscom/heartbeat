import { describe, expect, it } from "vitest";
import { getEnglishNpsCommentToDisplay } from "./wallboard-nps-comment-utils";
import { buildNpsCommentTranslationKey } from "./wallboard-nps-comment-translations";

describe("wallboard NPS comment translations", () => {
	it("keeps translation keys stable for the same comment payload", () => {
		const first = buildNpsCommentTranslationKey({
			score: 8,
			comment: "Jeg gad godt at der var bredere mulighed for betinget formatering",
			ratedAt: new Date("2026-04-22T08:00:00.000Z"),
		});
		const second = buildNpsCommentTranslationKey({
			score: 8,
			comment: "Jeg gad godt at der var bredere mulighed for betinget formatering",
			ratedAt: new Date("2026-04-22T08:00:00.000Z"),
		});

		expect(first).toBe(second);
	});

	it("hides the English line when the translation matches the original", () => {
		expect(
			getEnglishNpsCommentToDisplay("Simple to use", "Simple to use"),
		).toBeNull();
	});

	it("shows the English line when the translated text is meaningfully different", () => {
		expect(
			getEnglishNpsCommentToDisplay(
				"Du får et stort 10 tal af mig :-)",
				"You get a big 10 from me :-)",
			),
		).toBe("You get a big 10 from me :-)");
	});
});
