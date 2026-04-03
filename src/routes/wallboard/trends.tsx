import { startTransition } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { InfoTooltip } from "@/components/info-tooltip"
import { SupportCxSummary } from "@/components/support-cx-summary"
import { SupportPeriodFilter } from "@/components/support-period-filter"
import { SupportProductFilter } from "@/components/support-product-filter"
import { WallboardSection, WallboardShell } from "@/components/wallboard/wallboard-shell"
import { buildIntercomCaseUrl } from "@/lib/intercom-links"
import { normalizeSupportProductFilterInput } from "@/lib/support-health/filter"
import { normalizeSupportPeriodInput, type SupportPeriodInput } from "@/lib/support-health/period"
import { getTrendsWallboard } from "@/lib/support-health/server"
import type { CaseLookupItem } from "@/lib/support-health/types"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/wallboard/trends")({
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
      <div className="grid h-full grid-cols-[minmax(0,1.45fr)_420px] gap-6">
        <WallboardSection title="Products">
          <div className="space-y-6">
            <div className="grid gap-4 xl:grid-cols-5">
              <SummaryTile
                label="Open now"
                tooltip="Count of currently open cases in the selected products."
                value={String(data.periodSummary.openNowCount)}
              />
              <SummaryTile
                label="Waiting on us"
                tooltip="Open cases where support owes the next reply."
                value={String(data.periodSummary.awaitingTeamNowCount)}
              />
              <SummaryTile
                label="Over SLA now"
                tooltip="Open cases currently past SLA due time."
                value={String(data.periodSummary.breachedNowCount)}
                danger
              />
              <SummaryTile
                label={`SLA ${data.period.label.toLowerCase()}`}
                tooltip={`SLA adherence for the ${data.period.label.toLowerCase()} period.`}
                value={
                  data.periodSummary.slaAdherencePercent === null
                    ? "—"
                    : `${data.periodSummary.slaAdherencePercent}%`
                }
                danger={
                  data.periodSummary.slaAdherencePercent !== null &&
                  data.periodSummary.slaAdherencePercent < 90
                }
              />
              <SummaryTile
                label={`CX in ${data.period.label.toLowerCase()}`}
                tooltip={`Average CX score from rated conversations resolved in ${data.period.label.toLowerCase()}.`}
                value={
                  data.periodSummary.cxScore === null
                    ? "—"
                    : data.periodSummary.cxScore.toFixed(1)
                }
              />
            </div>

            <div className="grid grid-cols-[minmax(0,1.4fr)_110px_110px_110px_120px_90px_90px] gap-x-4 border-b border-white/10 pb-3 text-sm text-stone-400">
              <div>Product</div>
              <div className="text-right">Waiting</div>
              <div className="text-right">Over SLA</div>
              <div className="text-right">Open</div>
              <div className="text-right">SLA period</div>
              <div className="text-right">CX</div>
              <div className="text-right">Rated</div>
            </div>

            <div className="divide-y divide-white/10">
              {data.productHealth.length === 0 ? (
                <div className="py-10 text-lg text-stone-400">No product activity in this view.</div>
              ) : (
                data.productHealth.map((row) => (
                  <div
                    key={`${row.serviceBucket}-${row.productName}`}
                    className="grid grid-cols-[minmax(0,1.4fr)_110px_110px_110px_120px_90px_90px] gap-x-4 py-4"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xl font-medium text-stone-100">
                        {row.productName}
                      </div>
                    </div>
                    <Cell value={row.awaitingTeamCount} warning={row.awaitingTeamCount > 0} />
                    <Cell value={row.breachedNowCount} danger={row.breachedNowCount > 0} />
                    <Cell value={row.openNowCount} />
                    <Cell
                      value={
                        row.slaAdherencePercent === null ? "—" : `${row.slaAdherencePercent}%`
                      }
                      danger={row.slaAdherencePercent !== null && row.slaAdherencePercent < 90}
                    />
                    <Cell value={row.cxScore === null ? "—" : row.cxScore.toFixed(1)} />
                    <Cell
                      value={`${row.responseRatePercent}%`}
                      warning={row.responseRatePercent > 0 && row.responseRatePercent < 20}
                    />
                  </div>
                ))
              )}
            </div>
            <div className="rounded-md border border-white/10 bg-black/10 px-4 py-3 text-sm text-stone-300">
              SLA score for selected period:{" "}
              {data.periodSummary.slaAdherencePercent === null
                ? "—"
                : `${data.periodSummary.slaAdherencePercent}%`}{" "}
              ({data.periodSummary.slaMissedCount} breached of{" "}
              {data.periodSummary.slaTrackedCount} tracked). Target: 90%.
            </div>
          </div>
        </WallboardSection>

        <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-6">
          <WallboardSection title="Top 5 IDs to inspect" className="min-h-0">
            <div className="space-y-2">
              {data.lookupCases.length === 0 ? (
                <div className="text-base text-stone-400">
                  No open cases need support in the selected products.
                </div>
              ) : (
                data.lookupCases.map((item) => (
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

          <WallboardSection title="Customer happiness">
            <div className="space-y-3">
              <div className="rounded-md border border-white/10 bg-black/10 px-4 py-4">
                <SupportCxSummary
                  label={data.period.label}
                  score={data.periodSummary.cxScore}
                  ratedCount={data.periodSummary.ratedCount}
                  positiveCount={data.periodSummary.positiveCount}
                  responseRatePercent={data.periodSummary.responseRatePercent}
                  ratingMix={data.periodSummary.ratingMix}
                  variant="wallboard"
                />
              </div>
              <div className="grid gap-3">
                {data.periods.map((period) => (
                  <div
                    key={period.label}
                    className="rounded-md border border-white/10 bg-black/10 px-4 py-4"
                  >
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <div className="text-sm text-stone-400">{period.label}</div>
                        <div className="mt-2 text-4xl font-semibold tracking-tight text-stone-50">
                          {period.score?.toFixed(1) ?? "—"}
                        </div>
                      </div>
                      <div className="text-right text-sm text-stone-400">
                        <div>Rated</div>
                        <div className="mt-1 text-lg text-stone-200">
                          {period.responseRatePercent}%
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </WallboardSection>
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
