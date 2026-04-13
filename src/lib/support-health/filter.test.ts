import { describe, expect, it } from "vitest";
import { normalizeSupportProductFilterInput } from "./filter";

describe("support product filter", () => {
	it("normalizes a comma-separated query string", () => {
		expect(
			normalizeSupportProductFilterInput({
				products: "Addo Sign, twoday, Addo Sign",
			}),
		).toEqual({
			products: ["Addo Sign", "twoday"],
		});
	});

	it("normalizes an array input", () => {
		expect(
			normalizeSupportProductFilterInput({
				products: ["Addo Sign", "twoday", "twoday"],
			}),
		).toEqual({
			products: ["Addo Sign", "twoday"],
		});
	});

	it("treats Aftaleportalen and CVR as the same product", () => {
		expect(
			normalizeSupportProductFilterInput({
				products: ["Aftaleportalen", "CVR", "aftaleportalen"],
			}),
		).toEqual({
			products: ["CVR"],
		});
	});
});
