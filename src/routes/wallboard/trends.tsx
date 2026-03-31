import { createFileRoute } from "@tanstack/react-router"
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"
import { Sparkline } from "@/components/wallboard/sparkline"
import { WallboardSection, WallboardShell } from "@/components/wallboard/wallboard-shell"
import { getTrendsWallboard } from "@/lib/support-health/server"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/wallboard/trends")({
  loader: async () => getTrendsWallboard(),
  component: TrendsWallboardPage,
})

function TrendsWallboardPage() {
  const data = Route.useLoaderData()
  const month = data.periods[0]

  return (
    <WallboardShell
      title="Support Quality"
      refreshedAt={data.snapshot.freshnessTimestamp ?? data.refreshedAt}
      stale={data.snapshot.stale}
    >
      <div className="grid h-full grid-cols-[minmax(0,1.35fr)_minmax(360px,0.85fr)] gap-6">
        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-6">
          <WallboardSection title="CX score">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
              <div className="rounded-md border border-white/10 bg-black/10 p-5">
                <div className="text-base text-stone-400">Current month</div>
                <div className="mt-2 flex items-end gap-4">
                  <div className="text-7xl font-semibold tracking-tight text-stone-50">
                    {month?.score?.toFixed(1) ?? "—"}
                  </div>
                  <PeriodDelta value={month?.deltaFromPrevious ?? null} />
                </div>
                <div className="mt-4 text-lg text-stone-300">
                  Response rate {month?.responseRatePercent ?? 0}% • {month?.ratedCount ?? 0} of{" "}
                  {month?.eligibleCount ?? 0} eligible conversations rated
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {data.periods.slice(1).map((period) => (
                  <div
                    key={period.label}
                    className="rounded-md border border-white/10 bg-white/[0.03] p-4"
                  >
                    <div className="text-sm text-stone-400">{period.label}</div>
                    <div className="mt-2 text-4xl font-semibold tracking-tight text-stone-50">
                      {period.score?.toFixed(1) ?? "—"}
                    </div>
                    <div className="mt-2 text-sm text-stone-300">
                      Response rate {period.responseRatePercent}%
                    </div>
                    <div className="mt-3">
                      <PeriodDelta value={period.deltaFromPrevious} compact />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </WallboardSection>

          <div className="grid min-h-0 grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] gap-6">
            <WallboardSection title="Current month trend" className="min-h-0">
              <div className="flex h-full flex-col justify-between gap-6">
                <div className="text-lg text-stone-300">
                  The month view leads the screen. Quarter and year stay visible as context,
                  but the current run rate stays dominant.
                </div>
                <div className="rounded-md border border-white/10 bg-black/10 p-4">
                  <Sparkline
                    values={data.cxSeries.map((point) => point.value)}
                    className="h-48"
                    strokeClassName="stroke-[#d6d3d1]"
                  />
                  <div className="mt-4 grid grid-cols-6 gap-2 text-sm text-stone-500">
                    {data.cxSeries
                      .filter((_, index, list) => index === 0 || index === list.length - 1 || index % 5 === 0)
                      .map((point) => (
                        <div key={point.label}>{point.label}</div>
                      ))}
                  </div>
                </div>
              </div>
            </WallboardSection>

            <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-6">
              <WallboardSection title="Recurring themes" className="min-h-0">
                <div className="space-y-4">
                  {data.themeTrends.length === 0 ? (
                    <div className="text-base text-stone-400">No theme trends yet.</div>
                  ) : (
                    data.themeTrends.map((theme) => (
                      <div key={theme.label} className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="truncate text-lg font-medium text-stone-100">
                            {theme.label}
                          </div>
                          <div className="text-sm text-stone-400">
                            {theme.currentCount} this period • {theme.previousCount} prior
                          </div>
                        </div>
                        <div
                          className={cn(
                            "text-lg font-medium",
                            theme.delta > 0
                              ? "text-amber-300"
                              : theme.delta < 0
                                ? "text-emerald-300"
                                : "text-stone-400"
                          )}
                        >
                          {theme.delta > 0 ? "+" : ""}
                          {theme.delta}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </WallboardSection>

              <WallboardSection title="Reopen trend" className="min-h-0">
                <div className="rounded-md border border-white/10 bg-black/10 p-4">
                  <Sparkline
                    values={data.reopenTrend.map((point) => point.value)}
                    className="h-28"
                    strokeClassName="stroke-[#f59e0b]"
                  />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {data.reopenTrend.slice(-4).map((point) => (
                    <div key={point.label} className="rounded-md border border-white/10 px-3 py-3">
                      <div className="text-sm text-stone-400">{point.label}</div>
                      <div className="mt-1 text-2xl font-semibold text-stone-50">
                        {point.value ?? 0}
                      </div>
                    </div>
                  ))}
                </div>
              </WallboardSection>
            </div>
          </div>
        </div>

        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-6">
          <WallboardSection title="Live support context">
            <div className="grid grid-cols-2 gap-5">
              <Fact label="SLA now" value={`${data.snapshot.slaAdherencePercent}%`} />
              <Fact label="Breached" value={String(data.snapshot.breachedCount)} />
              <Fact label="Due soon" value={String(data.snapshot.dueSoonCount)} />
              <Fact label="High-risk" value={String(data.snapshot.urgentHighRiskCount)} />
            </div>
          </WallboardSection>

          <WallboardSection title="Queues under pressure" className="min-h-0">
            <div className="space-y-4">
              {data.queuePressure.length === 0 ? (
                <div className="text-base text-stone-400">No pressure shifts yet.</div>
              ) : (
                data.queuePressure.map((queue) => (
                  <div key={queue.teamName} className="rounded-md border border-white/10 px-4 py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="truncate text-lg font-medium text-stone-100">
                          {queue.teamName}
                        </div>
                        <div className="text-sm text-stone-400">
                          {queue.currentOpenCount} opened in the last 7 days
                        </div>
                      </div>
                      <div
                        className={cn(
                          "text-xl font-medium",
                          queue.delta > 0
                            ? "text-amber-300"
                            : queue.delta < 0
                              ? "text-emerald-300"
                              : "text-stone-400"
                        )}
                      >
                        {queue.delta > 0 ? "+" : ""}
                        {queue.delta}
                      </div>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-white/5">
                      <div
                        className={cn(
                          "h-2 rounded-full",
                          queue.delta > 0 ? "bg-amber-400" : "bg-stone-300"
                        )}
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(
                              8,
                              (queue.currentOpenCount /
                                Math.max(...data.queuePressure.map((item) => item.currentOpenCount), 1)) *
                                100
                            )
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </WallboardSection>
        </div>
      </div>
    </WallboardShell>
  )
}

function PeriodDelta({
  value,
  compact,
}: {
  value: number | null
  compact?: boolean
}) {
  if (value === null) {
    return <div className="text-sm text-stone-500">No prior comparison</div>
  }

  if (value > 0) {
    return (
      <div className={cn("flex items-center gap-2 text-emerald-300", compact ? "text-sm" : "text-lg")}>
        <ArrowUpRight className={cn(compact ? "h-4 w-4" : "h-5 w-5")} />
        {value.toFixed(1)} vs previous
      </div>
    )
  }

  if (value < 0) {
    return (
      <div className={cn("flex items-center gap-2 text-red-300", compact ? "text-sm" : "text-lg")}>
        <ArrowDownRight className={cn(compact ? "h-4 w-4" : "h-5 w-5")} />
        {Math.abs(value).toFixed(1)} vs previous
      </div>
    )
  }

  return (
    <div className={cn("flex items-center gap-2 text-stone-400", compact ? "text-sm" : "text-lg")}>
      <Minus className={cn(compact ? "h-4 w-4" : "h-5 w-5")} />
      Flat vs previous
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/10 px-4 py-4">
      <div className="text-sm text-stone-400">{label}</div>
      <div className="mt-2 text-4xl font-semibold tracking-tight text-stone-50">{value}</div>
    </div>
  )
}
