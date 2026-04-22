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
  const { syncIntercom } = await import("@/lib/intercom-sync")
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

    await refreshTickerMessages()
  } catch (error) {
    console.error("[workers] Intercom sync crashed", error)
  }
}

async function refreshTickerMessages() {
  try {
    const [
      { filterSupportCasesByProduct, getAvailableProducts, loadSupportCases },
      { buildLiveWallboardData },
      ticker,
      focusPlan,
      insights,
      npsThemesModule,
      npsCommentTranslationsModule,
      { readIntercomTickerLlmSettings },
    ] = await Promise.all([
      import("@/lib/support-health/server"),
      import("@/lib/support-health/logic"),
      import("@/lib/wallboard-ticker-messages"),
      import("@/lib/wallboard-focus-plan"),
      import("@/lib/wallboard-insights"),
      import("@/lib/wallboard-nps-themes"),
      import("@/lib/wallboard-nps-comment-translations"),
      import("@/lib/intercom-admin"),
    ])

    const { cases, lastSyncAt, now, npsRecords, wallboardProducts } =
      await loadSupportCases()
    const selectedProducts = wallboardProducts.filter((product) =>
      getAvailableProducts(cases).includes(product),
    )
    const scopedCases = filterSupportCasesByProduct(cases, selectedProducts, {
      includeUnknownWhenAll: true,
    })
    const live = buildLiveWallboardData(scopedCases, lastSyncAt, now)
    const deterministicItems = live.peopleMoments
    const llmSettings = await readIntercomTickerLlmSettings()
    const deterministicFocusPlan = focusPlan.buildDeterministicLiveFocusPlan(live)

    let resolvedFocusPlan = deterministicFocusPlan
    try {
      const rewrittenFocusPlan = await focusPlan.rewriteLiveFocusPlanWithLlm(
        deterministicFocusPlan,
        live,
        llmSettings
      )
      if (rewrittenFocusPlan?.plan) {
        resolvedFocusPlan = rewrittenFocusPlan.plan
      }
    } catch (error) {
      console.error("[workers] AI focus-plan rewrite failed. Using deterministic plan.", error)
    }

    await focusPlan.writeLiveWallboardFocusPlan(resolvedFocusPlan)

    // Product insights (what went well / what to improve)
    const productNames = live.mappedQueues.map((q) => q.teamName)
    if (productNames.length > 0) {
      const deterministicInsights = insights.buildDeterministicInsights(
        scopedCases,
        productNames,
      )
      let resolvedInsights = deterministicInsights
      try {
        const rewritten = await insights.rewriteInsightsWithLlm(
          deterministicInsights,
          scopedCases,
          productNames,
          llmSettings
        )
        if (rewritten) resolvedInsights = rewritten
      } catch (error) {
        console.error("[workers] AI insights rewrite failed. Using deterministic.", error)
      }
      await insights.writeWallboardInsights(resolvedInsights)
      console.info(`[workers] Wallboard insights refreshed (${resolvedInsights.source}).`)
    }

    // NPS themes from customer comments
    if (npsRecords.length > 0) {
      const deterministicNpsThemes = npsThemesModule.buildDeterministicNpsThemes(npsRecords)
      let resolvedNpsThemes = deterministicNpsThemes
      try {
        const rewritten = await npsThemesModule.rewriteNpsThemesWithLlm(
          deterministicNpsThemes,
          npsRecords,
          llmSettings,
        )
        if (rewritten) resolvedNpsThemes = rewritten
      } catch (error) {
        console.error("[workers] AI NPS themes rewrite failed. Using deterministic.", error)
      }
      await npsThemesModule.writeWallboardNpsThemes(resolvedNpsThemes)
      console.info(`[workers] Wallboard NPS themes refreshed (${resolvedNpsThemes.source}).`)

      try {
        const translatedComments =
          await npsCommentTranslationsModule.rewriteNpsCommentTranslationsWithLlm(
            npsRecords,
            llmSettings,
          )
        if (translatedComments) {
          await npsCommentTranslationsModule.writeWallboardNpsCommentTranslations(
            translatedComments,
          )
          console.info(
            `[workers] Wallboard NPS comment translations refreshed (${translatedComments.source}).`,
          )
        }
      } catch (error) {
        console.error(
          "[workers] AI NPS comment translations failed. Keeping stored translations.",
          error,
        )
      }
    }

    if (deterministicItems.length === 0) {
      console.info("[workers] No people moments available for ticker refresh.")
      return
    }

    let items = deterministicItems
    let source: "deterministic" | "ollama" | "codex" = "deterministic"
    let model: string | null = null

    try {
      const rewritten = await ticker.rewriteTickerMessagesWithLlm(
        deterministicItems,
        llmSettings
      )
      if (rewritten?.items.length) {
        items = rewritten.items
        source = rewritten.source
        model = rewritten.model
      }
    } catch (error) {
      console.error("[workers] AI ticker rewrite failed. Using deterministic messages.", error)
    }

    await ticker.writeWallboardTickerMessages({
      items,
      source,
      model,
    })

    console.info(`[workers] Wallboard ticker refreshed (${source}).`)
  } catch (error) {
    console.error("[workers] Failed to refresh wallboard ticker messages", error)
  }
}

async function start() {
  await runSyncCycle()
  setInterval(() => {
    void runSyncCycle()
  }, SYNC_INTERVAL_MS)
}

void start()
