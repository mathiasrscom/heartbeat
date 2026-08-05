const CLIENT_ENTRY_PATTERN = /\/assets\/main-[^"'<>\s]+\.js(?:\?[^"'<>\s]*)?/g;

export function extractClientEntrySources(html: string) {
	return Array.from(new Set(html.match(CLIENT_ENTRY_PATTERN) ?? []));
}

export function shouldReloadForNewDeployment(
	currentSources: string[],
	nextHtml: string,
) {
	const current = new Set(
		currentSources.flatMap((source) => source.match(CLIENT_ENTRY_PATTERN) ?? []),
	);
	const next = extractClientEntrySources(nextHtml);
	if (current.size === 0 || next.length === 0) return false;
	return next.every((source) => !current.has(source));
}
