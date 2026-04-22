const MAX_TRANSLATION_LENGTH = 220;

function clampText(value: string, max = MAX_TRANSLATION_LENGTH) {
	const trimmed = value.replace(/\s+/g, " ").trim();
	if (trimmed.length <= max) return trimmed;
	return `${trimmed.slice(0, max - 1).trim()}…`;
}

function normalizeForCompare(value: string) {
	return value
		.toLowerCase()
		.replace(/[“”„"']/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.replace(/\s+/g, " ");
}

export function getEnglishNpsCommentToDisplay(
	comment: string,
	englishComment: string | null | undefined,
) {
	if (typeof englishComment !== "string") return null;
	const normalized = clampText(englishComment, MAX_TRANSLATION_LENGTH);
	if (!normalized) return null;
	if (normalizeForCompare(comment) === normalizeForCompare(normalized)) {
		return null;
	}
	return normalized;
}
