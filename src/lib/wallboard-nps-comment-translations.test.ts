import { describe, expect, it } from "vitest";
import {
	buildNpsCommentTranslationKey,
	isLikelyEnglish,
	type KeyedComment,
	partitionCommentsForTranslation,
} from "./wallboard-nps-comment-translations";
import { getEnglishNpsCommentToDisplay } from "./wallboard-nps-comment-utils";

describe("wallboard NPS comment translations", () => {
	it("keeps translation keys stable for the same comment payload", () => {
		const first = buildNpsCommentTranslationKey({
			score: 8,
			comment:
				"Jeg gad godt at der var bredere mulighed for betinget formatering",
			ratedAt: new Date("2026-04-22T08:00:00.000Z"),
		});
		const second = buildNpsCommentTranslationKey({
			score: 8,
			comment:
				"Jeg gad godt at der var bredere mulighed for betinget formatering",
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

describe("isLikelyEnglish", () => {
	it("returns true for ASCII English with a stopword", () => {
		expect(isLikelyEnglish("Great service, thanks!")).toBe(true);
		expect(isLikelyEnglish("The support was very fast")).toBe(true);
	});

	it("returns false for ASCII without any English stopword", () => {
		expect(isLikelyEnglish("Bra hjalp")).toBe(false);
		expect(isLikelyEnglish("Tak for hurtig svar")).toBe(false);
	});

	it("returns false for any text containing non-ASCII characters", () => {
		expect(isLikelyEnglish("Bra hjælp")).toBe(false);
		expect(isLikelyEnglish("Großartig")).toBe(false);
		expect(isLikelyEnglish("Mycket bra ❤️")).toBe(false);
	});

	it("is case-insensitive on stopwords", () => {
		expect(isLikelyEnglish("THANKS for the help!")).toBe(true);
	});
});

function makeComment(
	key: string,
	comment: string,
	score = 9,
	ratedAtMs = 1_700_000_000_000,
): KeyedComment {
	return { key, score, comment, ratedAtMs };
}

describe("partitionCommentsForTranslation", () => {
	it("skips comments whose key is already cached", () => {
		const result = partitionCommentsForTranslation({
			keyedComments: [
				makeComment("a", "Tak for hurtig svar"),
				makeComment("b", "Mycket bra"),
			],
			existingTranslations: { a: "Thanks for the quick reply" },
		});

		expect(result.toTranslate.map((c) => c.key)).toEqual(["b"]);
		expect(result.locallyResolved).toEqual({});
	});

	it("locally resolves clearly-English comments without calling the LLM", () => {
		const result = partitionCommentsForTranslation({
			keyedComments: [
				makeComment("eng", "Great service, thanks!"),
				makeComment("dk", "Tak for hjælpen"),
			],
			existingTranslations: {},
		});

		expect(result.toTranslate.map((c) => c.key)).toEqual(["dk"]);
		expect(result.locallyResolved).toEqual({ eng: null });
	});

	it("returns empty work when everything is cached or English", () => {
		const result = partitionCommentsForTranslation({
			keyedComments: [
				makeComment("cached", "anything"),
				makeComment("eng", "Very fast and good"),
			],
			existingTranslations: { cached: "translated already" },
		});

		expect(result.toTranslate).toEqual([]);
		expect(result.locallyResolved).toEqual({ eng: null });
	});

	it("sends ambiguous ASCII comments without a stopword to the LLM", () => {
		const result = partitionCommentsForTranslation({
			keyedComments: [makeComment("amb", "Bra service tak")],
			existingTranslations: {},
		});

		expect(result.toTranslate.map((c) => c.key)).toEqual(["amb"]);
		expect(result.locallyResolved).toEqual({});
	});
});
