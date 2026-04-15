/**
 * Lists Intercom data attributes so we can find the NPS ones.
 *
 * - First prints anything matching /nps|promoter|detractor|recommend|csat|satisfaction|rating|feedback|survey/i
 *   across the contact, conversation, and ticket models.
 * - Then prints ALL custom attributes on each model as a fallback, so if the new
 *   NPS keys don't match the keywords above we can still spot them.
 *
 * Run with:
 *   pnpm tsx scripts/list-nps-attributes.ts
 *
 * Reads INTERCOM_ACCESS_TOKEN from env, or falls back to the stored credential
 * in `adapter_configs` (same resolution as jobs/index.ts).
 */

import { config } from "dotenv";
import { eq } from "drizzle-orm";

config({ path: [".env.local", ".env"] });

const HINT_PATTERN =
	/nps|promoter|detractor|recommend|csat|satisfaction|rating|feedback|survey/i;

type DataAttribute = {
	name: string;
	full_name?: string;
	label?: string;
	description?: string;
	data_type?: string;
	custom?: boolean;
	archived?: boolean;
	model?: string;
};

async function getAccessToken(): Promise<{
	token: string;
	appUrl?: string | null;
	apiBaseUrl?: string | null;
} | null> {
	if (process.env.INTERCOM_ACCESS_TOKEN) {
		return {
			token: process.env.INTERCOM_ACCESS_TOKEN,
			appUrl: process.env.INTERCOM_APP_URL ?? null,
			apiBaseUrl: process.env.INTERCOM_API_BASE_URL ?? null,
		};
	}

	const [{ db }, { adapterConfigs }] = await Promise.all([
		import("@/db"),
		import("@/db/schema"),
	]);

	const configRow = await db
		.select()
		.from(adapterConfigs)
		.where(eq(adapterConfigs.adapterId, "intercom"))
		.limit(1);

	if (!configRow[0]?.enabled) return null;

	const credentials = configRow[0].credentials as
		| Record<string, unknown>
		| undefined;
	const token =
		typeof credentials?.accessToken === "string" ? credentials.accessToken : null;
	if (!token) return null;

	return {
		token,
		appUrl:
			typeof credentials?.appUrl === "string" ? credentials.appUrl : null,
		apiBaseUrl:
			typeof credentials?.apiBaseUrl === "string"
				? credentials.apiBaseUrl
				: null,
	};
}

async function listDataAttributes(
	model: "contact" | "conversation" | "ticket",
	creds: { token: string; appUrl?: string | null; apiBaseUrl?: string | null },
): Promise<DataAttribute[]> {
	const { resolveIntercomApiBaseUrl } = await import("@/lib/intercom");
	const baseUrl = resolveIntercomApiBaseUrl({
		appUrl: creds.appUrl ?? null,
		apiBaseUrl: creds.apiBaseUrl ?? null,
	});

	const res = await fetch(
		`${baseUrl}/data_attributes?model=${model}&include_archived=true`,
		{
			headers: {
				Authorization: `Bearer ${creds.token}`,
				Accept: "application/json",
				"Intercom-Version": "2.14",
			},
		},
	);

	if (!res.ok) {
		// ticket model is sometimes unsupported on older accounts — degrade quietly
		if (model === "ticket" && res.status === 400) return [];
		throw new Error(
			`Intercom /data_attributes (${model}) failed: ${res.status} ${await res.text()}`,
		);
	}

	const body = (await res.json()) as { data?: DataAttribute[] };
	return body.data ?? [];
}

async function listTicketTypes(creds: {
	token: string;
	appUrl?: string | null;
	apiBaseUrl?: string | null;
}): Promise<Array<{ name: string; attributes: DataAttribute[] }>> {
	const { resolveIntercomApiBaseUrl } = await import("@/lib/intercom");
	const baseUrl = resolveIntercomApiBaseUrl({
		appUrl: creds.appUrl ?? null,
		apiBaseUrl: creds.apiBaseUrl ?? null,
	});

	const res = await fetch(`${baseUrl}/ticket_types`, {
		headers: {
			Authorization: `Bearer ${creds.token}`,
			Accept: "application/json",
			"Intercom-Version": "2.14",
		},
	});

	if (!res.ok) return [];

	const body = (await res.json()) as {
		data?: Array<{
			name: string;
			ticket_type_attributes?: { data?: DataAttribute[] };
		}>;
	};

	return (body.data ?? []).map((type) => ({
		name: type.name,
		attributes: type.ticket_type_attributes?.data ?? [],
	}));
}

function isHinted(attr: DataAttribute): boolean {
	return (
		HINT_PATTERN.test(attr.name ?? "") ||
		HINT_PATTERN.test(attr.full_name ?? "") ||
		HINT_PATTERN.test(attr.label ?? "") ||
		HINT_PATTERN.test(attr.description ?? "")
	);
}

function printAttrs(title: string, attrs: DataAttribute[]) {
	console.log(`\n${title}`);
	console.log("=".repeat(title.length));
	if (attrs.length === 0) {
		console.log("(none)");
		return;
	}
	for (const a of attrs) {
		const flags = [
			a.custom ? "custom" : "standard",
			a.archived ? "ARCHIVED" : null,
			a.data_type ?? null,
		]
			.filter(Boolean)
			.join(", ");
		const label = a.label && a.label !== a.name ? ` — "${a.label}"` : "";
		const desc = a.description ? `\n    ${a.description}` : "";
		console.log(`  • ${a.full_name ?? a.name}${label}  [${flags}]${desc}`);
	}
}

async function main() {
	const creds = await getAccessToken();
	if (!creds) {
		console.error("No Intercom access token configured.");
		process.exit(1);
	}

	const [contactAttrs, conversationAttrs, ticketAttrs] = await Promise.all([
		listDataAttributes("contact", creds),
		listDataAttributes("conversation", creds),
		listDataAttributes("ticket", creds),
	]);
	const ticketTypes = await listTicketTypes(creds);

	console.log("## Keyword-hinted matches");
	printAttrs(
		"Contact (hinted)",
		contactAttrs.filter(isHinted),
	);
	printAttrs(
		"Conversation (hinted)",
		conversationAttrs.filter(isHinted),
	);
	printAttrs(
		"Ticket (hinted)",
		ticketAttrs.filter(isHinted),
	);
	for (const type of ticketTypes) {
		const hinted = type.attributes.filter(isHinted);
		if (hinted.length > 0) {
			printAttrs(`Ticket type "${type.name}" (hinted)`, hinted);
		}
	}

	console.log("\n\n## All CUSTOM attributes (fallback — scan for NPS by eye)");
	printAttrs(
		"Contact (custom)",
		contactAttrs.filter((a) => a.custom),
	);
	printAttrs(
		"Conversation (custom)",
		conversationAttrs.filter((a) => a.custom),
	);
	printAttrs(
		"Ticket (custom)",
		ticketAttrs.filter((a) => a.custom),
	);
	for (const type of ticketTypes) {
		printAttrs(`Ticket type "${type.name}"`, type.attributes);
	}

	console.log(
		`\nScanned ${contactAttrs.length} contact, ${conversationAttrs.length} conversation, ${ticketAttrs.length} ticket attrs, and ${ticketTypes.length} ticket types.`,
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
