import { startTransition, useMemo } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { TriangleAlert } from "lucide-react"
import { InfoTooltip } from "@/components/info-tooltip"
import { SatisfactionTrendChart } from "@/components/satisfaction-trend-chart"
import { SupportCxSummary } from "@/components/support-cx-summary"
import { SupportProductFilter } from "@/components/support-product-filter"
import {
  ProductAutoplayStrip,
  useProductAutoplay,
} from "@/components/wallboard/product-autoplay-strip"
import { RotatingPanels } from "@/components/wallboard/rotating-panels"
import { WallboardSection, WallboardShell } from "@/components/wallboard/wallboard-shell"
import { buildIntercomCaseUrl } from "@/lib/intercom-links"
import { normalizeSupportProductFilterInput } from "@/lib/support-health/filter"
import { getLiveWallboard, getTrendsWallboard } from "@/lib/support-health/server"
import type {
  CaseLookupItem,
  LiveWallboardData,
  SupportHealthSnapshot,
  TrendsWallboardData,
} from "@/lib/support-health/types"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/wallboard/live")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) =>
    normalizeSupportProductFilterInput(search),
  loaderDeps: ({ search }) => normalizeSupportProductFilterInput(search),
  loader: async ({ deps }) => {
    const [live, trends] = await Promise.all([
      getLiveWallboard({ data: deps }),
      getTrendsWallboard({
        data: {
          ...deps,
          period: "current-week",
        },
      }),
    ])

    return { live, trends }
  },
  component: LiveWallboardPage,
})

function LiveWallboardPage() {
  const routeData = Route.useLoaderData() as
    | { live: LiveWallboardData; trends?: TrendsWallboardData }
    | (LiveWallboardData & { trends?: TrendsWallboardData })
  const live = hasWrappedLiveData(routeData) ? routeData.live : routeData
  const trends = hasWrappedLiveData(routeData)
    ? routeData.trends
    : routeData.trends
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const periodLabel = trends?.period.label ?? "Current week"
  const periodSummary = trends?.periodSummary
  const periodContext = trends?.periods ?? []
  const cxSeries = trends?.cxSeries ?? []
  const productHealthByName = new Map(
    (trends?.productHealth ?? []).map((row) => [row.productName, row])
  )
  const autoplayProducts = useMemo(
    () =>
      resolveAutoplayProducts(
        live.selectedProducts,
        live.mappedQueues.map((queue) => queue.teamName),
        live.availableProducts
      ),
    [live.availableProducts, live.mappedQueues, live.selectedProducts]
  )
  const autoplay = useProductAutoplay(autoplayProducts, { intervalMs: 12_000 })
  const focusedProductName = autoplay.activeProduct
  const focusedQueue =
    focusedProductName === null
      ? null
      : live.mappedQueues.find((queue) => queue.teamName === focusedProductName) ?? null
  const focusedHealth =
    focusedProductName === null ? null : productHealthByName.get(focusedProductName) ?? null
  const focusedLookupCases =
    focusedProductName === null
      ? live.lookupCases
      : live.lookupCases
          .filter((item) => item.productName === focusedProductName)
          .slice(0, 5)
  const focusStatus = resolveFocusStatus(focusedQueue, focusedHealth?.satisfactionScorePercent ?? null)
  const focusStatusLabel = buildStatusLabel(focusStatus)
  const focusPrimaryAction = buildFocusPrimaryAction(focusedQueue)
  const focusSecondaryAction = buildFocusSecondaryAction(focusedQueue, focusedHealth?.slaAdherencePercent ?? null)
  const quickWinText = buildQuickWinText(
    focusedHealth?.topPerformerName ?? null,
    focusedHealth?.topPerformerPositiveCount ?? 0,
    periodLabel
  )
  const focusSatisfaction =
    focusedHealth?.satisfactionScorePercent ?? periodSummary?.satisfactionScorePercent ?? null

  function handleProductChange(products: string[]) {
    startTransition(() => {
      navigate({
        search: {
          products: products.length > 0 ? products : undefined,
        },
        replace: true,
      })
    })
  }

  const customerHappinessPanel = (
    <WallboardSection title="Customer happiness">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="space-y-4">
          <div className="rounded-md border border-white/10 bg-black/10 px-4 py-4">
            <div className="text-sm text-stone-400">
              {focusedProductName ? `${focusedProductName} satisfaction target: 90%` : "Satisfaction target: 90%"}
            </div>
            <div
              className={cn(
                "mt-2 text-5xl font-semibold tracking-tight",
                getSatisfactionToneClass(focusSatisfaction)
              )}
            >
              {focusSatisfaction === null ? "—" : `${focusSatisfaction}%`}
            </div>
            <div className="mt-2 text-base text-stone-300">
              {buildSatisfactionHeadline(focusSatisfaction)}
            </div>
          </div>

          <div className="rounded-md border border-white/10 bg-black/10 px-4 py-4">
            <SupportCxSummary
              label={periodLabel}
              satisfactionScorePercent={periodSummary?.satisfactionScorePercent ?? null}
              ratedCount={periodSummary?.ratedCount ?? 0}
              positiveCount={periodSummary?.positiveCount ?? 0}
              responseRatePercent={periodSummary?.responseRatePercent ?? 0}
              ratingMix={periodSummary?.ratingMix ?? emptyRatingMix}
              variant="wallboard"
            />
          </div>
        </div>

        <div className="space-y-3">
          <SatisfactionTrendChart
            points={cxSeries}
            title={`Daily satisfaction • ${periodLabel}`}
          />
          <div className="grid gap-3">
            {periodContext.map((period) => (
              <div
                key={period.label}
                className="rounded-md border border-white/10 bg-black/10 px-4 py-4"
              >
                <div className="text-sm text-stone-400">{period.label}</div>
                <div
                  className={cn(
                    "mt-1 text-3xl font-semibold tracking-tight",
                    getSatisfactionToneClass(period.satisfactionScorePercent)
                  )}
                >
                  {period.satisfactionScorePercent === null
                    ? "—"
                    : `${period.satisfactionScorePercent}%`}
                </div>
                <div className="mt-1 text-xs text-stone-400">
                  Rated {period.responseRatePercent}%
                </div>
              </div>
            ))}
            {periodContext.length === 0 ? (
              <div className="rounded-md border border-white/10 bg-black/10 px-4 py-4 text-sm text-stone-400">
                CX context periods will appear after the next loader refresh.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </WallboardSection>
  )

  const visibleQueues =
    focusedProductName === null
      ? live.mappedQueues.slice(0, 5)
      : live.mappedQueues.filter((queue) => queue.teamName === focusedProductName)

  const byProductPanel = (
    <WallboardSection
      title={focusedProductName ? `Product spotlight • ${focusedProductName}` : "By product right now"}
      className="min-h-0"
    >
      <div className="grid grid-cols-[minmax(0,1.1fr)_120px_90px_80px_90px_95px_90px_95px] gap-x-4 border-b border-white/10 pb-3 text-sm text-stone-400">
        <div>Product</div>
        <div className="text-right">Satisfaction</div>
        <div className="text-right">Rated</div>
        <div className="text-right">Open</div>
        <div className="text-right">Waiting</div>
        <div className="text-right">Over SLA</div>
        <div className="text-right">Due</div>
        <div className="text-right">Unassigned</div>
      </div>
      <div className="divide-y divide-white/10">
        {visibleQueues.length === 0 ? (
          live.snapshot.unknownCaseCount > 0 ? (
            <div className="py-10 text-lg text-stone-400">
              Product mapping is still incomplete, so this wallboard cannot show product rows yet.
            </div>
          ) : (
            <div className="py-10 text-lg text-stone-400">No Intercom data yet.</div>
          )
        ) : (
          visibleQueues.map((queue) => {
            const trendRow = productHealthByName.get(queue.teamName)
            const satisfactionValue =
              trendRow?.satisfactionScorePercent === null ||
              trendRow?.satisfactionScorePercent === undefined
                ? "—"
                : `${trendRow.satisfactionScorePercent}%`
            const ratedValue =
              trendRow?.responseRatePercent === undefined
                ? "—"
                : `${trendRow.responseRatePercent}%`

            return (
              <div
                key={queue.teamName}
                className="grid grid-cols-[minmax(0,1.1fr)_120px_90px_80px_90px_95px_90px_95px] gap-x-4 py-4 text-lg"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-stone-100">{queue.teamName}</div>
                  <div className="mt-1 text-sm text-stone-400">
                    {formatQueueSources(queue.sourceQueues)}
                  </div>
                </div>
                <QueueValue
                  value={satisfactionValue}
                  danger={
                    trendRow?.satisfactionScorePercent !== null &&
                    trendRow?.satisfactionScorePercent !== undefined &&
                    trendRow.satisfactionScorePercent < 90
                  }
                />
                <QueueValue
                  value={ratedValue}
                  warning={
                    trendRow?.responseRatePercent !== undefined &&
                    trendRow.responseRatePercent > 0 &&
                    trendRow.responseRatePercent < 20
                  }
                />
                <QueueValue value={queue.activeCaseCount} />
                <QueueValue value={queue.awaitingTeamCount} />
                <QueueValue value={queue.breachedCount} danger />
                <QueueValue value={queue.dueSoonCount} warning />
                <QueueValue value={queue.unassignedCount} />
              </div>
            )
          })
        )}
      </div>
    </WallboardSection>
  )

  const operationalContextPanel = (
    <WallboardSection title="Operational context">
      <div className="space-y-4">
        <div
          className={cn(
            "text-4xl font-semibold tracking-tight",
            getStatusTextClass(focusStatus)
          )}
        >
          {focusStatusLabel}
        </div>
        <p className="text-base leading-7 text-stone-300">
          {focusedProductName ? `${focusedProductName}: ${focusPrimaryAction}` : buildQueueHeadline(live.snapshot)}
        </p>
        <p className="text-sm leading-6 text-stone-400">
          {focusedProductName
            ? focusSecondaryAction
            : buildQueueSupportingText(live.snapshot)}
        </p>
        {quickWinText ? (
          <div className="rounded-md border border-emerald-300/30 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100">
            {quickWinText}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-4">
          <StateBlock
            label={focusedProductName ? "SLA in period" : "SLA now"}
            tooltip={
              focusedProductName
                ? "SLA adherence for this product in the selected period."
                : "Current open-case SLA adherence in selected products."
            }
            value={
              focusedProductName
                ? focusedHealth?.slaAdherencePercent === null ||
                  focusedHealth?.slaAdherencePercent === undefined
                  ? "—"
                  : `${focusedHealth.slaAdherencePercent}%`
                : `${live.snapshot.slaAdherencePercent}%`
            }
            tone={
              (focusedProductName
                ? focusedHealth?.slaAdherencePercent ?? null
                : live.snapshot.slaAdherencePercent) >= 90
                ? "text-emerald-300"
                : (focusedProductName
                      ? focusedHealth?.slaAdherencePercent ?? null
                      : live.snapshot.slaAdherencePercent) >= 75
                  ? "text-amber-300"
                  : "text-red-300"
            }
          />
          <StateBlock
            label="Over SLA now"
            tooltip="Open cases currently past SLA due time."
            value={focusedQueue?.breachedCount ?? live.snapshot.currentBreachedCount}
            tone="text-red-300"
          />
          <StateBlock
            label="Due in 60m"
            tooltip="Open SLA-tracked cases due in the next hour."
            value={focusedQueue?.dueSoonCount ?? live.snapshot.currentDueSoonCount}
            tone="text-amber-300"
          />
          <StateBlock
            label="Unassigned"
            tooltip="Open cases without an owner."
            value={focusedQueue?.unassignedCount ?? live.snapshot.currentUnassignedCount}
            tone="text-stone-200"
          />
        </div>

        {live.snapshot.stale ? (
          <div className="flex items-center gap-2 text-sm text-amber-200">
            <TriangleAlert className="h-4 w-4" />
            Sync is older than 10 minutes. Treat these numbers as stale.
          </div>
        ) : null}
      </div>
    </WallboardSection>
  )

  const topIdsPanel = (
    <WallboardSection
      title={focusedProductName ? `Top 5 IDs • ${focusedProductName}` : "Top 5 IDs to check"}
      className="min-h-0"
    >
      <div className="space-y-2">
        {focusedLookupCases.length === 0 ? (
          <div className="text-lg text-stone-400">No open cases need support right now.</div>
        ) : (
          focusedLookupCases.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-[220px_minmax(0,1fr)_160px] items-center gap-4 rounded-md border border-white/10 bg-black/10 px-4 py-3"
            >
              <div className="min-w-0">
                <CaseLink item={item} appUrl={live.intercomAppUrl} />
              </div>
              <div className="min-w-0">
                <div className="truncate text-base font-medium text-stone-100">
                  {formatProductName(item.productName)}
                </div>
                <div className="truncate text-xs text-stone-400">
                  {item.queueName} • {formatLookupSubtype(item.subtype)}
                </div>
              </div>
              <div className="text-right">
                <div
                  className={cn(
                    "text-sm font-medium",
                    item.isBreached && "text-red-300",
                    !item.isBreached && item.isDueSoon && "text-amber-300",
                    !item.isBreached && !item.isDueSoon && "text-stone-200"
                  )}
                >
                  {item.stateLabel}
                </div>
                <div className="mt-1 text-sm text-stone-400">{item.ageLabel}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </WallboardSection>
  )

  return (
    <WallboardShell
      title="Support Health"
      refreshedAt={live.snapshot.freshnessTimestamp ?? live.refreshedAt}
      stale={live.snapshot.stale}
      toolbar={
        <SupportProductFilter
          availableProducts={live.availableProducts}
          selectedProducts={search.products ?? []}
          onChange={handleProductChange}
          mode="wallboard"
        />
      }
    >
      <div className="space-y-3">
        <ProductAutoplayStrip
          title="Product focus"
          subtitle="This lane rotates through selected products and keeps action priority clear."
          state={autoplay}
          mode="compact"
        />
        <div className="grid h-full min-h-0 grid-cols-[minmax(0,1.55fr)_minmax(340px,0.95fr)] gap-6">
          <RotatingPanels
            panels={[
              {
                id: "live-customer-happiness",
                label: "Customer happiness",
                content: customerHappinessPanel,
              },
              {
                id: "live-by-product",
                label: "By product",
                content: byProductPanel,
              },
            ]}
            intervalMs={18_000}
            className="min-h-0"
          />
          <RotatingPanels
            panels={[
              {
                id: "live-operational-context",
                label: "Operational context",
                content: operationalContextPanel,
              },
              {
                id: "live-top-ids",
                label: "Top IDs",
                content: topIdsPanel,
              },
            ]}
            intervalMs={18_000}
            initialIndex={1}
            className="min-h-0"
          />
        </div>
      </div>
    </WallboardShell>
  )
}

function getStatusTextClass(status: SupportHealthSnapshot["status"]) {
  if (status === "green") return "text-emerald-300"
  if (status === "yellow") return "text-amber-300"
  return "text-red-300"
}

function buildStatusLabel(status: SupportHealthSnapshot["status"]) {
  if (status === "green") return "On track"
  if (status === "yellow") return "Needs attention"
  return "Off track"
}

function resolveAutoplayProducts(
  selectedProducts: string[],
  mappedQueueProducts: string[],
  availableProducts: string[]
) {
  if (selectedProducts.length > 0) return selectedProducts
  if (mappedQueueProducts.length > 0) return mappedQueueProducts
  return availableProducts
}

function resolveFocusStatus(
  queue: LiveWallboardData["mappedQueues"][number] | null,
  satisfactionScorePercent: number | null
): SupportHealthSnapshot["status"] {
  if (!queue) return "yellow"
  if (queue.breachedCount > 0 || queue.urgentCount > 0) return "red"
  if (
    queue.dueSoonCount > 0 ||
    queue.unassignedCount > 0 ||
    (satisfactionScorePercent !== null && satisfactionScorePercent < 90)
  ) {
    return "yellow"
  }
  return "green"
}

function buildFocusPrimaryAction(queue: LiveWallboardData["mappedQueues"][number] | null) {
  if (!queue) return "No open queue pressure in this product right now."
  if (queue.breachedCount > 0) {
    return `Clear ${queue.breachedCount} over-SLA case${queue.breachedCount === 1 ? "" : "s"} first.`
  }
  if (queue.dueSoonCount > 0) {
    return `Prioritize ${queue.dueSoonCount} case${queue.dueSoonCount === 1 ? "" : "s"} due in the next hour.`
  }
  if (queue.unassignedCount > 0) {
    return `Assign ${queue.unassignedCount} unassigned case${queue.unassignedCount === 1 ? "" : "s"}.`
  }
  if (queue.awaitingTeamCount > 0) {
    return `${queue.awaitingTeamCount} case${queue.awaitingTeamCount === 1 ? "" : "s"} are waiting on support.`
  }
  return "No immediate risk. Keep normal response cadence."
}

function buildFocusSecondaryAction(
  queue: LiveWallboardData["mappedQueues"][number] | null,
  periodSla: number | null
) {
  if (!queue) return "Select or map a product to start focused playback."
  const parts = [
    `${queue.activeCaseCount} open`,
    `${queue.awaitingTeamCount} waiting on support`,
    `${queue.breachedCount} over SLA`,
  ]
  if (periodSla !== null) {
    parts.push(`period SLA ${periodSla}%`)
  }
  return parts.join(" • ")
}

function buildQuickWinText(
  topPerformerName: string | null,
  positiveCount: number,
  periodLabel: string
) {
  if (!topPerformerName || positiveCount <= 0) return null
  return `Quick win: ${topPerformerName} delivered ${positiveCount} positive CX rating${
    positiveCount === 1 ? "" : "s"
  } in ${periodLabel.toLowerCase()}.`
}

const emptyRatingMix: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 0,
  2: 0,
  3: 0,
  4: 0,
  5: 0,
}

function hasWrappedLiveData(
  value: unknown
): value is { live: LiveWallboardData; trends?: TrendsWallboardData } {
  return typeof value === "object" && value !== null && "live" in value
}

function getSatisfactionToneClass(satisfaction: number | null) {
  if (satisfaction === null) return "text-stone-100"
  if (satisfaction >= 90) return "text-emerald-300"
  if (satisfaction >= 75) return "text-amber-300"
  return "text-red-300"
}

function buildSatisfactionHeadline(satisfaction: number | null) {
  if (satisfaction === null) {
    return "No rated conversations yet in the selected period."
  }

  if (satisfaction >= 90) {
    return "Customer happiness is on target."
  }

  if (satisfaction >= 75) {
    return "Customer happiness is below target and needs monitoring."
  }

  return "Customer happiness is off target and needs action."
}

function buildQueueHeadline(snapshot: SupportHealthSnapshot) {
  if (snapshot.currentBreachedCount > 0) {
    return `${snapshot.currentBreachedCount} case${snapshot.currentBreachedCount === 1 ? "" : "s"} ${
      snapshot.currentBreachedCount === 1 ? "is" : "are"
    } over SLA right now`
  }
  if (snapshot.currentDueSoonCount > 0) {
    return `${snapshot.currentDueSoonCount} case${snapshot.currentDueSoonCount === 1 ? "" : "s"} ${
      snapshot.currentDueSoonCount === 1 ? "is" : "are"
    } due within 60 minutes`
  }
  if (snapshot.currentAwaitingTeamCount > 0) {
    return `${snapshot.currentAwaitingTeamCount} open case${snapshot.currentAwaitingTeamCount === 1 ? "" : "s"} ${
      snapshot.currentAwaitingTeamCount === 1 ? "needs" : "need"
    } a support reply`
  }
  return "No open cases need a support reply right now"
}

function buildQueueSupportingText(snapshot: SupportHealthSnapshot) {
  const parts = [
    `${snapshot.currentAwaitingTeamCount} waiting on support`,
    `${snapshot.currentUnassignedCount} unassigned`,
    `${snapshot.currentAwaitingCustomerCount} waiting on customer`,
  ]

  if (snapshot.unknownCaseCount > 0) {
    parts.push(`${snapshot.unknownCaseCount} not mapped to a product yet`)
  }

  return parts.join(" • ")
}

function CaseLink({
  item,
  appUrl,
}: {
  item: CaseLookupItem
  appUrl: string | null
}) {
  const href = buildIntercomCaseUrl(appUrl, {
    externalId: item.externalId,
    subtype: item.subtype,
  })

  if (!href) {
    return <>#{formatLookupId(item)}</>
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="block truncate font-mono text-[1.05rem] font-semibold tabular-nums text-stone-50 underline decoration-white/30 underline-offset-4 transition hover:text-sky-300"
    >
      #{formatLookupId(item)}
    </a>
  )
}

function QueueValue({
  value,
  danger,
  warning,
}: {
  value: string | number
  danger?: boolean
  warning?: boolean
}) {
  return (
    <div
      className={cn(
        "text-right font-medium text-stone-100",
        danger && "text-red-300",
        warning && "text-amber-300"
      )}
    >
      {value}
    </div>
  )
}

function StateBlock({
  label,
  tooltip,
  value,
  tone,
}: {
  label: string
  tooltip?: string
  value: number | string
  tone: string
}) {
  return (
    <div className="rounded-md border border-white/10 bg-black/10 px-4 py-4">
      <div className="text-sm text-stone-400">
        <InfoTooltip label={label} tooltip={tooltip} />
      </div>
      <div className={cn("mt-2 text-4xl font-semibold tracking-tight", tone)}>{value}</div>
    </div>
  )
}

function formatQueueSources(sourceQueues: string[]) {
  if (sourceQueues.length === 0) return "No dedicated queue detected"
  if (sourceQueues.length === 1) return `Queue ${sourceQueues[0]}`
  return `Queues ${sourceQueues.join(", ")}`
}

function formatLookupId(item: CaseLookupItem) {
  return item.externalId || item.id
}

function formatLookupSubtype(subtype: CaseLookupItem["subtype"]) {
  return subtype === "ticket" ? "Ticket" : "Conversation"
}

function formatProductName(productName: string) {
  return productName === "Unmapped" ? "Needs mapping" : productName
}
