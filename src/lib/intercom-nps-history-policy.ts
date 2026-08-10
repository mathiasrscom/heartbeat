import { createHash } from "node:crypto";

export function createNpsSignature(
	score: number | null,
	comment: string | null,
) {
	return createHash("sha256")
		.update(JSON.stringify([score, comment]))
		.digest("hex");
}

export function resolveNpsCaptureAction(
	previous: { score: number | null; comment: string | null } | null,
	next: { score: number | null; comment: string | null },
) {
	if (!previous) return next.score === null ? "none" : "response";
	if (previous.score !== next.score) {
		return next.score === null ? "none" : "response";
	}
	if (previous.comment !== next.comment) return "comment";
	return "none";
}
