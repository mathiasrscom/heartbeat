import { startTransition } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { TriangleAlert } from "lucide-react"
import { InfoTooltip } from "@/components/info-tooltip"
import { SupportProductFilter } from "@/components/support-product-filter"
import { buildIntercomCaseUrl } from "@/lib/intercom-links"
import { getLiveWallboard } from "@/lib/support-health/server"
import { normalizeSupportProductFilterInput } from "@/lib/support-health/filter"
import type { CaseLookupItem, SupportHealthSnapshot } from "@/lib/support-health/types"
import { WallboardSection, WallboardShell } from "@/components/wallboard/wallboard-shell"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/wallboard/live")({
  validateSearch: (search: Record<string, unknown>) =>
    normalizeSupportProductFilterInput(search),
  loaderDeps: ({ search }) => normalizeSupportProductFilterInput(search),
  loader: async ({ deps }) => getLiveWallboard({ data: deps }),
  component: LiveWallboardPage,
})

function LiveWallboardPage() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

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

  return (
    <WallboardShell
      title="Support Health"
      refreshedAt={data.snapshot.freshnessTimestamp ?? data.refreshedAt}
      stale={data.snapshot.stale}
      toolbar={
        <SupportProductFilter
          availableProducts={data.availableProducts}
          selectedProducts={search.products ?? []}
          onChange={handleProductChange}
          mode="wallboard"
        />
      }
    >
      <div className="grid h-full grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)] gap-6">
        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-6">
          <WallboardSection title="Immediate queue" className="border border-white/10">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="space-y-4">
                <div className={cn("text-5xl font-semibold tracking-tight", getStatusTextClass(data.snapshot.status))}>
                  {data.snapshot.statusLabel}
                </div>
                <p className="max-w-[28rem] text-lg leading-8 text-stone-300">
                  {buildQueueHeadline(data.snapshot)}
                </p>
                <p className="max-w-[28rem] text-base leading-7 text-stone-400">
                  {buildQueueSupportingText(data.snapshot)}
                </p>
                <div className="text-sm text-stone-400">
                  Statuses: {data.statusBreakdown.open} open • {data.statusBreakdown.pending} pending
                </div>
                {data.snapshot.stale ? (
                  <div className="flex items-center gap-2 text-base text-amber-200">
                    <TriangleAlert className="h-5 w-5" />
                    Sync is older than 10 minutes. Treat these numbers as stale.
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                <Metric
                  label="Waiting on us"
                  tooltip="Open cases where support owes the next reply. Includes due soon and over-SLA."
                  value={String(data.snapshot.currentAwaitingTeamCount)}
                />
                <Metric
                  label="Due in 60m"
                  tooltip="Open SLA-tracked cases due within 60 minutes, excluding already breached cases."
                  value={String(data.snapshot.currentDueSoonCount)}
                />
                <Metric
                  label="Over SLA now"
                  tooltip="Open cases that are currently past their SLA due time."
                  value={String(data.snapshot.currentBreachedCount)}
                />
                <Metric
                  label="Unassigned"
                  tooltip="Open cases without an owner assigned."
                  value={String(data.snapshot.currentUnassignedCount)}
                />
                <Metric
                  label="High-risk"
                  tooltip="Open urgent/high-tier cases that are breached, due soon, or unassigned."
                  value={String(data.snapshot.currentUrgentHighRiskCount)}
                />
                <Metric
                  label="Waiting on customer"
                  tooltip="Open cases where the customer is expected to reply next."
                  value={String(data.snapshot.currentAwaitingCustomerCount)}
                />
              </div>
            </div>
          </WallboardSection>

          <WallboardSection title="By product right now" className="min-h-0">
            <div className="grid grid-cols-[minmax(0,1.2fr)_90px_90px_90px_90px_90px] gap-x-4 border-b border-white/10 pb-3 text-sm text-stone-400">
              <div>Product</div>
              <div className="text-right">Open</div>
              <div className="text-right">Waiting</div>
              <div className="text-right">Over SLA</div>
              <div className="text-right">Due in 60m</div>
              <div className="text-right">Unassigned</div>
            </div>
            <div className="divide-y divide-white/10">
              {data.mappedQueues.length === 0 ? (
                data.snapshot.unknownCaseCount > 0 ? (
                  <div className="py-10 text-lg text-stone-400">
                    Product mapping is still incomplete, so this wallboard cannot show product rows yet.
                  </div>
                ) : (
                  <div className="py-10 text-lg text-stone-400">No Intercom data yet.</div>
                )
              ) : (
                data.mappedQueues.map((queue) => (
                  <div
                    key={queue.teamName}
                    className="grid grid-cols-[minmax(0,1.2fr)_90px_90px_90px_90px_90px] gap-x-4 py-4 text-lg"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-stone-100">{queue.teamName}</div>
                      <div className="mt-1 text-sm text-stone-400">
                        {formatQueueSources(queue.sourceQueues)}
                      </div>
                    </div>
                    <QueueValue value={queue.activeCaseCount} />
                    <QueueValue value={queue.awaitingTeamCount} />
                    <QueueValue value={queue.breachedCount} danger />
                    <QueueValue value={queue.dueSoonCount} warning />
                    <QueueValue value={queue.unassignedCount} />
                  </div>
                ))
              )}
            </div>
          </WallboardSection>
        </div>

        <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-6">
          <WallboardSection title="Top 5 IDs to check" className="min-h-0">
            <div className="space-y-2">
              {data.lookupCases.length === 0 ? (
                <div className="text-lg text-stone-400">No open cases need support right now.</div>
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

          <WallboardSection title="Queue totals">
            <div className="grid grid-cols-2 gap-5">
              <StateBlock
                label="Waiting on us"
                tooltip="Open cases where support owes the next reply."
                value={data.snapshot.currentAwaitingTeamCount}
                tone="text-stone-100"
              />
              <StateBlock
                label="Over SLA now"
                tooltip="Open cases currently past SLA due time."
                value={data.snapshot.currentBreachedCount}
                tone="text-red-300"
              />
              <StateBlock
                label="Due in 60m"
                tooltip="Open SLA-tracked cases due in the next hour."
                value={data.snapshot.currentDueSoonCount}
                tone="text-amber-300"
              />
              <StateBlock
                label="Awaiting customer"
                tooltip="Open cases waiting for customer response."
                value={data.snapshot.currentAwaitingCustomerCount}
                tone="text-stone-300"
              />
            </div>
          </WallboardSection>
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

function Metric({
  label,
  tooltip,
  value,
}: {
  label: string
  tooltip?: string
  value: string
}) {
  return (
    <div>
      <div className="text-sm text-stone-400">
        <InfoTooltip label={label} tooltip={tooltip} />
      </div>
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
  tooltip,
  value,
  tone,
}: {
  label: string
  tooltip?: string
  value: number
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
