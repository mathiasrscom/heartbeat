export type WallboardSeasonalTheme = "off" | "auto" | "halloween" | "christmas";

export type ActiveWallboardSeasonalTheme = Exclude<
	WallboardSeasonalTheme,
	"off" | "auto"
>;

export function normalizeWallboardSeasonalTheme(
	value: unknown,
): WallboardSeasonalTheme {
	return value === "auto" || value === "halloween" || value === "christmas"
		? value
		: "off";
}

/**
 * Automatic seasonal themes follow the wallboard's local calendar:
 * Halloween runs from 1–31 October and Christmas from 1–31 December.
 */
export function resolveWallboardSeasonalTheme(
	preference: WallboardSeasonalTheme,
	date = new Date(),
): ActiveWallboardSeasonalTheme | null {
	if (preference === "halloween" || preference === "christmas") {
		return preference;
	}
	if (preference !== "auto") return null;

	const month = date.getMonth();
	if (month === 9) return "halloween";
	if (month === 11) return "christmas";
	return null;
}
