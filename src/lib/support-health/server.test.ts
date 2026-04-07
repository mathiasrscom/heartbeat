import { describe, expect, it } from "vitest";
import { resolveSupportCaseSubtype } from "./server";

describe("support health server normalization", () => {
	it("treats conversation rows with embedded ticket payloads as tickets", () => {
		expect(
			resolveSupportCaseSubtype("conversation", {
				ticket: {
					id: "215560948759660",
					state: "open",
				},
			}),
		).toBe("ticket");
	});

	it("keeps plain conversations as conversations", () => {
		expect(
			resolveSupportCaseSubtype("conversation", {
				source: {
					id: "115180450",
				},
				ticket: {},
			}),
		).toBe("conversation");
	});

	it("keeps explicit tickets as tickets", () => {
		expect(resolveSupportCaseSubtype("ticket", {})).toBe("ticket");
	});
});
