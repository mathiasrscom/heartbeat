import { createFileRoute } from "@tanstack/react-router"
import { AlertTriangle, ShieldAlert, TriangleAlert } from "lucide-react"
import { getLiveWallboard } from "@/lib/support-health/server"
import { WallboardSection, WallboardShell } from "@/components/wallboard/wallboard-shell"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/wallboard/live")({
  loader: async () => getLiveWallboard(),
  component: LiveWallboardPage,
})

function getStatusClasses(status: "green" | "yellow" | "red") {
  if (status === "green") {
    return {
      panel: "border-emerald-500/30 bg-emerald-500/[0.08]",
      text: "text-emerald-300",
    }
  }

  if (status === "yellow") {
    return {
      panel: "border-amber-500/30 bg-amber-500/[0.08]",
      text: "text-amber-300",
    }
  }

  return {
    panel: "border-red-500/30 bg-red-500/[0.08]",
    text: "text-red-300",
  }
}

function formatAge(minutes: number | null) {
  if (minutes === null) return "None"
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`
}

function LiveWallboardPage() {
  const data = Route.useLoaderData()
  const statusClasses = getStatusClasses(data.snapshot.status)

  return (
    <WallboardShell
      title="Support Health"
      refreshedAt={data.snapshot.freshnessTimestamp ?? data.refreshedAt}
      stale={data.snapshot.stale}
    >
      <div className="grid h-full grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)] gap-6">
        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-6">
          <WallboardSection
            title="Immediate health"
            className={cn("border", statusClasses.panel)}
          >
            <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="space-y-4">
                <div className={cn("text-5xl font-semibold tracking-tight", statusClasses.text)}>
                  {data.snapshot.statusLabel}
                </div>
                <p className="max-w-[28rem] text-lg leading-8 text-stone-300">
                  The board stays focused on SLA health, near-term risk, and what the team
                  should pick up next.
                </p>
                {data.snapshot.stale ? (
                  <div className="flex items-center gap-2 text-base text-amber-200">
                    <TriangleAlert className="h-5 w-5" />
                    Sync is older than 10 minutes. Treat these numbers as stale.
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                <Metric label="SLA now" value={`${data.snapshot.slaAdherencePercent}%`} />
                <Metric label="Due in 60m" value={String(data.snapshot.dueSoonCount)} />
                <Metric label="Breached" value={String(data.snapshot.breachedCount)} />
                <Metric label="Unassigned" value={String(data.snapshot.unassignedCount)} />
                <Metric
                  label="High-risk cases"
                  value={String(data.snapshot.urgentHighRiskCount)}
                />
                <Metric
                  label="Oldest actionable"
                  value={formatAge(data.snapshot.oldestActionableAgeMinutes)}
                />
              </div>
            </div>
          </WallboardSection>

          <WallboardSection title="Queue health" className="min-h-0">
            <div className="grid grid-cols-[minmax(0,1.2fr)_80px_80px_80px_90px_90px_90px] gap-x-4 border-b border-white/10 pb-3 text-sm text-stone-400">
              <div>Queue</div>
              <div className="text-right">Active</div>
              <div className="text-right">Breached</div>
              <div className="text-right">Due</div>
              <div className="text-right">Unassigned</div>
              <div className="text-right">Urgent</div>
              <div className="text-right">Oldest</div>
            </div>
            <div className="divide-y divide-white/10">
              {data.queues.length === 0 ? (
                <div className="py-10 text-lg text-stone-400">No Intercom data yet.</div>
              ) : (
                data.queues.map((queue) => (
                  <div
                    key={queue.teamName}
                    className="grid grid-cols-[minmax(0,1.2fr)_80px_80px_80px_90px_90px_90px] gap-x-4 py-4 text-lg"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-stone-100">{queue.teamName}</div>
                      <div className="mt-1 text-sm text-stone-400">
                        Awaiting team {queue.awaitingTeamCount} • Enterprise {queue.enterpriseCount}
                      </div>
                    </div>
                    <QueueValue value={queue.activeCaseCount} />
                    <QueueValue value={queue.breachedCount} danger />
                    <QueueValue value={queue.dueSoonCount} warning />
                    <QueueValue value={queue.unassignedCount} />
                    <QueueValue value={queue.urgentCount} />
                    <QueueValue value={formatAge(queue.oldestActionableAgeMinutes)} />
                  </div>
                ))
              )}
            </div>
          </WallboardSection>
        </div>

        <div className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-6">
          <WallboardSection title="What needs action now">
            <div className="space-y-4">
              {data.actionItems.length === 0 ? (
                <div className="text-lg text-stone-400">No immediate action items.</div>
              ) : (
                data.actionItems.map((item) => (
                  <div key={item.id} className="border-b border-white/10 pb-4 last:border-b-0 last:pb-0">
                    <div
                      className={cn(
                        "mb-1 flex items-center gap-2 text-xl font-medium",
                        item.severity === "red" ? "text-red-300" : "text-amber-300"
                      )}
                    >
                      {item.severity === "red" ? (
                        <ShieldAlert className="h-5 w-5" />
                      ) : (
                        <AlertTriangle className="h-5 w-5" />
                      )}
                      {item.label}
                    </div>
                    <div className="pl-7 text-base text-stone-300">{item.detail}</div>
                  </div>
                ))
              )}
            </div>
          </WallboardSection>

          <WallboardSection title="Work states">
            <div className="grid grid-cols-2 gap-5">
              <StateBlock
                label="Awaiting team"
                value={data.snapshot.awaitingTeamCount}
                tone="text-stone-100"
              />
              <StateBlock
                label="Awaiting customer"
                value={data.snapshot.awaitingCustomerCount}
                tone="text-stone-300"
              />
              <StateBlock
                label="Due soon"
                value={data.snapshot.dueSoonCount}
                tone="text-amber-300"
              />
              <StateBlock
                label="Breached"
                value={data.snapshot.breachedCount}
                tone="text-red-300"
              />
            </div>
          </WallboardSection>

          <WallboardSection title="Priority mix">
            <div className="space-y-5">
              {data.queues.slice(0, 4).map((queue) => {
                const total = Math.max(queue.activeCaseCount, 1)
                return (
                  <div key={queue.teamName}>
                    <div className="mb-2 flex items-center justify-between text-sm text-stone-300">
                      <span>{queue.teamName}</span>
                      <span>{queue.activeCaseCount} active</span>
                    </div>
                    <div className="flex h-4 overflow-hidden rounded-sm bg-white/5">
                      <div
                        className="bg-stone-500"
                        style={{ width: `${(queue.priorityMix.low / total) * 100}%` }}
                      />
                      <div
                        className="bg-stone-300"
                        style={{ width: `${(queue.priorityMix.normal / total) * 100}%` }}
                      />
                      <div
                        className="bg-amber-400"
                        style={{ width: `${(queue.priorityMix.high / total) * 100}%` }}
                      />
                      <div
                        className="bg-red-400"
                        style={{ width: `${(queue.priorityMix.urgent / total) * 100}%` }}
                      />
                    </div>
                  </div>
                )
              })}
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm text-stone-400">
                <Legend label="Low" tone="bg-stone-500" />
                <Legend label="Normal" tone="bg-stone-300" />
                <Legend label="High" tone="bg-amber-400" />
                <Legend label="Urgent" tone="bg-red-400" />
              </div>
            </div>
          </WallboardSection>
        </div>
      </div>
    </WallboardShell>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm text-stone-400">{label}</div>
      <div className="mt-1 text-4xl font-semibold tracking-tight text-stone-50">{value}</div>
    </div>
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
  value,
  tone,
}: {
  label: string
  value: number
  tone: string
}) {
  return (
    <div className="rounded-md border border-white/10 bg-black/10 px-4 py-4">
      <div className="text-sm text-stone-400">{label}</div>
      <div className={cn("mt-2 text-4xl font-semibold tracking-tight", tone)}>{value}</div>
    </div>
  )
}

function Legend({ label, tone }: { label: string; tone: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("h-3 w-3 rounded-[2px]", tone)} />
      <span>{label}</span>
    </div>
  )
}
