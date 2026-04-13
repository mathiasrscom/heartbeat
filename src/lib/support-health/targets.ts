import { getKnownSupportProducts, normalizeSupportProductName } from "./policy";

type JsonRecord = Record<string, unknown>;

export interface SupportPerformanceTargets {
	slaTargetPercent: number;
	satisfactionTargetPercent: number;
}

export interface SupportTargetsConfig {
	defaultTargets: SupportPerformanceTargets;
	productTargets: Record<string, SupportPerformanceTargets>;
}

export const DEFAULT_SUPPORT_TARGETS: SupportPerformanceTargets = {
	slaTargetPercent: 90,
	satisfactionTargetPercent: 90,
};

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeProductKey(value: string) {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function clampTarget(value: unknown, fallback: number) {
	const numeric =
		typeof value === "number"
			? value
			: typeof value === "string" && value.trim().length > 0
				? Number(value)
				: Number.NaN;

	if (!Number.isFinite(numeric)) return fallback;
	return Math.min(100, Math.max(0, Number(numeric.toFixed(1))));
}

function normalizeTargets(
	value: unknown,
	fallback: SupportPerformanceTargets,
): SupportPerformanceTargets {
	const record = isRecord(value) ? value : {};
	return {
		slaTargetPercent: clampTarget(
			record.slaTargetPercent,
			fallback.slaTargetPercent,
		),
		satisfactionTargetPercent: clampTarget(
			record.satisfactionTargetPercent,
			fallback.satisfactionTargetPercent,
		),
	};
}

function canonicalizeProductName(value: string) {
	return normalizeSupportProductName(value);
}

export function normalizeSupportTargetsConfig(
	value: unknown,
): SupportTargetsConfig {
	const raw = isRecord(value) ? value : {};
	const defaultTargets = normalizeTargets(
		isRecord(raw.defaultTargets) ? raw.defaultTargets : raw.defaults,
		DEFAULT_SUPPORT_TARGETS,
	);
	const rawProducts = isRecord(raw.productTargets)
		? raw.productTargets
		: isRecord(raw.products)
			? raw.products
			: {};
	const productTargets: Record<string, SupportPerformanceTargets> = {};

	for (const [productName, targets] of Object.entries(rawProducts)) {
		const canonicalProductName = canonicalizeProductName(productName);
		if (!canonicalProductName) continue;
		productTargets[canonicalProductName] = normalizeTargets(
			targets,
			defaultTargets,
		);
	}

	return {
		defaultTargets,
		productTargets,
	};
}

export function readSupportTargetsFromSettings(
	settings: unknown,
): SupportTargetsConfig {
	if (!isRecord(settings)) {
		return normalizeSupportTargetsConfig(null);
	}

	return normalizeSupportTargetsConfig(settings.supportTargets);
}

export function listSupportTargetProducts(config: SupportTargetsConfig) {
	const knownProducts = getKnownSupportProducts();
	const extras = Object.keys(config.productTargets)
		.filter((productName) => !knownProducts.includes(productName))
		.sort((left, right) => left.localeCompare(right));

	return [...knownProducts, ...extras];
}

export function resolveSupportTargets(
	config: SupportTargetsConfig,
	productName: string | null | undefined,
) {
	if (!productName) return config.defaultTargets;

	const canonicalProductName =
		normalizeSupportProductName(productName) ?? productName;
	const direct = config.productTargets[canonicalProductName];
	if (direct) return direct;

	const normalized = normalizeProductKey(canonicalProductName);
	const alias = Object.entries(config.productTargets).find(
		([candidate]) => normalizeProductKey(candidate) === normalized,
	);
	return alias?.[1] ?? config.defaultTargets;
}

export function resolveSelectedSupportTargets(
	config: SupportTargetsConfig,
	selectedProducts: string[],
) {
	if (selectedProducts.length !== 1) return config.defaultTargets;
	return resolveSupportTargets(config, selectedProducts[0]);
}
