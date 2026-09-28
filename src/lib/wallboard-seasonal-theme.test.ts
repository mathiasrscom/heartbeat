import { describe, expect, it } from "vitest";
import {
	normalizeWallboardSeasonalTheme,
	resolveWallboardSeasonalTheme,
} from "./wallboard-seasonal-theme";

describe("wallboard seasonal themes", () => {
	it("activates Halloween for all of October in automatic mode", () => {
		expect(resolveWallboardSeasonalTheme("auto", new Date(2026, 9, 1))).toBe(
			"halloween",
		);
		expect(resolveWallboardSeasonalTheme("auto", new Date(2026, 9, 31))).toBe(
			"halloween",
		);
	});

	it("activates Christmas for all of December in automatic mode", () => {
		expect(resolveWallboardSeasonalTheme("auto", new Date(2026, 11, 1))).toBe(
			"christmas",
		);
		expect(resolveWallboardSeasonalTheme("auto", new Date(2026, 11, 31))).toBe(
			"christmas",
		);
	});

	it("keeps automatic mode off outside the configured months", () => {
		expect(
			resolveWallboardSeasonalTheme("auto", new Date(2026, 8, 30)),
		).toBeNull();
		expect(
			resolveWallboardSeasonalTheme("auto", new Date(2026, 10, 1)),
		).toBeNull();
	});

	it("allows explicit themes at any time", () => {
		expect(
			resolveWallboardSeasonalTheme("halloween", new Date(2026, 0, 1)),
		).toBe("halloween");
		expect(
			resolveWallboardSeasonalTheme("christmas", new Date(2026, 0, 1)),
		).toBe("christmas");
	});

	it("normalizes unknown stored settings to off", () => {
		expect(normalizeWallboardSeasonalTheme("winter")).toBe("off");
		expect(normalizeWallboardSeasonalTheme("auto")).toBe("auto");
	});
});
