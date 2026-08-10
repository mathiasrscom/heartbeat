import { strFromU8, unzipSync } from "fflate";

export interface IntercomNpsExportRow {
	receiptId: string;
	contactExternalId: string;
	name: string | null;
	email: string | null;
	score: number;
	comment: string | null;
	receivedAt: string | null;
	respondedAt: string;
	scoreQuestion: string;
}

function parseCsv(text: string) {
	const rows: string[][] = [];
	let row: string[] = [];
	let value = "";
	let quoted = false;

	for (let index = 0; index < text.length; index += 1) {
		const character = text[index];
		if (quoted) {
			if (character === '"' && text[index + 1] === '"') {
				value += '"';
				index += 1;
			} else if (character === '"') {
				quoted = false;
			} else {
				value += character;
			}
		} else if (character === '"') {
			quoted = true;
		} else if (character === ",") {
			row.push(value);
			value = "";
		} else if (character === "\n") {
			row.push(value.endsWith("\r") ? value.slice(0, -1) : value);
			rows.push(row);
			row = [];
			value = "";
		} else {
			value += character;
		}
	}

	if (quoted) throw new Error("The NPS CSV contains an unclosed quoted value.");
	if (value.length > 0 || row.length > 0) {
		row.push(value.endsWith("\r") ? value.slice(0, -1) : value);
		rows.push(row);
	}

	return rows;
}

function normalizeOptional(value: string | undefined) {
	const normalized = value?.trim() ?? "";
	return normalized.length > 0 ? normalized : null;
}

function requireColumn(headers: string[], name: string) {
	const index = headers.indexOf(name);
	if (index === -1) throw new Error(`The NPS export is missing ${name}.`);
	return index;
}

export function parseIntercomNpsCombinedCsv(
	text: string,
	answeredAtByReceipt: ReadonlyMap<string, string> = new Map(),
) {
	const csvRows = parseCsv(text.replace(/^\uFEFF/, ""));
	const headers = csvRows.shift();
	if (!headers) throw new Error("The NPS export CSV is empty.");

	const receiptIndex = requireColumn(headers, "receipt_id");
	const contactIndex = requireColumn(headers, "user_id");
	const nameIndex = requireColumn(headers, "name");
	const emailIndex = requireColumn(headers, "email");
	const receivedIndex = requireColumn(headers, "received_at");
	const completedIndex = requireColumn(headers, "completed_at");
	const scoreIndex = headers.findIndex((header) =>
		header.toLowerCase().startsWith("how likely are you to recommend"),
	);
	const commentIndex = headers.findIndex((header) =>
		header.toLowerCase().startsWith("what is the main reason"),
	);
	if (scoreIndex === -1) {
		throw new Error("The combined answer CSV has no NPS rating question.");
	}

	const seenReceipts = new Set<string>();
	const parsed: IntercomNpsExportRow[] = [];
	for (const [rowIndex, row] of csvRows.entries()) {
		if (row.every((cell) => cell.trim().length === 0)) continue;
		const receiptId = row[receiptIndex]?.trim();
		const contactExternalId = row[contactIndex]?.trim();
		const respondedAt =
			answeredAtByReceipt.get(receiptId) ?? row[completedIndex]?.trim();
		const score = Number(row[scoreIndex]?.trim());
		const lineNumber = rowIndex + 2;

		if (!receiptId || !contactExternalId || !respondedAt) {
			throw new Error(
				`NPS export row ${lineNumber} is missing an identifier or completion date.`,
			);
		}
		if (!Number.isInteger(score) || score < 0 || score > 10) {
			throw new Error(`NPS export row ${lineNumber} has an invalid score.`);
		}
		if (Number.isNaN(new Date(respondedAt).getTime())) {
			throw new Error(
				`NPS export row ${lineNumber} has an invalid completion date.`,
			);
		}
		if (seenReceipts.has(receiptId)) continue;
		seenReceipts.add(receiptId);

		parsed.push({
			receiptId,
			contactExternalId,
			name: normalizeOptional(row[nameIndex]),
			email: normalizeOptional(row[emailIndex]),
			score,
			comment:
				commentIndex === -1 ? null : normalizeOptional(row[commentIndex]),
			receivedAt: normalizeOptional(row[receivedIndex]),
			respondedAt,
			scoreQuestion: headers[scoreIndex],
		});
	}

	if (parsed.length === 0) {
		throw new Error("The NPS export contains no completed responses.");
	}
	return parsed;
}

function parseRatingAnswerDates(text: string) {
	const csvRows = parseCsv(text.replace(/^\uFEFF/, ""));
	const headers = csvRows.shift();
	if (!headers) throw new Error("The NPS answer CSV is empty.");
	const receiptIndex = requireColumn(headers, "receipt_id");
	const answeredIndex = requireColumn(headers, "answered_at");
	const responseTypeIndex = requireColumn(headers, "response_type");
	const answerDates = new Map<string, string>();

	for (const row of csvRows) {
		if (row[responseTypeIndex]?.trim() !== "rating_scale") continue;
		const receiptId = row[receiptIndex]?.trim();
		const answeredAt = row[answeredIndex]?.trim();
		if (receiptId && answeredAt) answerDates.set(receiptId, answeredAt);
	}
	return answerDates;
}

export function readIntercomNpsExport(fileName: string, bytes: Uint8Array) {
	if (fileName.toLowerCase().endsWith(".csv")) {
		return parseIntercomNpsCombinedCsv(strFromU8(bytes));
	}
	if (!fileName.toLowerCase().endsWith(".zip")) {
		throw new Error(
			"Choose the Intercom ZIP export or its answer_combined CSV.",
		);
	}

	const files = unzipSync(bytes);
	const combinedEntry = Object.entries(files).find(([name]) =>
		/(^|\/)answer_combined_[^/]+\.csv$/i.test(name),
	);
	if (!combinedEntry) {
		throw new Error("The ZIP does not contain an answer_combined CSV.");
	}
	const answerEntry = Object.entries(files).find(([name]) =>
		/(^|\/)answer_(?!combined_)[^/]+\.csv$/i.test(name),
	);
	if (!answerEntry) {
		throw new Error(
			"The ZIP does not contain the answer CSV with response dates.",
		);
	}
	return parseIntercomNpsCombinedCsv(
		strFromU8(combinedEntry[1]),
		parseRatingAnswerDates(strFromU8(answerEntry[1])),
	);
}
