import { config } from "dotenv"
import { eq } from "drizzle-orm"

config({ path: [".env.local", ".env"] })

const SYNC_INTERVAL_MS = 5 * 60 * 1000

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
    } else {
      console.error("[workers] Intercom sync finished with errors", result.errors)
    }

    await refreshWallboardContent({ logPrefix: "[workers]" })
  } catch (error) {
    console.error("[workers] Intercom sync crashed", error)
  }
}

async function start() {
  await runSyncCycle()
  setInterval(() => {
    void runSyncCycle()
  }, SYNC_INTERVAL_MS)
}

void start()
