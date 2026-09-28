import { createServerFn } from "@tanstack/react-start";
import { eq, inArray } from "drizzle-orm";
import { createIntercomClient } from "./intercom";
import {
	getDefaultIntercomAppUrl,
	normalizeIntercomAppUrl,
} from "./intercom-links";
import {
	type IntercomSyncRuntime,
	readIntercomSyncRuntime,
} from "./intercom-sync-runtime";
import {
	listSupportTargetProducts,
	normalizeSupportTargetsConfig,
	readSupportTargetsFromSettings,
	type SupportTargetsConfig,
} from "./support-health/targets";
import type {
	SupportPeriodPreset,
	WallboardTeammateOption,
} from "./support-health/types";
import {
	DEFAULT_CODEX_MODEL,
	DEFAULT_OLLAMA_BASE_URL,
	type TickerLlmConfig,
	type WallboardLlmProvider,
} from "./wallboard-llm-config";
import {
	normalizeWallboardSeasonalTheme,
	type WallboardSeasonalTheme,
} from "./wallboard-seasonal-theme";

type JsonRecord = Record<string, unknown>;

type IntercomStatus = "not-configured" | "configured" | "connected" | "error";
type TokenSource = "environment" | "database" | null;
type TickerLlmProvider = WallboardLlmProvider;

interface SaveIntercomInput {
	accessToken: string;
}

interface SaveIntercomWorkspaceUrlInput {
	appUrl: string;
}

interface SaveIntercomTickerLlmSettingsInput {
	provider: TickerLlmProvider;
	model: string;
	baseUrl: string;
	authToken: string;
	removeAuthToken?: boolean;
}

interface SaveIntercomSupportTargetsInput {
	supportTargets: SupportTargetsConfig;
}

export type WallboardTheme = "light" | "dark";
export type WallboardPulsePeriod = Exclude<SupportPeriodPreset, "custom">;

interface SaveWallboardDisplayInput {
	theme: WallboardTheme;
	seasonalTheme: WallboardSeasonalTheme;
	seasonalAnimations: boolean;
	pulsePeriod: WallboardPulsePeriod;
	products: string[];
	trackedTeammates: string[];
}

interface SaveWallboardPulsePeriodInput {
	pulsePeriod: WallboardPulsePeriod;
}

interface ResetIntercomDataInput {
	confirmation: string;
}

interface ImportIntercomNpsExportInput {
	responses: unknown[];
}

interface ListIntercomTickerOllamaModelsInput {
	baseUrl: string;
	authToken?: string;
}

const INTERCOM_RESET_CONFIRMATION = "RESET INTERCOM";
const WALLBOARD_CACHE_SETTING_KEYS = [
	"intercom_sync_runtime",
	"intercom_nps_capture_initialized_at",
	"wallboard_live_focus_plan",
	"wallboard_product_insights",
	"wallboard_nps_themes",
	"wallboard_nps_comment_translations",
	"wallboard_ticker_messages",
];

interface SyncRunPayload {
	success: boolean;
	nodesSynced: number;
	entitiesSynced: number;
	teamMembersSynced: number;
	errors: string[];
}

export interface IntercomConnectionState {
	status: IntercomStatus;
	statusLabel: string;
	enabled: boolean;
	hasAccessToken: boolean;
	hasStoredToken: boolean;
	tokenSource: TokenSource;
	tokenHint: string | null;
	storedTokenHint: string | null;
	verifiedAdminName: string | null;
	verifiedAdminEmail: string | null;
	lastVerifiedAt: string | null;
	lastSyncAt: string | null;
	lastError: string | null;
	lastErrorAt: string | null;
	nodesSynced: number;
	entitiesSynced: number;
	teamMembersSynced: number;
	syncIntervalMinutes: number;
	staleAfterMinutes: number;
	isSyncRunning: boolean;
	syncStage: string | null;
	syncStageLabel: string | null;
	syncStartedAt: string | null;
	appUrl: string | null;
	tickerLlmProvider: TickerLlmProvider;
	tickerLlmEnabled: boolean;
	tickerLlmModel: string | null;
	tickerLlmBaseUrl: string | null;
	hasTickerLlmAuthToken: boolean;
	tickerLlmAuthTokenHint: string | null;
	supportTargets: SupportTargetsConfig;
	supportTargetProducts: string[];
	wallboardTheme: WallboardTheme;
	wallboardSeasonalTheme: WallboardSeasonalTheme;
	wallboardSeasonalAnimations: boolean;
	wallboardPulsePeriod: WallboardPulsePeriod;
	wallboardProducts: string[];
	wallboardTrackedTeammates: string[];
	availableWallboardTeammates: WallboardTeammateOption[];
}

interface IntercomMutationResult {
	message: string;
	state: IntercomConnectionState;
	sync?: SyncRunPayload;
}

export type IntercomTickerLlmSettings = TickerLlmConfig;

interface ListIntercomTickerOllamaModelsResult {
	baseUrl: string;
	models: string[];
}

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeToken(value: unknown) {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function normalizeTickerLlmModel(value: unknown) {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function normalizeTickerLlmBaseUrl(value: unknown) {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;

	try {
		const url = new URL(trimmed);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return null;
		}
		url.pathname = "";
		url.search = "";
		url.hash = "";
		return url.toString().replace(/\/$/, "");
	} catch {
		return null;
	}
}

function normalizeTickerLlmProvider(value: unknown): TickerLlmProvider {
	return value === "ollama" || value === "codex" ? value : null;
}

function getTickerLlmConfig(
	settings: JsonRecord,
	credentials: JsonRecord = {},
) {
	const provider =
		normalizeTickerLlmProvider(settings.tickerLlmProvider) ??
		(normalizeTickerLlmModel(settings.tickerLlmModel) ? "ollama" : null);
	const model =
		provider === "codex"
			? (normalizeTickerLlmModel(settings.tickerLlmModel) ??
				DEFAULT_CODEX_MODEL)
			: normalizeTickerLlmModel(settings.tickerLlmModel);
	const configuredBaseUrl = normalizeTickerLlmBaseUrl(
		settings.tickerLlmBaseUrl,
	);
	const enabled =
		settings.tickerLlmEnabled === true &&
		(provider === "codex" || (Boolean(model) && Boolean(configuredBaseUrl)));

	return {
		provider,
		enabled,
		model,
		baseUrl: configuredBaseUrl ?? DEFAULT_OLLAMA_BASE_URL,
		authToken: normalizeToken(credentials.tickerLlmAuthToken),
	};
}

function maskToken(value: string) {
	return value.length <= 4 ? "••••" : `••••${value.slice(-4)}`;
}

function statusLabel(status: IntercomStatus) {
	switch (status) {
		case "connected":
			return "Connected";
		case "configured":
			return "Configured";
		case "error":
			return "Needs attention";
		default:
			return "Not configured";
	}
}

function emptyState(
	overrides: Partial<IntercomConnectionState> = {},
): IntercomConnectionState {
	const status = overrides.status ?? "not-configured";

	return {
		status,
		statusLabel: overrides.statusLabel ?? statusLabel(status),
		enabled: overrides.enabled ?? false,
		hasAccessToken: overrides.hasAccessToken ?? false,
		hasStoredToken: overrides.hasStoredToken ?? false,
		tokenSource: overrides.tokenSource ?? null,
		tokenHint: overrides.tokenHint ?? null,
		storedTokenHint: overrides.storedTokenHint ?? null,
		verifiedAdminName: overrides.verifiedAdminName ?? null,
		verifiedAdminEmail: overrides.verifiedAdminEmail ?? null,
		lastVerifiedAt: overrides.lastVerifiedAt ?? null,
		lastSyncAt: overrides.lastSyncAt ?? null,
		lastError: overrides.lastError ?? null,
		lastErrorAt: overrides.lastErrorAt ?? null,
		nodesSynced: overrides.nodesSynced ?? 0,
		entitiesSynced: overrides.entitiesSynced ?? 0,
		teamMembersSynced: overrides.teamMembersSynced ?? 0,
		syncIntervalMinutes: overrides.syncIntervalMinutes ?? 5,
		staleAfterMinutes: overrides.staleAfterMinutes ?? 10,
		isSyncRunning: overrides.isSyncRunning ?? false,
		syncStage: overrides.syncStage ?? null,
		syncStageLabel: overrides.syncStageLabel ?? null,
		syncStartedAt: overrides.syncStartedAt ?? null,
		appUrl: overrides.appUrl ?? getDefaultIntercomAppUrl(),
		tickerLlmProvider: overrides.tickerLlmProvider ?? "ollama",
		tickerLlmEnabled: overrides.tickerLlmEnabled ?? false,
		tickerLlmModel: overrides.tickerLlmModel ?? null,
		tickerLlmBaseUrl: overrides.tickerLlmBaseUrl ?? null,
		hasTickerLlmAuthToken: overrides.hasTickerLlmAuthToken ?? false,
		tickerLlmAuthTokenHint: overrides.tickerLlmAuthTokenHint ?? null,
		supportTargets:
			overrides.supportTargets ?? normalizeSupportTargetsConfig(null),
		supportTargetProducts: overrides.supportTargetProducts ?? [],
		wallboardTheme: overrides.wallboardTheme ?? "dark",
		wallboardSeasonalTheme: overrides.wallboardSeasonalTheme ?? "off",
		wallboardSeasonalAnimations: overrides.wallboardSeasonalAnimations ?? true,
		wallboardPulsePeriod: overrides.wallboardPulsePeriod ?? "current-week",
		wallboardProducts: overrides.wallboardProducts ?? [],
		wallboardTrackedTeammates: overrides.wallboardTrackedTeammates ?? [],
		availableWallboardTeammates: overrides.availableWallboardTeammates ?? [],
	};
}

async function getIntercomRows() {
	const [{ db }, { adapterConfigs, syncState }] = await Promise.all([
		import("@/db"),
		import("@/db/schema"),
	]);

	const [configRows, syncRows] = await Promise.all([
		db
			.select()
			.from(adapterConfigs)
			.where(eq(adapterConfigs.adapterId, "intercom"))
			.limit(1),
		db
			.select()
			.from(syncState)
			.where(eq(syncState.adapterId, "intercom"))
			.limit(1),
	]);

	return {
		db,
		adapterConfigs,
		syncState,
		configRow: configRows[0] ?? null,
		syncRow: syncRows[0] ?? null,
	};
}

async function readAvailableWallboardTeammates(): Promise<
	WallboardTeammateOption[]
> {
	const [{ db }, { teamMembers }] = await Promise.all([
		import("@/db"),
		import("@/db/schema"),
	]);

	const rows = await db
		.select({
			externalId: teamMembers.externalId,
			name: teamMembers.name,
			avatarUrl: teamMembers.avatarUrl,
			isAvailable: teamMembers.isAvailable,
		})
		.from(teamMembers)
		.where(eq(teamMembers.source, "intercom"));

	return rows
		.filter(
			(row) =>
				typeof row.externalId === "string" &&
				row.externalId.trim().length > 0 &&
				typeof row.name === "string" &&
				row.name.trim().length > 0,
		)
		.map((row) => ({
			externalId: row.externalId.trim(),
			name: row.name.trim(),
			avatarUrl: row.avatarUrl ?? null,
			isAvailable: row.isAvailable !== false,
		}))
		.sort((left, right) => left.name.localeCompare(right.name));
}

async function readIntercomState(): Promise<IntercomConnectionState> {
	let configRow: Awaited<ReturnType<typeof getIntercomRows>>["configRow"];
	let syncRow: Awaited<ReturnType<typeof getIntercomRows>>["syncRow"];
	let availableWallboardTeammates: WallboardTeammateOption[] = [];
	let runtime: IntercomSyncRuntime = {
		isRunning: false,
		currentStage: "idle",
		currentStageLabel: null,
		startedAt: null,
		heartbeatAt: null,
	};

	try {
		const rows = await getIntercomRows();
		configRow = rows.configRow;
		syncRow = rows.syncRow;
		runtime = await readIntercomSyncRuntime();
		availableWallboardTeammates = await readAvailableWallboardTeammates();
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "The database connection could not be initialized.";

		return emptyState({
			status: "error",
			lastError: message,
		});
	}

	const credentials = isRecord(configRow?.credentials)
		? configRow.credentials
		: {};
	const settings = isRecord(configRow?.settings) ? configRow.settings : {};
	const tickerLlmCredentials = isRecord(configRow?.credentials)
		? configRow.credentials
		: {};
	const tickerLlm = getTickerLlmConfig(settings, tickerLlmCredentials);
	const tickerLlmModel = tickerLlm.model;
	const tickerLlmBaseUrl =
		tickerLlm.provider === "ollama"
			? normalizeTickerLlmBaseUrl(settings.tickerLlmBaseUrl)
			: null;
	const tickerLlmEnabled = tickerLlm.enabled;
	const supportTargets = readSupportTargetsFromSettings(settings);

	const envToken = normalizeToken(process.env.INTERCOM_ACCESS_TOKEN);
	const storedToken = normalizeToken(credentials.accessToken);
	const tokenSource: TokenSource = envToken
		? "environment"
		: storedToken
			? "database"
			: null;
	const hasAccessToken = Boolean(envToken || storedToken);

	const status: IntercomStatus = !hasAccessToken
		? "not-configured"
		: syncRow?.lastError
			? "error"
			: syncRow?.lastSyncAt
				? "connected"
				: "configured";

	return emptyState({
		status,
		enabled: Boolean(envToken || configRow?.enabled),
		hasAccessToken,
		hasStoredToken: Boolean(storedToken),
		tokenSource,
		tokenHint: envToken
			? "Using INTERCOM_ACCESS_TOKEN from the environment"
			: storedToken
				? `Stored token ${maskToken(storedToken)}`
				: null,
		storedTokenHint: storedToken
			? `Stored token ${maskToken(storedToken)}`
			: null,
		verifiedAdminName:
			typeof settings.lastVerifiedAdminName === "string"
				? settings.lastVerifiedAdminName
				: null,
		verifiedAdminEmail:
			typeof settings.lastVerifiedAdminEmail === "string"
				? settings.lastVerifiedAdminEmail
				: null,
		lastVerifiedAt:
			typeof settings.lastVerifiedAt === "string"
				? settings.lastVerifiedAt
				: null,
		lastSyncAt: syncRow?.lastSyncAt ? syncRow.lastSyncAt.toISOString() : null,
		lastError: syncRow?.lastError ?? null,
		lastErrorAt: syncRow?.lastErrorAt
			? syncRow.lastErrorAt.toISOString()
			: null,
		nodesSynced: syncRow?.nodesSynced ?? 0,
		entitiesSynced: syncRow?.entitiesSynced ?? 0,
		teamMembersSynced: syncRow?.teamMembersSynced ?? 0,
		isSyncRunning: runtime.isRunning,
		syncStage: runtime.currentStage === "idle" ? null : runtime.currentStage,
		syncStageLabel: runtime.currentStageLabel,
		syncStartedAt: runtime.startedAt,
		appUrl:
			normalizeIntercomAppUrl(settings.appUrl) ?? getDefaultIntercomAppUrl(),
		tickerLlmProvider: tickerLlm.provider,
		tickerLlmEnabled,
		tickerLlmModel,
		tickerLlmBaseUrl,
		hasTickerLlmAuthToken: Boolean(tickerLlm.authToken),
		tickerLlmAuthTokenHint: tickerLlm.authToken
			? maskToken(tickerLlm.authToken)
			: null,
		supportTargets,
		supportTargetProducts: listSupportTargetProducts(supportTargets),
		wallboardTheme: normalizeWallboardTheme(settings.wallboardTheme),
		wallboardSeasonalTheme: normalizeWallboardSeasonalTheme(
			settings.wallboardSeasonalTheme,
		),
		wallboardSeasonalAnimations: settings.wallboardSeasonalAnimations !== false,
		wallboardPulsePeriod: normalizeWallboardPulsePeriod(
			settings.wallboardPulsePeriod,
		),
		wallboardProducts: normalizeWallboardProducts(settings.wallboardProducts),
		wallboardTrackedTeammates: normalizeWallboardTrackedTeammates(
			settings.wallboardTrackedTeammates,
		).filter((externalId) =>
			availableWallboardTeammates.some(
				(teammate) => teammate.externalId === externalId,
			),
		),
		availableWallboardTeammates,
	});
}

async function getConfiguredAccessToken() {
	const envToken = normalizeToken(process.env.INTERCOM_ACCESS_TOKEN);
	if (envToken) return envToken;

	const { configRow } = await getIntercomRows();
	if (!configRow?.enabled) return null;

	const credentials = isRecord(configRow.credentials)
		? configRow.credentials
		: {};
	return normalizeToken(credentials.accessToken);
}

export async function readIntercomTickerLlmSettings(): Promise<IntercomTickerLlmSettings> {
	const { configRow } = await getIntercomRows();
	const settings = isRecord(configRow?.settings) ? configRow.settings : {};
	const credentials = isRecord(configRow?.credentials)
		? configRow.credentials
		: {};
	return getTickerLlmConfig(settings, credentials);
}

export async function readIntercomSupportTargets(): Promise<SupportTargetsConfig> {
	const { configRow } = await getIntercomRows();
	const settings = isRecord(configRow?.settings) ? configRow.settings : {};
	return readSupportTargetsFromSettings(settings);
}

async function upsertIntercomConfig(input: {
	accessToken: string;
	verifiedAdminName: string | null;
	verifiedAdminEmail: string | null;
}) {
	const { db, adapterConfigs, syncState, configRow, syncRow } =
		await getIntercomRows();

	const existingSettings = isRecord(configRow?.settings)
		? configRow.settings
		: {};

	const values = {
		adapterId: "intercom",
		name: "Intercom",
		enabled: true,
		credentials: {
			accessToken: input.accessToken,
		},
		settings: {
			...existingSettings,
			syncIntervalMinutes: 5,
			staleAfterMinutes: 10,
			lastVerifiedAdminName: input.verifiedAdminName,
			lastVerifiedAdminEmail: input.verifiedAdminEmail,
			lastVerifiedAt: new Date().toISOString(),
			appUrl:
				normalizeIntercomAppUrl(existingSettings.appUrl) ??
				getDefaultIntercomAppUrl(),
		},
		updatedAt: new Date(),
	};

	if (configRow) {
		await db
			.update(adapterConfigs)
			.set(values)
			.where(eq(adapterConfigs.adapterId, "intercom"));
	} else {
		await db.insert(adapterConfigs).values({
			...values,
			createdAt: new Date(),
		});
	}

	if (!syncRow) return;

	await db
		.update(syncState)
		.set({
			lastError: null,
			lastErrorAt: null,
			updatedAt: new Date(),
		})
		.where(eq(syncState.adapterId, "intercom"));
}

async function saveIntercomWorkspaceUrl(appUrl: string) {
	const normalizedAppUrl = normalizeIntercomAppUrl(appUrl);
	if (!normalizedAppUrl) {
		throw new Error("Enter a valid Intercom workspace link.");
	}

	const { db, adapterConfigs, configRow } = await getIntercomRows();
	const credentials = isRecord(configRow?.credentials)
		? configRow.credentials
		: {};
	const existingSettings = isRecord(configRow?.settings)
		? configRow.settings
		: {};

	const values = {
		adapterId: "intercom",
		name: "Intercom",
		enabled:
			configRow?.enabled ??
			Boolean(normalizeToken(process.env.INTERCOM_ACCESS_TOKEN)),
		credentials,
		settings: {
			...existingSettings,
			appUrl: normalizedAppUrl,
			syncIntervalMinutes:
				typeof existingSettings.syncIntervalMinutes === "number"
					? existingSettings.syncIntervalMinutes
					: 5,
			staleAfterMinutes:
				typeof existingSettings.staleAfterMinutes === "number"
					? existingSettings.staleAfterMinutes
					: 10,
		},
		updatedAt: new Date(),
	};

	if (configRow) {
		await db
			.update(adapterConfigs)
			.set(values)
			.where(eq(adapterConfigs.adapterId, "intercom"));
	} else {
		await db.insert(adapterConfigs).values({
			...values,
			createdAt: new Date(),
		});
	}
}

async function removeStoredIntercomConfigToken() {
	const envToken = normalizeToken(process.env.INTERCOM_ACCESS_TOKEN);
	const { db, adapterConfigs, syncState, configRow } = await getIntercomRows();

	if (!configRow) {
		return;
	}

	const credentials = isRecord(configRow.credentials)
		? configRow.credentials
		: {};
	const settings = isRecord(configRow.settings) ? configRow.settings : {};

	const nextCredentials = { ...credentials };
	delete nextCredentials.accessToken;

	const nextSettings = {
		...settings,
		...(envToken
			? {}
			: {
					lastVerifiedAdminName: null,
					lastVerifiedAdminEmail: null,
					lastVerifiedAt: null,
				}),
	};

	await db
		.update(adapterConfigs)
		.set({
			enabled: Boolean(envToken),
			credentials: nextCredentials,
			settings: nextSettings,
			updatedAt: new Date(),
		})
		.where(eq(adapterConfigs.adapterId, "intercom"));

	await db
		.update(syncState)
		.set({
			lastError: null,
			lastErrorAt: null,
			updatedAt: new Date(),
		})
		.where(eq(syncState.adapterId, "intercom"));
}

export const getIntercomConnectionState = createServerFn({
	method: "GET",
}).handler(async (): Promise<IntercomConnectionState> => readIntercomState());

export const saveIntercomConnection = createServerFn({ method: "POST" })
	.inputValidator((data: SaveIntercomInput) => data)
	.handler(async ({ data }): Promise<IntercomMutationResult> => {
		const accessToken = normalizeToken(data.accessToken);
		if (!accessToken) {
			throw new Error("Access token is required.");
		}

		const { configRow } = await getIntercomRows();
		const settings = isRecord(configRow?.settings) ? configRow.settings : {};
		const appUrl =
			normalizeIntercomAppUrl(settings.appUrl) ?? getDefaultIntercomAppUrl();

		const client = createIntercomClient({ accessToken, appUrl });
		const me = await client.me();

		await upsertIntercomConfig({
			accessToken,
			verifiedAdminName: me.name ?? null,
			verifiedAdminEmail: me.email ?? null,
		});

		return {
			message: `Connected as ${me.email}. Run sync now to populate the wallboards.`,
			state: await readIntercomState(),
		};
	});

export const triggerIntercomSync = createServerFn({ method: "POST" }).handler(
	async (): Promise<IntercomMutationResult> => {
		const accessToken = await getConfiguredAccessToken();
		if (!accessToken) {
			throw new Error("Add an Intercom access token before running sync.");
		}

		const runtime = await readIntercomSyncRuntime();
		if (runtime.isRunning) {
			return {
				message: runtime.currentStageLabel
					? `Intercom sync is already running: ${runtime.currentStageLabel}.`
					: "Intercom sync is already running.",
				state: await readIntercomState(),
			};
		}

		const { startIntercomSyncInBackground } = await import("./intercom-sync");
		await startIntercomSyncInBackground(accessToken);

		return {
			message: "Intercom sync started in the background.",
			state: await readIntercomState(),
		};
	},
);

export const importIntercomNpsHistory = createServerFn({ method: "POST" })
	.inputValidator((data: ImportIntercomNpsExportInput) => data)
	.handler(async ({ data }) => {
		const { importIntercomNpsExport } = await import(
			"./intercom-nps-export-import"
		);
		const result = await importIntercomNpsExport(data.responses);
		return {
			...result,
			message:
				result.importedCount === 0
					? `All ${result.alreadyImportedCount} NPS responses were already imported.`
					: `Imported ${result.importedCount} NPS responses (${result.matchedContactCount} linked to synced contacts).`,
		};
	});

export const resetIntercomDataAndSync = createServerFn({ method: "POST" })
	.inputValidator((data: ResetIntercomDataInput) => data)
	.handler(async ({ data }): Promise<IntercomMutationResult> => {
		if (data.confirmation !== INTERCOM_RESET_CONFIRMATION) {
			throw new Error(
				`Type ${INTERCOM_RESET_CONFIRMATION} to reset Intercom data.`,
			);
		}

		const accessToken = await getConfiguredAccessToken();
		if (!accessToken) {
			throw new Error("Add an Intercom access token before resetting data.");
		}

		const runtime = await readIntercomSyncRuntime();
		if (runtime.isRunning) {
			throw new Error(
				"Wait for the current Intercom sync to finish before reset.",
			);
		}

		const [{ db }, schema] = await Promise.all([
			import("@/db"),
			import("@/db/schema"),
		]);
		const {
			entities,
			nodes,
			npsContactState,
			npsResponses,
			settings,
			syncState,
			teamMembers,
		} = schema;

		const deletedNpsResponses = await db
			.delete(npsResponses)
			.where(eq(npsResponses.source, "intercom"))
			.returning({ id: npsResponses.id });
		await db
			.delete(npsContactState)
			.where(eq(npsContactState.source, "intercom"));

		const deletedNodes = await db
			.delete(nodes)
			.where(eq(nodes.source, "intercom"))
			.returning({ id: nodes.id });
		const deletedEntities = await db
			.delete(entities)
			.where(eq(entities.source, "intercom"))
			.returning({ id: entities.id });
		const deletedTeamMembers = await db
			.delete(teamMembers)
			.where(eq(teamMembers.source, "intercom"))
			.returning({ id: teamMembers.id });

		await db.delete(syncState).where(eq(syncState.adapterId, "intercom"));
		await db
			.delete(settings)
			.where(inArray(settings.key, WALLBOARD_CACHE_SETTING_KEYS));

		const { startIntercomSyncInBackground } = await import("./intercom-sync");
		const started = await startIntercomSyncInBackground(accessToken);

		return {
			message: started
				? `Intercom data reset: ${deletedNodes.length} cases, ${deletedEntities.length} contacts, ${deletedTeamMembers.length} teammates, and ${deletedNpsResponses.length} NPS responses removed. Fresh sync started.`
				: "Intercom data reset, but a sync was already running before the fresh sync could start.",
			state: await readIntercomState(),
		};
	});

export const saveIntercomWorkspaceLink = createServerFn({ method: "POST" })
	.inputValidator((data: SaveIntercomWorkspaceUrlInput) => data)
	.handler(async ({ data }): Promise<IntercomMutationResult> => {
		await saveIntercomWorkspaceUrl(data.appUrl);

		return {
			message: "Intercom workspace link saved.",
			state: await readIntercomState(),
		};
	});

export const saveIntercomTickerLlmSettings = createServerFn({ method: "POST" })
	.inputValidator((data: SaveIntercomTickerLlmSettingsInput) => data)
	.handler(async ({ data }): Promise<IntercomMutationResult> => {
		const provider = normalizeTickerLlmProvider(data.provider);
		const model = normalizeTickerLlmModel(data.model);
		const baseUrl = normalizeTickerLlmBaseUrl(data.baseUrl);
		const hasBaseUrlInput =
			typeof data.baseUrl === "string" && data.baseUrl.trim().length > 0;
		const enabled =
			provider === "codex"
				? true
				: provider === "ollama"
					? Boolean(model) && Boolean(baseUrl)
					: false;

		if (provider === "ollama" && hasBaseUrlInput && !baseUrl) {
			throw new Error(
				"Set a valid Ollama base URL, for example http://127.0.0.1:11434.",
			);
		}

		const { db, adapterConfigs, configRow } = await getIntercomRows();
		const credentials = isRecord(configRow?.credentials)
			? configRow.credentials
			: {};
		const submittedAuthToken = normalizeToken(data.authToken);
		const nextCredentials = { ...credentials };
		if (data.removeAuthToken) {
			delete nextCredentials.tickerLlmAuthToken;
		} else if (submittedAuthToken) {
			nextCredentials.tickerLlmAuthToken = submittedAuthToken;
		}
		const existingSettings = isRecord(configRow?.settings)
			? configRow.settings
			: {};

		const values = {
			adapterId: "intercom",
			name: "Intercom",
			enabled:
				configRow?.enabled ??
				Boolean(normalizeToken(process.env.INTERCOM_ACCESS_TOKEN)),
			credentials: nextCredentials,
			settings: {
				...existingSettings,
				tickerLlmProvider: provider,
				tickerLlmEnabled: enabled,
				tickerLlmModel: enabled && provider === "ollama" ? model : null,
				tickerLlmBaseUrl: enabled && provider === "ollama" ? baseUrl : null,
				syncIntervalMinutes:
					typeof existingSettings.syncIntervalMinutes === "number"
						? existingSettings.syncIntervalMinutes
						: 5,
				staleAfterMinutes:
					typeof existingSettings.staleAfterMinutes === "number"
						? existingSettings.staleAfterMinutes
						: 10,
				appUrl:
					normalizeIntercomAppUrl(existingSettings.appUrl) ??
					getDefaultIntercomAppUrl(),
			},
			updatedAt: new Date(),
		};

		if (configRow) {
			await db
				.update(adapterConfigs)
				.set(values)
				.where(eq(adapterConfigs.adapterId, "intercom"));
		} else {
			await db.insert(adapterConfigs).values({
				...values,
				createdAt: new Date(),
			});
		}

		return {
			message: enabled
				? provider === "codex"
					? `Codex CLI enabled with ${DEFAULT_CODEX_MODEL} for generated wallboard messages.`
					: `Ollama enabled with model ${model} for generated wallboard messages.`
				: provider === "ollama" && (hasBaseUrlInput || model)
					? "Ollama disabled. Add both base URL and model to enable."
					: "AI rewrite settings cleared and disabled.",
			state: await readIntercomState(),
		};
	});

export const saveIntercomSupportTargets = createServerFn({ method: "POST" })
	.inputValidator((data: SaveIntercomSupportTargetsInput) => data)
	.handler(async ({ data }): Promise<IntercomMutationResult> => {
		const supportTargets = normalizeSupportTargetsConfig(data.supportTargets);
		const { db, adapterConfigs, configRow } = await getIntercomRows();
		const credentials = isRecord(configRow?.credentials)
			? configRow.credentials
			: {};
		const existingSettings = isRecord(configRow?.settings)
			? configRow.settings
			: {};

		const values = {
			adapterId: "intercom",
			name: "Intercom",
			enabled:
				configRow?.enabled ??
				Boolean(normalizeToken(process.env.INTERCOM_ACCESS_TOKEN)),
			credentials,
			settings: {
				...existingSettings,
				supportTargets,
				syncIntervalMinutes:
					typeof existingSettings.syncIntervalMinutes === "number"
						? existingSettings.syncIntervalMinutes
						: 5,
				staleAfterMinutes:
					typeof existingSettings.staleAfterMinutes === "number"
						? existingSettings.staleAfterMinutes
						: 10,
				appUrl:
					normalizeIntercomAppUrl(existingSettings.appUrl) ??
					getDefaultIntercomAppUrl(),
			},
			updatedAt: new Date(),
		};

		if (configRow) {
			await db
				.update(adapterConfigs)
				.set(values)
				.where(eq(adapterConfigs.adapterId, "intercom"));
		} else {
			await db.insert(adapterConfigs).values({
				...values,
				createdAt: new Date(),
			});
		}

		return {
			message: "Support targets saved.",
			state: await readIntercomState(),
		};
	});

export const listIntercomTickerOllamaModels = createServerFn({ method: "POST" })
	.inputValidator((data: ListIntercomTickerOllamaModelsInput) => data)
	.handler(async ({ data }): Promise<ListIntercomTickerOllamaModelsResult> => {
		const baseUrl = normalizeTickerLlmBaseUrl(data.baseUrl);
		if (!baseUrl) {
			throw new Error(
				"Set a valid Ollama base URL, for example http://127.0.0.1:11434.",
			);
		}
		const storedConfig = await readIntercomTickerLlmSettings();
		const authToken = normalizeToken(data.authToken) ?? storedConfig.authToken;

		const response = await fetch(`${baseUrl}/api/tags`, {
			headers: {
				"content-type": "application/json",
				...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
			},
		});

		if (!response.ok) {
			const detail = await response.text();
			throw new Error(`Ollama API error (${response.status}): ${detail}`);
		}

		const payload = (await response.json()) as { models?: unknown };
		const seen = new Set<string>();
		const models: string[] = [];

		if (Array.isArray(payload.models)) {
			for (const entry of payload.models) {
				if (!isRecord(entry)) continue;
				const name = normalizeTickerLlmModel(entry.name);
				if (!name) continue;
				if (seen.has(name)) continue;
				seen.add(name);
				models.push(name);
			}
		}

		return {
			baseUrl,
			models: models.sort((a, b) => a.localeCompare(b)),
		};
	});

function normalizeWallboardTheme(value: unknown): WallboardTheme {
	return value === "light" ? "light" : "dark";
}

function normalizeWallboardPulsePeriod(value: unknown): WallboardPulsePeriod {
	const periods: WallboardPulsePeriod[] = [
		"current-week",
		"previous-week",
		"rolling-30-days",
		"rolling-90-days",
		"rolling-180-days",
	];
	return periods.includes(value as WallboardPulsePeriod)
		? (value as WallboardPulsePeriod)
		: "current-week";
}

function normalizeWallboardProducts(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter(
			(item): item is string =>
				typeof item === "string" && item.trim().length > 0,
		)
		.map((item) => item.trim());
}

function normalizeWallboardTrackedTeammates(value: unknown): string[] {
	if (!Array.isArray(value)) return [];

	const seen = new Set<string>();
	const teammates: string[] = [];

	for (const item of value) {
		if (typeof item !== "string") continue;
		const normalized = item.trim();
		if (!normalized || seen.has(normalized)) continue;
		seen.add(normalized);
		teammates.push(normalized);
	}

	return teammates;
}

export const saveWallboardDisplaySettings = createServerFn({ method: "POST" })
	.inputValidator((data: SaveWallboardDisplayInput) => data)
	.handler(async ({ data }): Promise<IntercomMutationResult> => {
		const theme = normalizeWallboardTheme(data.theme);
		const seasonalTheme = normalizeWallboardSeasonalTheme(data.seasonalTheme);
		const seasonalAnimations = data.seasonalAnimations !== false;
		const pulsePeriod = normalizeWallboardPulsePeriod(data.pulsePeriod);
		const products = normalizeWallboardProducts(data.products);
		const trackedTeammates = normalizeWallboardTrackedTeammates(
			data.trackedTeammates,
		);

		const { db, adapterConfigs, configRow } = await getIntercomRows();
		const credentials = isRecord(configRow?.credentials)
			? configRow.credentials
			: {};
		const existingSettings = isRecord(configRow?.settings)
			? configRow.settings
			: {};

		const values = {
			adapterId: "intercom",
			name: "Intercom",
			enabled:
				configRow?.enabled ??
				Boolean(normalizeToken(process.env.INTERCOM_ACCESS_TOKEN)),
			credentials,
			settings: {
				...existingSettings,
				wallboardTheme: theme,
				wallboardSeasonalTheme: seasonalTheme,
				wallboardSeasonalAnimations: seasonalAnimations,
				wallboardPulsePeriod: pulsePeriod,
				wallboardProducts: products,
				wallboardTrackedTeammates: trackedTeammates,
			},
			updatedAt: new Date(),
		};

		if (configRow) {
			await db
				.update(adapterConfigs)
				.set(values)
				.where(eq(adapterConfigs.adapterId, "intercom"));
		} else {
			await db.insert(adapterConfigs).values({
				...values,
				createdAt: new Date(),
			});
		}

		return {
			message: `Wallboard display updated: ${theme} mode, ${seasonalTheme} seasonal theme, ${pulsePeriod.replaceAll("-", " ")} Pulse period, ${products.length === 0 ? "all products" : `${products.length} product${products.length === 1 ? "" : "s"}`}, ${trackedTeammates.length} tracked teammate${trackedTeammates.length === 1 ? "" : "s"}.`,
			state: await readIntercomState(),
		};
	});

export const saveWallboardPulsePeriod = createServerFn({ method: "POST" })
	.inputValidator((data: SaveWallboardPulsePeriodInput) => data)
	.handler(async ({ data }): Promise<IntercomMutationResult> => {
		const pulsePeriod = normalizeWallboardPulsePeriod(data.pulsePeriod);
		const { db, adapterConfigs, configRow } = await getIntercomRows();
		const existingSettings = isRecord(configRow?.settings)
			? configRow.settings
			: {};
		const values = {
			adapterId: "intercom",
			name: "Intercom",
			enabled:
				configRow?.enabled ??
				Boolean(normalizeToken(process.env.INTERCOM_ACCESS_TOKEN)),
			credentials: isRecord(configRow?.credentials)
				? configRow.credentials
				: {},
			settings: {
				...existingSettings,
				wallboardPulsePeriod: pulsePeriod,
			},
			updatedAt: new Date(),
		};

		if (configRow) {
			await db
				.update(adapterConfigs)
				.set(values)
				.where(eq(adapterConfigs.adapterId, "intercom"));
		} else {
			await db.insert(adapterConfigs).values({
				...values,
				createdAt: new Date(),
			});
		}

		return {
			message: `Pulse period updated to ${pulsePeriod.replaceAll("-", " ")}.`,
			state: await readIntercomState(),
		};
	});

export const removeIntercomConnection = createServerFn({
	method: "POST",
}).handler(async (): Promise<IntercomMutationResult> => {
	await removeStoredIntercomConfigToken();

	return {
		message: normalizeToken(process.env.INTERCOM_ACCESS_TOKEN)
			? "Stored database token removed. The app is still using the environment token."
			: "Stored database token removed.",
		state: await readIntercomState(),
	};
});
