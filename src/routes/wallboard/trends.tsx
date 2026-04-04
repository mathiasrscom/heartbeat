import { startTransition, useMemo } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { InfoTooltip } from "@/components/info-tooltip"
import { SatisfactionTrendChart } from "@/components/satisfaction-trend-chart"
import { SupportCxSummary } from "@/components/support-cx-summary"
import { SupportPeriodFilter } from "@/components/support-period-filter"
import { SupportProductFilter } from "@/components/support-product-filter"
import {
  ProductAutoplayStrip,
  useProductAutoplay,
} from "@/components/wallboard/product-autoplay-strip"
import { RotatingPanels } from "@/components/wallboard/rotating-panels"
import { WallboardSection, WallboardShell } from "@/components/wallboard/wallboard-shell"
import { buildIntercomCaseUrl } from "@/lib/intercom-links"
import { normalizeSupportProductFilterInput } from "@/lib/support-health/filter"
import { normalizeSupportPeriodInput, type SupportPeriodInput } from "@/lib/support-health/period"
import { getTrendsWallboard } from "@/lib/support-health/server"
import type { CaseLookupItem, ProductHealthRow } from "@/lib/support-health/types"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/wallboard/trends")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) =>
    ({
      ...normalizeSupportPeriodInput(search as SupportPeriodInput),
      ...normalizeSupportProductFilterInput(search),
    }),
  loaderDeps: ({ search }) => ({
    ...normalizeSupportPeriodInput(search),
    ...normalizeSupportProductFilterInput(search),
  }),
  loader: async ({ deps }) => getTrendsWallboard({ data: deps }),
  component: TrendsWallboardPage,
})

function TrendsWallboardPage() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  function handlePeriodChange(next: {
    period: "current-week" | "previous-week" | "custom"
    from?: string
    to?: string
  }) {
    startTransition(() => {
      navigate({
        search: {
          period: next.period,
          from: next.period === "custom" ? next.from : undefined,
          to: next.period === "custom" ? next.to : undefined,
          products: search.products,
        },
        replace: true,
      })
    })
  }

  function handleProductChange(products: string[]) {
    startTransition(() => {
      navigate({
        search: {
          period: search.period,
          from: search.period === "custom" ? search.from : undefined,
          to: search.period === "custom" ? search.to : undefined,
          products: products.length > 0 ? products : undefined,
        },
        replace: true,
      })
    })
  }

  const autoplayProducts = useMemo(
    () =>
      resolveAutoplayProducts(
        data.selectedProducts,
        data.productHealth.map((row) => row.productName),
        data.availableProducts
      ),
    [data.availableProducts, data.productHealth, data.selectedProducts]
  )
  const autoplay = useProductAutoplay(autoplayProducts, { intervalMs: 12_000 })
  const focusedProductName = autoplay.activeProduct
  const focusedRows = focusedProductName
    ? data.productHealth.filter((row) => row.productName === focusedProductName)
    : data.productHealth
  const focusedSummary = useMemo(() => aggregateProductRows(focusedRows), [focusedRows])
  const focusedLookupCases =
    focusedProductName === null
      ? data.lookupCases
      : data.lookupCases.filter((item) => item.productName === focusedProductName).slice(0, 5)
  const focusPrimaryAction = buildTrendsFocusPrimaryAction(focusedSummary)
  const focusSecondaryAction = buildTrendsFocusSecondaryAction(
    focusedSummary,
    data.period.label
  )
  const quickWinText = buildQuickWinText(
    focusedSummary.topPerformerName,
    focusedSummary.topPerformerPositiveCount,
    data.period.label
  )
  const focusSatisfaction =
    focusedProductName === null
      ? data.periodSummary.satisfactionScorePercent
      : focusedSummary.satisfactionScorePercent

  const customerHappinessPanel = (
    <WallboardSection title="Customer happiness">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="space-y-4">
          <div className="rounded-md border border-white/10 bg-black/10 px-4 py-4">
            <div className="text-sm text-stone-400">
              {focusedProductName
                ? `${focusedProductName} satisfaction target: 90%`
                : "Satisfaction target: 90%"}
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
              label={data.period.label}
              satisfactionScorePercent={data.periodSummary.satisfactionScorePercent}
              ratedCount={data.periodSummary.ratedCount}
              positiveCount={data.periodSummary.positiveCount}
              responseRatePercent={data.periodSummary.responseRatePercent}
              ratingMix={data.periodSummary.ratingMix}
              variant="wallboard"
            />
          </div>
        </div>

        <div className="space-y-3">
          <SatisfactionTrendChart
            points={data.cxSeries}
            title={`Daily satisfaction • ${data.period.label}`}
          />
          <div className="grid gap-3">
            {data.periods.map((period) => (
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
          </div>
        </div>
      </div>
    </WallboardSection>
  )

  const productsPanel = (
    <WallboardSection
      title={focusedProductName ? `Product spotlight • ${focusedProductName}` : "Products"}
    >
      <div className="space-y-6">
        <div className="grid gap-4 xl:grid-cols-5">
          <SummaryTile
            label={`Satisfaction ${data.period.label.toLowerCase()}`}
            tooltip={`Percent of rated conversations in ${data.period.label.toLowerCase()} with a 4 or 5 score.`}
            value={
              focusedSummary.satisfactionScorePercent === null
                ? "—"
                : `${focusedSummary.satisfactionScorePercent}%`
            }
            danger={
              focusedSummary.satisfactionScorePercent !== null &&
              focusedSummary.satisfactionScorePercent < 90
            }
          />
          <SummaryTile
            label="Rated"
            tooltip="Share of resolved conversations in the selected period that received a rating."
            value={`${focusedSummary.responseRatePercent}%`}
          />
          <SummaryTile
            label="Open now"
            tooltip="Count of currently open cases in the selected products."
            value={String(focusedSummary.openNowCount)}
          />
          <SummaryTile
            label="Waiting on us"
            tooltip="Open cases where support owes the next reply."
            value={String(focusedSummary.awaitingTeamNowCount)}
          />
          <SummaryTile
            label="Over SLA now"
            tooltip="Open cases currently past SLA due time."
            value={String(focusedSummary.breachedNowCount)}
            danger
          />
        </div>

        <div className="grid grid-cols-[minmax(0,1.3fr)_120px_90px_80px_90px_100px_110px] gap-x-4 border-b border-white/10 pb-3 text-sm text-stone-400">
          <div>Product</div>
          <div className="text-right">Satisfaction</div>
          <div className="text-right">Rated</div>
          <div className="text-right">Open</div>
          <div className="text-right">Waiting</div>
          <div className="text-right">Over SLA</div>
          <div className="text-right">SLA period</div>
        </div>

        <div className="divide-y divide-white/10">
          {focusedRows.length === 0 ? (
            <div className="py-10 text-lg text-stone-400">No product activity in this view.</div>
          ) : (
            focusedRows.map((row) => (
              <div
                key={`${row.serviceBucket}-${row.productName}`}
                className="grid grid-cols-[minmax(0,1.3fr)_120px_90px_80px_90px_100px_110px] gap-x-4 py-4"
              >
                <div className="min-w-0">
                  <div className="truncate text-xl font-medium text-stone-100">
                    {row.productName}
                  </div>
                </div>
                <Cell
                  value={
                    row.satisfactionScorePercent === null
                      ? "—"
                      : `${row.satisfactionScorePercent}%`
                  }
                  danger={
                    row.satisfactionScorePercent !== null &&
                    row.satisfactionScorePercent < 90
                  }
                />
                <Cell
                  value={`${row.responseRatePercent}%`}
                  warning={row.responseRatePercent > 0 && row.responseRatePercent < 20}
                />
                <Cell value={row.openNowCount} />
                <Cell value={row.awaitingTeamCount} warning={row.awaitingTeamCount > 0} />
                <Cell value={row.breachedNowCount} danger={row.breachedNowCount > 0} />
                <Cell
                  value={row.slaAdherencePercent === null ? "—" : `${row.slaAdherencePercent}%`}
                  danger={row.slaAdherencePercent !== null && row.slaAdherencePercent < 90}
                />
              </div>
            ))
          )}
        </div>
        <div className="rounded-md border border-white/10 bg-black/10 px-4 py-3 text-sm text-stone-300">
          SLA score for selected period:{" "}
          {focusedSummary.slaAdherencePercent === null
            ? "—"
            : `${focusedSummary.slaAdherencePercent}%`} ({focusedSummary.slaMissedCount} breached
          of {focusedSummary.slaTrackedCount} tracked). Target: 90%.
        </div>
      </div>
    </WallboardSection>
  )

  const topIdsPanel = (
    <WallboardSection
      title={focusedProductName ? `Top 5 IDs • ${focusedProductName}` : "Top 5 IDs to inspect"}
      className="min-h-0"
    >
      <div className="space-y-2">
        {focusedLookupCases.length === 0 ? (
          <div className="text-base text-stone-400">
            No open cases need support in the selected products.
          </div>
        ) : (
          focusedLookupCases.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-[220px_minmax(0,1fr)_160px] items-center gap-4 rounded-md border border-white/10 bg-black/10 px-4 py-3"
            >
              <div className="min-w-0">
                <CaseLink item={item} appUrl={data.intercomAppUrl} />
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

  const operationalSnapshotPanel = (
    <WallboardSection title="What to work on now">
      <div className="space-y-4">
        <p className="text-base leading-7 text-stone-300">
          {focusedProductName ? `${focusedProductName}: ${focusPrimaryAction}` : focusPrimaryAction}
        </p>
        <p className="text-sm leading-6 text-stone-400">{focusSecondaryAction}</p>
        {quickWinText ? (
          <div className="rounded-md border border-emerald-300/30 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100">
            {quickWinText}
          </div>
        ) : null}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <SnapshotValue
          label="Waiting on us"
          value={String(focusedSummary.awaitingTeamNowCount)}
        />
        <SnapshotValue
          label="Over SLA now"
          value={String(focusedSummary.breachedNowCount)}
          danger
        />
        <SnapshotValue
          label="SLA period"
          value={
            focusedSummary.slaAdherencePercent === null
              ? "—"
              : `${focusedSummary.slaAdherencePercent}%`
          }
          danger={
            focusedSummary.slaAdherencePercent !== null &&
            focusedSummary.slaAdherencePercent < 90
          }
        />
        <SnapshotValue
          label="Open now"
          value={String(focusedSummary.openNowCount)}
        />
      </div>
    </WallboardSection>
  )

  return (
    <WallboardShell
      title="Product Health"
      refreshedAt={data.snapshot.freshnessTimestamp ?? data.refreshedAt}
      stale={data.snapshot.stale}
      toolbar={
        <div className="flex flex-wrap items-center gap-4">
          <div className="text-sm text-stone-400">{data.period.label}</div>
          <SupportPeriodFilter
            period={search.period}
            from={data.period.from}
            to={data.period.to}
            onChange={handlePeriodChange}
            mode="wallboard"
          />
          <SupportProductFilter
            availableProducts={data.availableProducts}
            selectedProducts={data.selectedProducts}
            onChange={handleProductChange}
            mode="wallboard"
          />
        </div>
      }
    >
      <div className="space-y-3">
        <ProductAutoplayStrip
          title="Product focus"
          subtitle={`Playback follows selected products in ${data.period.label.toLowerCase()}.`}
          state={autoplay}
          mode="compact"
        />
        <div className="grid h-full min-h-0 grid-cols-[minmax(0,1.45fr)_420px] gap-6">
          <RotatingPanels
            panels={[
              {
                id: "trends-customer-happiness",
                label: "Customer happiness",
                content: customerHappinessPanel,
              },
              {
                id: "trends-products",
                label: "Products",
                content: productsPanel,
              },
            ]}
            intervalMs={18_000}
            className="min-h-0"
          />
          <RotatingPanels
            panels={[
              {
                id: "trends-top-ids",
                label: "Top IDs",
                content: topIdsPanel,
              },
              {
                id: "trends-operational-snapshot",
                label: "Operational snapshot",
                content: operationalSnapshotPanel,
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

function formatLookupId(item: CaseLookupItem) {
  return item.externalId || item.id
}

function formatLookupSubtype(subtype: CaseLookupItem["subtype"]) {
  return subtype === "ticket" ? "Ticket" : "Conversation"
}

function formatProductName(productName: string) {
  return productName === "Unmapped" ? "Needs mapping" : productName
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

interface AggregatedProductSummary {
  openNowCount: number
  awaitingTeamNowCount: number
  breachedNowCount: number
  slaTrackedCount: number
  slaMissedCount: number
  slaAdherencePercent: number | null
  satisfactionScorePercent: number | null
  responseRatePercent: number
  topPerformerName: string | null
  topPerformerPositiveCount: number
}

function round(value: number, digits = 1) {
  return Number(value.toFixed(digits))
}

function resolveAutoplayProducts(
  selectedProducts: string[],
  rowProducts: string[],
  availableProducts: string[]
) {
  if (selectedProducts.length > 0) return selectedProducts
  if (rowProducts.length > 0) return Array.from(new Set(rowProducts))
  return availableProducts
}

function aggregateProductRows(rows: ProductHealthRow[]): AggregatedProductSummary {
  if (rows.length === 0) {
    return {
      openNowCount: 0,
      awaitingTeamNowCount: 0,
      breachedNowCount: 0,
      slaTrackedCount: 0,
      slaMissedCount: 0,
      slaAdherencePercent: null,
      satisfactionScorePercent: null,
      responseRatePercent: 0,
      topPerformerName: null,
      topPerformerPositiveCount: 0,
    }
  }

  const openNowCount = rows.reduce((sum, row) => sum + row.openNowCount, 0)
  const awaitingTeamNowCount = rows.reduce((sum, row) => sum + row.awaitingTeamCount, 0)
  const breachedNowCount = rows.reduce((sum, row) => sum + row.breachedNowCount, 0)
  const slaTrackedCount = rows.reduce((sum, row) => sum + row.slaTrackedCount, 0)
  const slaMissedCount = rows.reduce((sum, row) => sum + row.slaMissedCount, 0)
  const ratedCount = rows.reduce((sum, row) => sum + row.ratedCount, 0)
  const eligibleCount = rows.reduce((sum, row) => sum + row.eligibleCount, 0)
  const positiveCount = rows.reduce((sum, row) => sum + row.positiveCount, 0)
  const topPerformer = [...rows]
    .filter((row) => row.topPerformerName && row.topPerformerPositiveCount > 0)
    .sort((left, right) => {
      if (right.topPerformerPositiveCount !== left.topPerformerPositiveCount) {
        return right.topPerformerPositiveCount - left.topPerformerPositiveCount
      }
      return (left.topPerformerName ?? "").localeCompare(right.topPerformerName ?? "")
    })[0]

  return {
    openNowCount,
    awaitingTeamNowCount,
    breachedNowCount,
    slaTrackedCount,
    slaMissedCount,
    slaAdherencePercent:
      slaTrackedCount === 0 ? null : round(((slaTrackedCount - slaMissedCount) / slaTrackedCount) * 100),
    satisfactionScorePercent: ratedCount === 0 ? null : round((positiveCount / ratedCount) * 100),
    responseRatePercent: eligibleCount === 0 ? 0 : round((ratedCount / eligibleCount) * 100),
    topPerformerName: topPerformer?.topPerformerName ?? null,
    topPerformerPositiveCount: topPerformer?.topPerformerPositiveCount ?? 0,
  }
}

function buildTrendsFocusPrimaryAction(summary: AggregatedProductSummary) {
  if (summary.breachedNowCount > 0) {
    return `Clear ${summary.breachedNowCount} over-SLA case${summary.breachedNowCount === 1 ? "" : "s"} first.`
  }
  if (summary.awaitingTeamNowCount > 0) {
    return `Work through ${summary.awaitingTeamNowCount} case${
      summary.awaitingTeamNowCount === 1 ? "" : "s"
    } waiting on support.`
  }
  if (summary.openNowCount > 0) {
    return `${summary.openNowCount} open case${summary.openNowCount === 1 ? "" : "s"} are in a healthy state right now.`
  }
  return "No open queue pressure in this product right now."
}

function buildTrendsFocusSecondaryAction(
  summary: AggregatedProductSummary,
  periodLabel: string
) {
  const parts = [
    `${summary.openNowCount} open`,
    `${summary.awaitingTeamNowCount} waiting`,
    `${summary.breachedNowCount} over SLA now`,
  ]
  if (summary.slaAdherencePercent !== null) {
    parts.push(`SLA ${summary.slaAdherencePercent}% in ${periodLabel.toLowerCase()}`)
  }
  if (summary.satisfactionScorePercent !== null) {
    parts.push(`CX ${summary.satisfactionScorePercent}%`)
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

function SummaryTile({
  label,
  tooltip,
  value,
  danger,
}: {
  label: string
  tooltip?: string
  value: string
  danger?: boolean
}) {
  return (
    <div className="rounded-md border border-white/10 bg-black/10 px-4 py-4">
      <div className="text-sm text-stone-400">
        <InfoTooltip label={label} tooltip={tooltip} />
      </div>
      <div
        className={cn(
          "mt-2 text-4xl font-semibold tracking-tight text-stone-50",
          danger && "text-red-300"
        )}
      >
        {value}
      </div>
    </div>
  )
}

function Cell({
  value,
  warning,
  danger,
}: {
  value: string | number
  warning?: boolean
  danger?: boolean
}) {
  return (
    <div
      className={cn(
        "text-right text-2xl font-medium text-stone-100",
        warning && "text-amber-300",
        danger && "text-red-300"
      )}
    >
      {value}
    </div>
  )
}

function SnapshotValue({
  label,
  value,
  danger,
}: {
  label: string
  value: string
  danger?: boolean
}) {
  return (
    <div className="rounded-md border border-white/10 bg-black/10 px-3 py-3">
      <div className="text-sm text-stone-400">{label}</div>
      <div
        className={cn(
          "mt-1 text-3xl font-semibold tracking-tight text-stone-100",
          danger && "text-red-300"
        )}
      >
        {value}
      </div>
    </div>
  )
}
