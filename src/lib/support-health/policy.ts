import type { SupportServiceBucket } from "./types";

type JsonRecord = Record<string, unknown>;

interface ProductPolicyRule {
	id: string;
	label: string;
	bucket: SupportServiceBucket;
	policyName: string;
	matchTerms: string[];
}

interface ClassificationInput {
	title: string | null;
	description: string | null;
	tags: string[];
	queueName: string;
	rawData: unknown;
}

export interface SupportCaseClassification {
	productName: string;
	serviceBucket: SupportServiceBucket;
	servicePolicyName: string;
}

const SUPPORT_PRODUCT_ALIASES: Record<string, string> = {
	"aftale portalen": "Aftaleportalen",
	cvr: "Pension Broker",
	pensionbroker: "Pension Broker",
};

const PRODUCT_VIEW_EXCLUDED_TICKET_TYPES = new Set([
	"developer",
	"feature request",
	"internal task",
	"issue tracker",
	"knowledge",
]);

const PRODUCT_VIEW_EXCLUDED_TEAM_ASSIGNMENTS = new Set(["developer"]);

const PRODUCT_VIEW_EXCLUDED_ASSIGNEES: Record<string, Set<string>> = {
	"Addo Sign": new Set(["fin"]),
};

const PRODUCT_POLICY_RULES: ProductPolicyRule[] = [
	{
		id: "addo-sign",
		label: "Addo Sign",
		bucket: "headline",
		policyName: "Standard workflow",
		matchTerms: ["addo sign", "addosign"],
	},
	{
		id: "twoday",
		label: "twoday",
		bucket: "headline",
		policyName: "Standard workflow",
		matchTerms: ["twoday"],
	},
	{
		id: "pension-broker",
		label: "Pension Broker",
		bucket: "exception",
		policyName: "Separate workflow",
		matchTerms: ["pension broker", "pensionbroker", "cvr"],
	},
	{
		id: "aftaleportalen",
		label: "Aftaleportalen",
		bucket: "exception",
		policyName: "Separate workflow",
		matchTerms: ["aftaleportalen", "aftale portalen"],
	},
];

export function getKnownSupportProducts() {
	return PRODUCT_POLICY_RULES.map((rule) => rule.label);
}

const GENERIC_QUEUE_NAMES = new Set([
	"general",
	"support",
	"customer support",
	"shared inbox",
	"inbox",
	"team inbox",
	"ticket",
	"tickets",
	"conversation",
	"conversations",
]);

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getNestedValue(obj: unknown, path: string[]) {
	let current = obj;
	for (const key of path) {
		if (!isRecord(current)) return undefined;
		if (key in current) {
			current = current[key];
			continue;
		}

		const lookup = key.toLowerCase();
		const matchingKey = Object.keys(current).find(
			(candidate) => candidate.toLowerCase() === lookup,
		);
		if (!matchingKey) return undefined;

		current = current[matchingKey];
	}
	return current;
}

function normalizeSearchValue(value: string) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.replace(/\s+/g, " ");
}

function formatProductLabel(value: string) {
	const trimmed = value.trim();
	if (!trimmed) return "Unmapped";

	return trimmed
		.split(/\s+/)
		.map((part) => {
			if (/^[A-Z0-9]+$/.test(part)) {
				return part.toUpperCase();
			}

			return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
		})
		.join(" ");
}

export function normalizeSupportProductName(value: string | null | undefined) {
	const trimmed = value?.trim();
	if (!trimmed) return null;

	const normalized = normalizeSearchValue(trimmed);
	const alias = SUPPORT_PRODUCT_ALIASES[normalized];
	if (alias) return alias;

	const knownProduct = PRODUCT_POLICY_RULES.find(
		(rule) => normalizeSearchValue(rule.label) === normalized,
	)?.label;
	if (knownProduct) return knownProduct;

	return formatProductLabel(trimmed);
}

function isGenericQueueName(value: string) {
	return GENERIC_QUEUE_NAMES.has(normalizeSearchValue(value));
}

function getStringCandidate(value: unknown) {
	if (typeof value === "string" && value.trim().length > 0) {
		return value.trim();
	}

	if (isRecord(value)) {
		const nested = [value.name, value.label, value.value, value.title];
		for (const candidate of nested) {
			if (typeof candidate === "string" && candidate.trim().length > 0) {
				return candidate.trim();
			}
		}
	}

	return null;
}

function getExplicitProduct(rawData: unknown) {
	const candidates = [
		getNestedValue(rawData, ["product"]),
		getNestedValue(rawData, ["product_name"]),
		getNestedValue(rawData, ["brand"]),
		getNestedValue(rawData, ["brand_name"]),
		getNestedValue(rawData, ["ticket_attributes", "product"]),
		getNestedValue(rawData, ["ticket_attributes", "product_name"]),
		getNestedValue(rawData, ["ticket_attributes", "brand"]),
		getNestedValue(rawData, ["ticket_attributes", "brand_name"]),
		getNestedValue(rawData, ["custom_attributes", "product"]),
		getNestedValue(rawData, ["custom_attributes", "product_name"]),
		getNestedValue(rawData, ["custom_attributes", "brand"]),
		getNestedValue(rawData, ["custom_attributes", "brand_name"]),
	];

	for (const candidate of candidates) {
		const resolved = getStringCandidate(candidate);
		if (resolved) {
			return resolved;
		}
	}

	return null;
}

function getTicketTypeForProductView(rawData: unknown) {
	const candidates = [
		getNestedValue(rawData, ["ticket", "ticket_type"]),
		getNestedValue(rawData, ["ticket_type", "name"]),
		getNestedValue(rawData, ["ticket_type"]),
	];

	for (const candidate of candidates) {
		const resolved = getStringCandidate(candidate);
		if (resolved) return resolved;
	}

	return null;
}

function getTeamAssignmentForProductView(rawData: unknown) {
	const candidates = [
		getNestedValue(rawData, ["team_assignee", "name"]),
		getNestedValue(rawData, ["team_assignee"]),
		getNestedValue(rawData, ["team", "name"]),
	];

	for (const candidate of candidates) {
		const resolved = getStringCandidate(candidate);
		if (resolved) return resolved;
	}

	return null;
}

function matchesRule(
	rule: ProductPolicyRule,
	haystack: string,
	tokens: Set<string>,
) {
	return rule.matchTerms.some((term) => {
		const normalized = normalizeSearchValue(term);
		if (!normalized) return false;
		if (normalized.includes(" ")) return haystack.includes(normalized);
		return tokens.has(normalized);
	});
}

export function classifySupportCase(
	input: ClassificationInput,
): SupportCaseClassification {
	const explicitProduct = getExplicitProduct(input.rawData);
	const searchFragments = [
		explicitProduct,
		input.queueName,
		input.title,
		input.description,
		...input.tags,
	]
		.filter(
			(value): value is string =>
				typeof value === "string" && value.trim().length > 0,
		)
		.map(normalizeSearchValue);

	const haystack = searchFragments.join(" ");
	const tokens = new Set(haystack.split(" ").filter(Boolean));

	const matchedRule = PRODUCT_POLICY_RULES.find((rule) =>
		matchesRule(rule, haystack, tokens),
	);
	if (matchedRule) {
		return {
			productName: matchedRule.label,
			serviceBucket: matchedRule.bucket,
			servicePolicyName: matchedRule.policyName,
		};
	}

	if (explicitProduct) {
		return {
			productName: normalizeSupportProductName(explicitProduct) ?? "Unmapped",
			serviceBucket: "headline",
			servicePolicyName: "Standard workflow",
		};
	}

	if (input.queueName && !isGenericQueueName(input.queueName)) {
		return {
			productName: normalizeSupportProductName(input.queueName) ?? "Unmapped",
			serviceBucket: "headline",
			servicePolicyName: "Standard workflow",
		};
	}

	return {
		productName: "Unmapped",
		serviceBucket: "unknown",
		servicePolicyName: "Unmapped",
	};
}

export function resolveSupportCaseProductViews(input: {
	productName: string;
	assigneeName: string | null;
	rawData: unknown;
}) {
	if (input.productName === "Unmapped") {
		return [];
	}

	const normalizedProductName =
		normalizeSupportProductName(input.productName) ?? input.productName;
	const ticketType = getTicketTypeForProductView(input.rawData);
	if (
		ticketType &&
		PRODUCT_VIEW_EXCLUDED_TICKET_TYPES.has(normalizeSearchValue(ticketType))
	) {
		return [];
	}

	const teamAssignment = getTeamAssignmentForProductView(input.rawData);
	if (
		teamAssignment &&
		PRODUCT_VIEW_EXCLUDED_TEAM_ASSIGNMENTS.has(
			normalizeSearchValue(teamAssignment),
		)
	) {
		return [];
	}

	const assigneeName = input.assigneeName?.trim();
	if (assigneeName) {
		const excludedAssignees =
			PRODUCT_VIEW_EXCLUDED_ASSIGNEES[normalizedProductName];
		if (
			excludedAssignees?.has(normalizeSearchValue(assigneeName))
		) {
			return [];
		}
	}

	return [normalizedProductName];
}
