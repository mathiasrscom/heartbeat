export const INTERCOM_SYNC_OVERLAP_SECONDS = 5 * 60;

/**
 * Start incremental searches slightly before the last successful checkpoint.
 * Upserts make replay safe, while the overlap protects updates committed near
 * a sync boundary from clock skew and long-running page traversal.
 */
export function resolveIntercomSyncCutoff(
	lastSuccessfulSyncAt: Date | null,
): number | null {
	if (!lastSuccessfulSyncAt) return null;
	return Math.max(
		0,
		Math.floor(lastSuccessfulSyncAt.getTime() / 1000) -
			INTERCOM_SYNC_OVERLAP_SECONDS,
	);
}

export function resolveSuccessfulSyncTimestamp(input: {
	previousSuccessfulSyncAt: Date | null;
	completedAt: Date;
	errors: string[];
}) {
	return input.errors.length === 0
		? input.completedAt
		: input.previousSuccessfulSyncAt;
}

export function shouldRefreshExistingCaseContact(
	previousSuccessfulSyncAt: Date | null,
) {
	return previousSuccessfulSyncAt !== null;
}
