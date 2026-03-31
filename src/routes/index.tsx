import { Link, createFileRoute } from "@tanstack/react-router"
import {
  ArrowRight,
  Monitor,
  Settings2,
  ShieldAlert,
  TrendingUp,
  TriangleAlert,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getLiveWallboard, getTrendsWallboard } from "@/lib/support-health/server"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/")({
  loader: async () => {
    const [live, trends] = await Promise.all([getLiveWallboard(), getTrendsWallboard()])
    return { live, trends }
  },
  component: SupportDashboardPage,
})

function SupportDashboardPage() {
  const { live, trends } = Route.useLoaderData()
  const month = trends.periods[0]

  return (
    <div className="p-4 lg:p-6 max-w-7xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Support dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Start here for the current state, then jump into the monitor views when needed.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/wallboard/live">
            <Button variant="outline">
              <Monitor className="h-4 w-4" />
              Live wallboard
            </Button>
          </Link>
          <Link to="/settings">
            <Button variant="ghost">
              <Settings2 className="h-4 w-4" />
              Settings
            </Button>
          </Link>
        </div>
      </div>

      {live.snapshot.stale ? (
        <Card className="mb-6 border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-center gap-3 p-4 text-sm">
            <TriangleAlert className="h-4 w-4 text-amber-600" />
            The last sync is older than 10 minutes. Treat the board as stale until the next
            Intercom refresh succeeds.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle>Current state</CardTitle>
                  <CardDescription>
                    On track means SLA now plus due-soon risk, not closure volume.
                  </CardDescription>
                </div>
                <StatusBadge status={live.snapshot.status} label={live.snapshot.statusLabel} />
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <MetricCard label="SLA now" value={`${live.snapshot.slaAdherencePercent}%`} />
              <MetricCard label="Due in 60m" value={String(live.snapshot.dueSoonCount)} />
              <MetricCard label="Breached" value={String(live.snapshot.breachedCount)} danger />
              <MetricCard label="Unassigned" value={String(live.snapshot.unassignedCount)} />
              <MetricCard
                label="High-risk cases"
                value={String(live.snapshot.urgentHighRiskCount)}
                warning
              />
              <MetricCard
                label="Oldest actionable"
                value={formatAge(live.snapshot.oldestActionableAgeMinutes)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle>Queues needing attention</CardTitle>
                  <CardDescription>
                    Sorted by breach pressure, due-soon risk, and queue age.
                  </CardDescription>
                </div>
                <Link to="/wallboard/live">
                  <Button variant="ghost" size="sm">
                    Open monitor
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {live.queues.length === 0 ? (
                <div className="rounded-md border p-4 text-sm text-muted-foreground">
                  No Intercom data yet.
                </div>
              ) : (
                live.queues.slice(0, 5).map((queue) => (
                  <div
                    key={queue.teamName}
                    className="grid gap-3 rounded-md border p-4 lg:grid-cols-[minmax(0,1fr)_80px_80px_90px_90px]"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{queue.teamName}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Awaiting team {queue.awaitingTeamCount} • Enterprise {queue.enterpriseCount}
                      </div>
                    </div>
                    <QueueMetric label="Breached" value={queue.breachedCount} danger />
                    <QueueMetric label="Due soon" value={queue.dueSoonCount} warning />
                    <QueueMetric label="Unassigned" value={queue.unassignedCount} />
                    <QueueMetric
                      label="Oldest"
                      value={formatAge(queue.oldestActionableAgeMinutes)}
                    />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle>Next actions</CardTitle>
              <CardDescription>
                The top queues to act on right now.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {live.actionItems.length === 0 ? (
                <div className="rounded-md border p-4 text-sm text-muted-foreground">
                  Nothing urgent right now.
                </div>
              ) : (
                live.actionItems.map((item) => (
                  <div key={item.id} className="rounded-md border p-4">
                    <div
                      className={cn(
                        "flex items-center gap-2 font-medium",
                        item.severity === "red" ? "text-red-700" : "text-amber-700"
                      )}
                    >
                      {item.severity === "red" ? (
                        <ShieldAlert className="h-4 w-4" />
                      ) : (
                        <TriangleAlert className="h-4 w-4" />
                      )}
                      {item.label}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">{item.detail}</div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle>CX pulse</CardTitle>
                  <CardDescription>
                    Month leads. Quarter and year stay as context.
                  </CardDescription>
                </div>
                <Link to="/wallboard/trends">
                  <Button variant="ghost" size="sm">
                    Open trends
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border p-4">
                <div className="text-sm text-muted-foreground">Current month</div>
                <div className="mt-2 flex items-end gap-3">
                  <div className="text-5xl font-semibold tracking-tight">
                    {month?.score?.toFixed(1) ?? "—"}
                  </div>
                  <div className="mb-1 text-sm text-muted-foreground">
                    Response rate {month?.responseRatePercent ?? 0}%
                  </div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {trends.periods.slice(1).map((period) => (
                  <div key={period.label} className="rounded-md border p-4">
                    <div className="text-sm text-muted-foreground">{period.label}</div>
                    <div className="mt-1 text-3xl font-semibold tracking-tight">
                      {period.score?.toFixed(1) ?? "—"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Response rate {period.responseRatePercent}%
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle>Monitor routes</CardTitle>
              <CardDescription>
                Use these for the office displays. The dashboard stays the normal app entrypoint.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <RouteLink to="/wallboard/live" label="Live wallboard" />
              <RouteLink to="/wallboard/trends" label="Trends wallboard" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({
  status,
  label,
}: {
  status: "green" | "yellow" | "red"
  label: string
}) {
  const variant =
    status === "green" ? "success" : status === "yellow" ? "warning" : "destructive"
  return <Badge variant={variant}>{label}</Badge>
}

function MetricCard({
  label,
  value,
  warning,
  danger,
}: {
  label: string
  value: string
  warning?: boolean
  danger?: boolean
}) {
  return (
    <div className="rounded-md border p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-2 text-4xl font-semibold tracking-tight",
          warning && "text-amber-700 dark:text-amber-400",
          danger && "text-red-700 dark:text-red-400"
        )}
      >
        {value}
      </div>
    </div>
  )
}

function QueueMetric({
  label,
  value,
  warning,
  danger,
}: {
  label: string
  value: string | number
  warning?: boolean
  danger?: boolean
}) {
  return (
    <div className="text-right">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 text-lg font-medium",
          warning && "text-amber-700 dark:text-amber-400",
          danger && "text-red-700 dark:text-red-400"
        )}
      >
        {value}
      </div>
    </div>
  )
}

function RouteLink({ to, label }: { to: "/wallboard/live" | "/wallboard/trends"; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between rounded-md border px-3 py-3 transition-colors hover:bg-accent"
    >
      <span className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
        {label}
      </span>
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  )
}

function formatAge(minutes: number | null) {
  if (minutes === null) return "None"
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`
}
