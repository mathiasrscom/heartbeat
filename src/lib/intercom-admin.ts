import { eq } from "drizzle-orm"
import { createServerFn } from "@tanstack/react-start"
import { createIntercomClient } from "./intercom"

type JsonRecord = Record<string, unknown>

type IntercomStatus = "not-configured" | "configured" | "connected" | "error"
type TokenSource = "environment" | "database" | null

interface SaveIntercomInput {
  accessToken: string
}

interface SyncRunPayload {
  success: boolean
  nodesSynced: number
  entitiesSynced: number
  teamMembersSynced: number
  errors: string[]
}

export interface IntercomConnectionState {
  status: IntercomStatus
  statusLabel: string
  enabled: boolean
  hasAccessToken: boolean
  hasStoredToken: boolean
  tokenSource: TokenSource
  tokenHint: string | null
  verifiedAdminName: string | null
  verifiedAdminEmail: string | null
  lastVerifiedAt: string | null
  lastSyncAt: string | null
  lastError: string | null
  lastErrorAt: string | null
  nodesSynced: number
  entitiesSynced: number
  teamMembersSynced: number
  syncIntervalMinutes: number
  staleAfterMinutes: number
}

interface IntercomMutationResult {
  message: string
  state: IntercomConnectionState
  sync?: SyncRunPayload
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function normalizeToken(value: unknown) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function maskToken(value: string) {
  return value.length <= 4 ? "••••" : `••••${value.slice(-4)}`
}

function statusLabel(status: IntercomStatus) {
  switch (status) {
    case "connected":
      return "Connected"
    case "configured":
      return "Configured"
    case "error":
      return "Needs attention"
    default:
      return "Not configured"
  }
}

function emptyState(overrides: Partial<IntercomConnectionState> = {}): IntercomConnectionState {
  const status = overrides.status ?? "not-configured"

  return {
    status,
    statusLabel: overrides.statusLabel ?? statusLabel(status),
    enabled: overrides.enabled ?? false,
    hasAccessToken: overrides.hasAccessToken ?? false,
    hasStoredToken: overrides.hasStoredToken ?? false,
    tokenSource: overrides.tokenSource ?? null,
    tokenHint: overrides.tokenHint ?? null,
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
  }
}

async function getIntercomRows() {
  const [{ db }, { adapterConfigs, syncState }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
  ])

  const [configRows, syncRows] = await Promise.all([
    db.select().from(adapterConfigs).where(eq(adapterConfigs.adapterId, "intercom")).limit(1),
    db.select().from(syncState).where(eq(syncState.adapterId, "intercom")).limit(1),
  ])

  return {
    db,
    adapterConfigs,
    syncState,
    configRow: configRows[0] ?? null,
    syncRow: syncRows[0] ?? null,
  }
}

async function readIntercomState(): Promise<IntercomConnectionState> {
  let configRow: Awaited<ReturnType<typeof getIntercomRows>>["configRow"]
  let syncRow: Awaited<ReturnType<typeof getIntercomRows>>["syncRow"]

  try {
    const rows = await getIntercomRows()
    configRow = rows.configRow
    syncRow = rows.syncRow
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The database connection could not be initialized."

    return emptyState({
      status: "error",
      lastError: message,
    })
  }

  const credentials = isRecord(configRow?.credentials) ? configRow.credentials : {}
  const settings = isRecord(configRow?.settings) ? configRow.settings : {}

  const envToken = normalizeToken(process.env.INTERCOM_ACCESS_TOKEN)
  const storedToken = normalizeToken(credentials.accessToken)
  const tokenSource: TokenSource = envToken ? "environment" : storedToken ? "database" : null
  const hasAccessToken = Boolean(envToken || storedToken)

  const status: IntercomStatus = !hasAccessToken
    ? "not-configured"
    : syncRow?.lastError
      ? "error"
      : syncRow?.lastSyncAt
        ? "connected"
        : "configured"

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
    verifiedAdminName:
      typeof settings.lastVerifiedAdminName === "string"
        ? settings.lastVerifiedAdminName
        : null,
    verifiedAdminEmail:
      typeof settings.lastVerifiedAdminEmail === "string"
        ? settings.lastVerifiedAdminEmail
        : null,
    lastVerifiedAt:
      typeof settings.lastVerifiedAt === "string" ? settings.lastVerifiedAt : null,
    lastSyncAt: syncRow?.lastSyncAt ? syncRow.lastSyncAt.toISOString() : null,
    lastError: syncRow?.lastError ?? null,
    lastErrorAt: syncRow?.lastErrorAt ? syncRow.lastErrorAt.toISOString() : null,
    nodesSynced: syncRow?.nodesSynced ?? 0,
    entitiesSynced: syncRow?.entitiesSynced ?? 0,
    teamMembersSynced: syncRow?.teamMembersSynced ?? 0,
  })
}

async function getConfiguredAccessToken() {
  const envToken = normalizeToken(process.env.INTERCOM_ACCESS_TOKEN)
  if (envToken) return envToken

  const { configRow } = await getIntercomRows()
  if (!configRow?.enabled) return null

  const credentials = isRecord(configRow.credentials) ? configRow.credentials : {}
  return normalizeToken(credentials.accessToken)
}

async function upsertIntercomConfig(input: {
  accessToken: string
  verifiedAdminName: string | null
  verifiedAdminEmail: string | null
}) {
  const { db, adapterConfigs, syncState, configRow, syncRow } = await getIntercomRows()

  const existingSettings = isRecord(configRow?.settings) ? configRow.settings : {}

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
    },
    updatedAt: new Date(),
  }

  if (configRow) {
    await db
      .update(adapterConfigs)
      .set(values)
      .where(eq(adapterConfigs.adapterId, "intercom"))
  } else {
    await db.insert(adapterConfigs).values({
      ...values,
      createdAt: new Date(),
    })
  }

  if (!syncRow) return

  await db
    .update(syncState)
    .set({
      lastError: null,
      lastErrorAt: null,
      updatedAt: new Date(),
    })
    .where(eq(syncState.adapterId, "intercom"))
}

export const getIntercomConnectionState = createServerFn({ method: "GET" }).handler(
  async (): Promise<IntercomConnectionState> => readIntercomState()
)

export const saveIntercomConnection = createServerFn({ method: "POST" })
  .inputValidator((data: SaveIntercomInput) => data)
  .handler(async ({ data }): Promise<IntercomMutationResult> => {
    const accessToken = normalizeToken(data.accessToken)
    if (!accessToken) {
      throw new Error("Access token is required.")
    }

    const client = createIntercomClient({ accessToken })
    const me = await client.me()

    await upsertIntercomConfig({
      accessToken,
      verifiedAdminName: me.name ?? null,
      verifiedAdminEmail: me.email ?? null,
    })

    return {
      message: `Connected as ${me.email}. Run sync now to populate the wallboards.`,
      state: await readIntercomState(),
    }
  })

export const triggerIntercomSync = createServerFn({ method: "POST" }).handler(
  async (): Promise<IntercomMutationResult> => {
    const accessToken = await getConfiguredAccessToken()
    if (!accessToken) {
      throw new Error("Add an Intercom access token before running sync.")
    }

    const { syncIntercom } = await import("./intercom-sync")
    const sync = await syncIntercom(accessToken)

    return {
      message: sync.success
        ? "Intercom sync completed."
        : "Intercom sync finished with errors. Check the details below.",
      state: await readIntercomState(),
      sync,
    }
  }
)
