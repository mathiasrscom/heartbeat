import { startTransition, useMemo } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { TriangleAlert } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { InfoTooltip } from "@/components/info-tooltip"
import { SupportProductFilter } from "@/components/support-product-filter"
import { useProductAutoplay } from "@/components/wallboard/product-autoplay-strip"
import { RotatingPanels } from "@/components/wallboard/rotating-panels"
import { WallboardSection, WallboardShell } from "@/components/wallboard/wallboard-shell"
import { buildIntercomCaseUrl } from "@/lib/intercom-links"
import { normalizeSupportProductFilterInput } from "@/lib/support-health/filter"
import { getLiveWallboard } from "@/lib/support-health/server"
import type {
  CaseLookupItem,
  LiveFocusLane,
  LiveWallboardData,
  SupportHealthSnapshot,
} from "@/lib/support-health/types"
import { cn } from "@/lib/utils"

const TOP_LOOKUP_LIMIT = 4

export const Route = createFileRoute("/wallboard/live")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) =>
    normalizeSupportProductFilterInput(search),
  loaderDeps: ({ search }) => normalizeSupportProductFilterInput(search),
  loader: async ({ deps }) => getLiveWallboard({ data: deps }),
  component: LiveWallboardPage,
})

function LiveWallboardPage() {
  const live = Route.useLoaderData() as LiveWallboardData
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
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
  const focusedProductName = resolveFocusedProductName({
    aiFocusProductName: live.focusPlan?.focusProductName ?? null,
    selectedProducts: search.products ?? [],
    autoplayProductName: autoplay.activeProduct,
    availableProducts: live.availableProducts,
  })
  const focusedQueue =
    focusedProductName === null
      ? null
      : live.mappedQueues.find((queue) => queue.teamName === focusedProductName) ?? null
  const prioritizedLookupPool =
    focusedProductName === null
      ? live.lookupCases
      : live.lookupCases.filter((item) => item.productName === focusedProductName)
  const prioritizedLookupCases = prioritizeLookupCases(
    prioritizedLookupPool.length > 0 ? prioritizedLookupPool : live.lookupCases,
    live.focusPlan?.topCaseExternalIds ?? []
  )
  const focusedLookupCases =
    prioritizedLookupCases.slice(0, TOP_LOOKUP_LIMIT)
  const focusStatus = resolveFocusStatus(focusedQueue)
  const focusStatusLabel = buildStatusLabel(focusStatus)
  const focusPrimaryAction = buildFocusPrimaryAction(focusedQueue)
  const focusSecondaryAction = buildFocusSecondaryAction(focusedQueue)
  const aiHeadline = live.focusPlan?.headline?.trim() || null
  const aiSupportingText = live.focusPlan?.supportingText?.trim() || null
  const laneRows = buildLaneRows(live.snapshot)
  const orderedLaneRows = resolveLaneOrder(live.focusPlan?.laneOrder).map((lane) => laneRows[lane])
  const liveTickerItems = buildLiveTickerItems(live, focusedProductName, focusedQueue)

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

  const immediateQueuePanel = (
    <WallboardSection title="Immediate queue state">
      <div className="grid gap-4 xl:grid-cols-3">
        <QueueInlineMetric label="Open now" value={live.snapshot.currentActiveCaseCount} />
        <QueueInlineMetric label="Waiting on us" value={live.snapshot.currentAwaitingTeamCount} />
        <QueueInlineMetric
          label="Over SLA"
          value={live.snapshot.currentBreachedCount}
          danger={live.snapshot.currentBreachedCount > 0}
        />
        <QueueInlineMetric
          label="Due in 60m"
          value={live.snapshot.currentDueSoonCount}
          warning={live.snapshot.currentDueSoonCount > 0}
        />
        <QueueInlineMetric
          label="Unassigned"
          value={live.snapshot.currentUnassignedCount}
          warning={live.snapshot.currentUnassignedCount > 0}
        />
        <QueueInlineMetric
          label="Waiting on customer"
          value={live.snapshot.currentAwaitingCustomerCount}
        />
      </div>

      <div className="mt-4 grid gap-2">
        {orderedLaneRows.map((lane) => (
          <LiveLaneRow
            key={lane.id}
            label={lane.label}
            count={lane.count}
            detail={lane.detail}
            tone={lane.tone}
          />
        ))}
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
      <div className="space-y-3">
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
            const nextAction = buildQueueRowAction(queue)

            return (
              <div
                key={queue.teamName}
                className="rounded-md border border-white/10 bg-black/10 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-lg font-medium text-stone-100">{queue.teamName}</div>
                    <div className="mt-1 text-xs text-stone-400">
                      {formatQueueSources(queue.sourceQueues)}
                    </div>
                  </div>
                  <QueueActionValue
                    text={nextAction.text}
                    tone={nextAction.tone}
                    className="max-w-[42ch] text-right"
                  />
                </div>
                <div className="mt-3 grid grid-cols-5 gap-2">
                  <QueueInlineMetric label="Open" value={queue.activeCaseCount} />
                  <QueueInlineMetric label="Waiting" value={queue.awaitingTeamCount} />
                  <QueueInlineMetric label="Over SLA" value={queue.breachedCount} danger />
                  <QueueInlineMetric label="Due" value={queue.dueSoonCount} warning />
                  <QueueInlineMetric label="Unassigned" value={queue.unassignedCount} />
                </div>
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
          {aiHeadline ??
            (focusedProductName
              ? `${focusedProductName}: ${focusPrimaryAction}`
              : buildQueueHeadline(live.snapshot))}
        </p>
        <p className="text-sm leading-6 text-stone-400">
          {aiSupportingText ??
            (focusedProductName ? focusSecondaryAction : buildQueueSupportingText(live.snapshot))}
        </p>

        <div className="grid grid-cols-2 gap-4">
          <StateBlock
            label="SLA now"
            tooltip="Current open-case SLA adherence in selected products."
            value={`${live.snapshot.slaAdherencePercent}%`}
            tone={
              live.snapshot.slaAdherencePercent >= 90
                ? "text-emerald-300"
                : live.snapshot.slaAdherencePercent >= 75
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
      title={
        focusedProductName
          ? `Top ${TOP_LOOKUP_LIMIT} IDs • ${focusedProductName}`
          : `Top ${TOP_LOOKUP_LIMIT} IDs to check`
      }
      className="min-h-0"
    >
      <div className="space-y-2">
        {focusedLookupCases.length === 0 ? (
          <div className="text-lg text-stone-400">No open cases need support right now.</div>
        ) : (
          focusedLookupCases.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-[minmax(0,1fr)_130px] items-center gap-3 rounded-md border border-white/10 bg-black/10 px-3 py-2.5"
            >
              <div className="min-w-0">
                <CaseLink item={item} appUrl={live.intercomAppUrl} />
                <div className="mt-1 text-xs text-stone-300">
                  <div className="font-medium text-stone-100">
                    {formatProductName(item.productName)}
                  </div>
                  <div className="text-stone-400">
                    {item.queueName} • {formatLookupSubtype(item.subtype)}
                  </div>
                  <div className="mt-2">
                    <LookupAssignee item={item} />
                  </div>
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
                <div className="mt-1 text-sm text-stone-300">{item.ageLabel}</div>
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
      tickerItems={liveTickerItems}
      toolbar={
        <div className="flex flex-wrap items-center gap-3">
          <SupportProductFilter
            availableProducts={live.availableProducts}
            selectedProducts={search.products ?? []}
            onChange={handleProductChange}
            mode="wallboard"
          />
          <div className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-stone-400">
            Focus:{" "}
            <span className="font-medium text-stone-200">
              {focusedProductName ?? "All products"}
            </span>{" "}
            <span className="text-stone-500">• 12s</span>
          </div>
        </div>
      }
    >
      <div className="grid h-full min-h-0 grid-cols-[minmax(0,1.55fr)_minmax(340px,0.95fr)] gap-6">
        <RotatingPanels
          panels={[
            {
              id: "live-immediate-queue",
              label: "Immediate queue",
              content: immediateQueuePanel,
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

function resolveFocusedProductName(input: {
  aiFocusProductName: string | null
  selectedProducts: string[]
  autoplayProductName: string | null
  availableProducts: string[]
}) {
  const { aiFocusProductName, selectedProducts, autoplayProductName, availableProducts } = input
  if (!aiFocusProductName) return autoplayProductName
  if (!availableProducts.includes(aiFocusProductName)) return autoplayProductName
  if (selectedProducts.length > 0 && !selectedProducts.includes(aiFocusProductName)) {
    return autoplayProductName
  }
  return aiFocusProductName
}

function prioritizeLookupCases(
  lookupCases: CaseLookupItem[],
  prioritizedExternalIds: string[]
) {
  if (prioritizedExternalIds.length === 0) return lookupCases

  const priority = new Map<string, number>()
  prioritizedExternalIds.forEach((externalId, index) => {
    priority.set(externalId, index)
  })

  return [...lookupCases].sort((left, right) => {
    const leftPriority = priority.get(left.externalId)
    const rightPriority = priority.get(right.externalId)
    if (leftPriority !== undefined || rightPriority !== undefined) {
      if (leftPriority === undefined) return 1
      if (rightPriority === undefined) return -1
      return leftPriority - rightPriority
    }
    return left.externalId.localeCompare(right.externalId)
  })
}

function buildLaneRows(snapshot: SupportHealthSnapshot): Record<
  LiveFocusLane,
  {
    id: LiveFocusLane
    label: string
    count: number
    detail: string
    tone: "neutral" | "warning" | "danger"
  }
> {
  return {
    "over-sla": {
      id: "over-sla",
      label: "Over SLA lane",
      count: snapshot.currentBreachedCount,
      detail: "Reply first to cases already past SLA.",
      tone: snapshot.currentBreachedCount > 0 ? "danger" : "neutral",
    },
    "due-soon": {
      id: "due-soon",
      label: "Due soon lane",
      count: snapshot.currentDueSoonCount,
      detail: "Prevent new breaches in the next 60 minutes.",
      tone: snapshot.currentDueSoonCount > 0 ? "warning" : "neutral",
    },
    unassigned: {
      id: "unassigned",
      label: "Unassigned lane",
      count: snapshot.currentUnassignedCount,
      detail: "Assign owners so no case is waiting without responsibility.",
      tone: snapshot.currentUnassignedCount > 0 ? "warning" : "neutral",
    },
  }
}

function resolveLaneOrder(laneOrder?: LiveFocusLane[] | null) {
  const defaultOrder: LiveFocusLane[] = ["over-sla", "due-soon", "unassigned"]
  if (!laneOrder || laneOrder.length !== defaultOrder.length) return defaultOrder
  const unique = new Set(laneOrder)
  if (unique.size !== defaultOrder.length) return defaultOrder
  if (defaultOrder.some((lane) => !unique.has(lane))) return defaultOrder
  return laneOrder
}

function resolveFocusStatus(
  queue: LiveWallboardData["mappedQueues"][number] | null
): SupportHealthSnapshot["status"] {
  if (!queue) return "yellow"
  if (queue.breachedCount > 0 || queue.urgentCount > 0) return "red"
  if (queue.dueSoonCount > 0 || queue.unassignedCount > 0) {
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
  queue: LiveWallboardData["mappedQueues"][number] | null
) {
  if (!queue) return "Select or map a product to start focused playback."
  const parts = [
    `${queue.activeCaseCount} open`,
    `${queue.awaitingTeamCount} waiting on support`,
    `${queue.breachedCount} over SLA`,
  ]
  return parts.join(" • ")
}

function buildLiveTickerItems(
  live: LiveWallboardData,
  focusedProductName: string | null,
  focusedQueue: LiveWallboardData["mappedQueues"][number] | null
) {
  if (live.peopleMoments.length > 0) {
    return live.peopleMoments
  }

  const queueLabel = focusedProductName ?? "All products"
  const items: string[] = [
    `${queueLabel}: ${live.snapshot.currentBreachedCount} over SLA now`,
    `${queueLabel}: ${live.snapshot.currentUnassignedCount} unassigned`,
    `${queueLabel}: ${live.snapshot.currentDueSoonCount} due in 60m`,
  ]

  if (focusedQueue && focusedQueue.activeCaseCount > 0) {
    items.push(
      `${focusedQueue.teamName}: ${focusedQueue.activeCaseCount} open in active queue`
    )
  }

  return items
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
      title={`#${formatLookupId(item)}`}
      className="block truncate whitespace-nowrap font-mono text-lg font-semibold tabular-nums text-stone-50 underline decoration-white/30 underline-offset-4 transition hover:text-sky-300"
    >
      #{formatLookupId(item)}
    </a>
  )
}

function QueueActionValue({
  text,
  tone,
  className,
}: {
  text: string
  tone: "red" | "amber" | "stone" | "emerald"
  className?: string
}) {
  return (
    <div
      className={cn(
        "text-sm leading-6",
        tone === "red" && "text-red-200",
        tone === "amber" && "text-amber-200",
        tone === "emerald" && "text-emerald-200",
        tone === "stone" && "text-stone-300",
        className
      )}
    >
      {text}
    </div>
  )
}

function QueueInlineMetric({
  label,
  value,
  warning,
  danger,
}: {
  label: string
  value: number
  warning?: boolean
  danger?: boolean
}) {
  return (
    <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-stone-400">{label}</div>
      <div
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums text-stone-100",
          warning && "text-amber-300",
          danger && "text-red-300"
        )}
      >
        {value}
      </div>
    </div>
  )
}

function LiveLaneRow({
  label,
  count,
  detail,
  tone,
}: {
  label: string
  count: number
  detail: string
  tone: "neutral" | "warning" | "danger"
}) {
  return (
    <div className="grid grid-cols-[180px_80px_minmax(0,1fr)] items-center gap-3 rounded-md border border-white/10 bg-black/15 px-3 py-2">
      <div className="text-sm text-stone-300">{label}</div>
      <div
        className={cn(
          "text-2xl font-semibold tabular-nums text-stone-100",
          tone === "warning" && "text-amber-300",
          tone === "danger" && "text-red-300"
        )}
      >
        {count}
      </div>
      <div className="text-sm text-stone-400">{detail}</div>
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

function LookupAssignee({ item }: { item: CaseLookupItem }) {
  const assignedName = item.assigneeName?.trim() || null
  const label = assignedName ?? "Unassigned"

  return (
    <div className="flex items-center gap-2">
      <Avatar className="h-6 w-6 border border-white/15">
        {assignedName && item.assigneeAvatarUrl ? (
          <AvatarImage src={item.assigneeAvatarUrl} alt={assignedName} />
        ) : null}
        <AvatarFallback className="bg-white/10 text-[10px] text-stone-200">
          {assignedName ? toInitials(assignedName) : "UN"}
        </AvatarFallback>
      </Avatar>
      <span className={cn("text-xs", assignedName ? "text-stone-300" : "text-amber-200")}>
        {label}
      </span>
    </div>
  )
}

function toInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()

  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase()
}

function buildQueueRowAction(
  queue: LiveWallboardData["mappedQueues"][number]
): { text: string; tone: "red" | "amber" | "stone" | "emerald" } {
  if (queue.breachedCount > 0) {
    return {
      text: `Reply to ${queue.breachedCount} over-SLA case${
        queue.breachedCount === 1 ? "" : "s"
      } first.`,
      tone: "red",
    }
  }

  if (queue.dueSoonCount > 0) {
    return {
      text: `Handle ${queue.dueSoonCount} case${queue.dueSoonCount === 1 ? "" : "s"} due in 60m.`,
      tone: "amber",
    }
  }

  if (queue.unassignedCount > 0) {
    return {
      text: `Assign owner to ${queue.unassignedCount} unassigned case${
        queue.unassignedCount === 1 ? "" : "s"
      }.`,
      tone: "amber",
    }
  }

  if (queue.awaitingTeamCount > 0) {
    return {
      text: `Work through ${queue.awaitingTeamCount} case${
        queue.awaitingTeamCount === 1 ? "" : "s"
      } waiting on support.`,
      tone: "stone",
    }
  }

  return {
    text: "Healthy right now. Keep normal response pace.",
    tone: "emerald",
  }
}
