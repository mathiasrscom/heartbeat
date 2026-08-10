import { config } from "dotenv"
import { eq } from "drizzle-orm"

config({ path: [".env.local", ".env"] })

const DEFAULT_SYNC_INTERVAL_MINUTES = 5
const MIN_SYNC_INTERVAL_MINUTES = 1
const MAX_SYNC_INTERVAL_MINUTES = 60

async function getSyncIntervalMs() {
  try {
    const [{ db }, { adapterConfigs }] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
    ])
    const rows = await db
      .select({ settings: adapterConfigs.settings })
      .from(adapterConfigs)
      .where(eq(adapterConfigs.adapterId, "intercom"))
      .limit(1)
    const settings = rows[0]?.settings as Record<string, unknown> | undefined
    const configured = settings?.syncIntervalMinutes
    const minutes =
      typeof configured === "number" && Number.isFinite(configured)
        ? Math.min(
            MAX_SYNC_INTERVAL_MINUTES,
            Math.max(MIN_SYNC_INTERVAL_MINUTES, configured),
          )
        : DEFAULT_SYNC_INTERVAL_MINUTES
    return minutes * 60 * 1000
  } catch (error) {
    console.error("[workers] Failed to read sync interval; using 5 minutes", error)
    return DEFAULT_SYNC_INTERVAL_MINUTES * 60 * 1000
  }
}

async function getAccessToken() {
  if (process.env.INTERCOM_ACCESS_TOKEN) {
    return process.env.INTERCOM_ACCESS_TOKEN
  }

  const [{ db }, { adapterConfigs }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
  ])

  const configRow = await db
    .select()
    .from(adapterConfigs)
    .where(eq(adapterConfigs.adapterId, "intercom"))
    .limit(1)

  if (!configRow[0]?.enabled) {
    return null
  }

  const credentials = configRow[0]?.credentials as Record<string, unknown> | undefined
  return typeof credentials?.accessToken === "string"
    ? credentials.accessToken
    : null
}

async function runSyncCycle() {
  const { refreshWallboardContent, syncIntercom } = await import("@/lib/intercom-sync")
  const accessToken = await getAccessToken()

  try {
    if (!accessToken) {
      console.warn("[workers] No Intercom access token configured. Skipping sync.")
      return
    }

    console.info("[workers] Starting Intercom sync")
    const result = await syncIntercom(accessToken)

    if (result.skipped) {
      console.info("[workers] Intercom sync already running. Skipping this interval.")
      return
    }

    if (result.success) {
      console.info(
        `[workers] Intercom sync complete: ${result.nodesSynced} nodes, ${result.entitiesSynced} entities`
      )
      await refreshWallboardContent({ logPrefix: "[workers]" })
    } else {
      console.error("[workers] Intercom sync finished with errors", result.errors)
    }
  } catch (error) {
    console.error("[workers] Intercom sync crashed", error)
  }
}

async function start() {
  while (true) {
    await runSyncCycle()
    const intervalMs = await getSyncIntervalMs()
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

void start()
