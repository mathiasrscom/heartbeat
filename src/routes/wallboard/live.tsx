import { createFileRoute, useRouter } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { useEffect, useMemo } from "react";
import { InfoTooltip } from "@/components/info-tooltip";
import {
	formatProductLabel,
	ProductBrandLabel,
	ProductBrandLogo,
} from "@/components/product-brand";
const wbCell = "rounded-lg border border-border/30 bg-white dark:border-transparent dark:bg-muted/50";
import { CaseLookupCard } from "@/components/wallboard/case-lookup-card";
import { PaginatedContent } from "@/components/wallboard/paginated-content";
import { useProductAutoplay } from "@/components/wallboard/product-autoplay-strip";
import { RotatingPanels } from "@/components/wallboard/rotating-panels";
import {
	WallboardSection,
	WallboardShell,
} from "@/components/wallboard/wallboard-shell";
import { getLiveWallboard } from "@/lib/support-health/server";
import { resolveSupportTargets } from "@/lib/support-health/targets";
import type {
	CaseLookupItem,
	LiveFocusLane,
	LiveWallboardData,
	SupportHealthSnapshot,
} from "@/lib/support-health/types";
import { cn } from "@/lib/utils";

const TOP_LOOKUP_LIMIT = 20;
const WALLBOARD_REFRESH_INTERVAL_MS = 30_000;

export const Route = createFileRoute("/wallboard/live")({
	ssr: false,
	head: () => ({
		meta: [
			{
				title: "Heartbeat - Live Wallboard",
			},
		],
	}),
	loader: async () => getLiveWallboard(),
	component: LiveWallboardPage,
});

function LiveWallboardPage() {
	const live = Route.useLoaderData() as LiveWallboardData;
	const router = useRouter();
	const autoplayProducts = useMemo(
		() =>
			resolveAutoplayProducts(
				live.selectedProducts,
				live.mappedQueues.map((queue) => queue.teamName),
				live.availableProducts,
			),
		[live.availableProducts, live.mappedQueues, live.selectedProducts],
	);
	const autoplay = useProductAutoplay(autoplayProducts, { intervalMs: 12_000 });
	const focusedProductName = resolveFocusedProductName({
		aiFocusProductName: live.focusPlan?.focusProductName ?? null,
		selectedProducts: live.selectedProducts,
		autoplayProductName: autoplay.activeProduct,
		availableProducts: live.availableProducts,
	});
	const focusedQueue =
		focusedProductName === null
			? null
			: (live.mappedQueues.find(
					(queue) => queue.teamName === focusedProductName,
				) ?? null);
	const prioritizedLookupPool =
		focusedProductName === null
			? live.lookupCases
			: live.lookupCases.filter(
					(item) => item.productName === focusedProductName,
				);
	const prioritizedLookupCases = prioritizeLookupCases(
		prioritizedLookupPool.length > 0 ? prioritizedLookupPool : live.lookupCases,
		live.focusPlan?.topCaseExternalIds ?? [],
	);
	const focusedLookupCases = prioritizedLookupCases.slice(0, TOP_LOOKUP_LIMIT);
	const focusedTargets =
		focusedProductName === null
			? live.selectedTargets
			: resolveSupportTargets(
					{
						defaultTargets: live.defaultTargets,
						productTargets: live.productTargets,
					},
					focusedProductName,
				);
	const focusStatus = resolveFocusStatus(focusedQueue);
	const focusStatusLabel = buildStatusLabel(focusStatus);
	const focusPrimaryAction = buildFocusPrimaryAction(focusedQueue);
	const focusSecondaryAction = buildFocusSecondaryAction(focusedQueue);
	const isOllamaPlan = live.focusPlan?.source === "ollama";
	const aiHeadline = isOllamaPlan ? (live.focusPlan?.headline?.trim() || null) : null;
	const aiSupportingText = isOllamaPlan ? (live.focusPlan?.supportingText?.trim() || null) : null;
	const laneRows = buildLaneRows(live.snapshot);
	const orderedLaneRows = resolveLaneOrder(live.focusPlan?.laneOrder).map(
		(lane) => laneRows[lane],
	);
	const liveTickerItems = buildLiveTickerItems(
		live,
		focusedProductName,
		focusedQueue,
	);
	const focusedInsight = focusedProductName
		? live.insights.find((i) => i.productName === focusedProductName) ?? null
		: null;

	useEffect(() => {
		const timer = window.setInterval(() => {
			void router.invalidate();
		}, WALLBOARD_REFRESH_INTERVAL_MS);

		return () => {
			window.clearInterval(timer);
		};
	}, [router]);

	const immediateQueuePanel = (
		<WallboardSection title="Immediate queue state" className="h-full">
			<PaginatedContent intervalMs={10_000}>
				<div className="grid gap-4 @sm:grid-cols-2 @lg:grid-cols-3 @3xl:grid-cols-4 @5xl:grid-cols-5">
					<QueueInlineMetric
						label="Open now"
						tooltip="Currently open support cases in the selected products."
						value={live.snapshot.currentActiveCaseCount}
					/>
					<QueueInlineMetric
						label="Waiting on us"
						tooltip="Open cases where support owes the next reply."
						value={live.snapshot.currentAwaitingTeamCount}
					/>
					<QueueInlineMetric
						label="Over SLA"
						tooltip="Open cases currently past SLA due time."
						value={live.snapshot.currentBreachedCount}
						danger={live.snapshot.currentBreachedCount > 0}
					/>
					<QueueInlineMetric
						label="Due in 60m"
						tooltip="Open SLA-tracked cases due within the next 60 minutes."
						value={live.snapshot.currentDueSoonCount}
						warning={live.snapshot.currentDueSoonCount > 0}
					/>
					<QueueInlineMetric
						label="Unassigned"
						tooltip="Open cases without an owner assigned."
						value={live.snapshot.currentUnassignedCount}
						warning={live.snapshot.currentUnassignedCount > 0}
					/>
					<QueueInlineMetric
						label="Waiting on customer"
						tooltip="Open cases paused while waiting on the customer or another external party."
						value={live.snapshot.currentAwaitingCustomerCount}
					/>
					<QueueInlineMetric
						label="Ticket review"
						tooltip="Open developer tickets in Submitted or Waiting on support. This follows the global Intercom Ticket review view."
						value={live.workflowCounts.ticketReviewCount}
					/>
					<QueueInlineMetric
						label="Dev team assigned"
						tooltip="Open developer tickets already assigned to the developer team. This is tracked globally, not by the selected product filter."
						value={live.workflowCounts.developerTeamAssignedCount}
					/>
				</div>

			</PaginatedContent>
		</WallboardSection>
	);

	const visibleQueues =
		focusedProductName === null
			? live.mappedQueues.slice(0, 5)
			: live.mappedQueues.filter(
					(queue) => queue.teamName === focusedProductName,
				);

	const byProductPanel = (
		<WallboardSection
			title={
				focusedProductName
					? `Product spotlight • ${formatProductLabel(focusedProductName)}`
					: "By product right now"
			}
			className="h-full"
		>
			<PaginatedContent intervalMs={12_000}>
				<div className="space-y-3">
					{visibleQueues.length === 0 ? (
					live.snapshot.unknownCaseCount > 0 ? (
						<div className="py-10 text-lg text-muted-foreground">
							Product mapping is still incomplete, so this wallboard cannot show
							product rows yet.
						</div>
					) : (
						<div className="py-10 text-lg text-muted-foreground">
							No Intercom data yet.
						</div>
					)
				) : (
					visibleQueues.map((queue) => {
						const nextAction = buildQueueRowAction(queue);
						const isSolo = visibleQueues.length === 1;

						if (!isSolo) {
							return (
								<div
									key={queue.teamName}
									className={cn(
										wbCell,
										"flex items-center gap-4 rounded-lg px-4 py-2.5",
									)}
								>
									<ProductBrandLogo
										productName={queue.teamName}
										size="sm"
									/>
									<div className="min-w-0 flex-1">
										<div className="text-sm font-medium text-foreground">
											{formatProductLabel(queue.teamName)}
										</div>
										<QueueActionValue
											text={nextAction.text}
											tone={nextAction.tone}
											className="text-xs"
										/>
									</div>
									<div className="flex shrink-0 gap-4 text-right text-sm tabular-nums">
										<div>
											<div className="text-muted-foreground text-[10px] uppercase">Open</div>
											<div className="font-semibold">{queue.activeCaseCount}</div>
										</div>
										<div>
											<div className="text-muted-foreground text-[10px] uppercase">Wait</div>
											<div className="font-semibold">{queue.awaitingTeamCount}</div>
										</div>
										<div>
											<div className="text-muted-foreground text-[10px] uppercase">SLA</div>
											<div className={cn("font-semibold", queue.breachedCount > 0 && "text-red-600 dark:text-red-300")}>
												{queue.breachedCount}
											</div>
										</div>
										<div>
											<div className="text-muted-foreground text-[10px] uppercase">Unasgn</div>
											<div className={cn("font-semibold", queue.unassignedCount > 0 && "text-amber-600 dark:text-amber-300")}>
												{queue.unassignedCount}
											</div>
										</div>
									</div>
								</div>
							);
						}

						return (
							<div
								key={queue.teamName}
								className="px-1 py-3"
							>
								<div className="mb-1 text-sm text-muted-foreground">
									<QueueActionValue
										text={nextAction.text}
										tone={nextAction.tone}
									/>
								</div>
								<div className="mt-3 grid grid-cols-2 @sm:grid-cols-3 @xl:grid-cols-5 gap-2">
									<QueueInlineMetric
										label="Open"
										value={queue.activeCaseCount}
									/>
									<QueueInlineMetric
										label="Waiting"
										value={queue.awaitingTeamCount}
									/>
									<QueueInlineMetric
										label="Over SLA"
										value={queue.breachedCount}
										danger
									/>
									<QueueInlineMetric
										label="Due"
										value={queue.dueSoonCount}
										warning
									/>
									<QueueInlineMetric
										label="Unassigned"
										value={queue.unassignedCount}
									/>
								</div>
							</div>
						);
					})
				)}

				{focusedInsight ? (
					<div className="mt-4 grid gap-3 @sm:grid-cols-2">
						<div
							className={cn(
								wbCell,
								"border-l-2 border-l-emerald-500 px-4 py-4 dark:border-l-emerald-400",
							)}
						>
							<div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
								<span className="text-sm normal-case">&#10003;</span>
								What went well
							</div>
							<p className="mt-2 text-sm leading-relaxed text-foreground">
								{focusedInsight.wentWell}
							</p>
						</div>
						<div
							className={cn(
								wbCell,
								"border-l-2 border-l-amber-500 px-4 py-4 dark:border-l-amber-400",
							)}
						>
							<div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
								<span className="text-sm normal-case">&#9672;</span>
								To improve
							</div>
							<p className="mt-2 text-sm leading-relaxed text-foreground">
								{focusedInsight.toImprove}
							</p>
						</div>
					</div>
				) : null}
				</div>
			</PaginatedContent>
		</WallboardSection>
	);

	const operationalContextPanel = (
		<WallboardSection
			title={
				focusedProductName
					? `Context \u00b7 ${formatProductLabel(focusedProductName)}`
					: "Operational context"
			}
		>
			<div className="space-y-4">
				<div
					className={cn(
						"text-4xl font-semibold tracking-tight",
						getStatusTextClass(focusStatus),
					)}
				>
					{focusStatusLabel}
				</div>
				{aiHeadline ? (
					<>
						<p className="text-base leading-7 text-foreground">
							{aiHeadline}
						</p>
						{aiSupportingText ? (
							<p className="text-sm leading-6 text-muted-foreground">
								{aiSupportingText}
							</p>
						) : null}
					</>
				) : null}

				<div className="grid grid-cols-2 gap-4">
					<StateBlock
						label="SLA now"
						tooltip={`Current open-case SLA adherence in selected products. Target ${focusedTargets.slaTargetPercent}%.`}
						value={`${live.snapshot.slaAdherencePercent}%`}
						tone={
							live.snapshot.slaAdherencePercent >=
							focusedTargets.slaTargetPercent
								? "text-emerald-600 dark:text-emerald-300"
								: live.snapshot.slaAdherencePercent >= 75
									? "text-amber-600 dark:text-amber-300"
									: "text-red-600 dark:text-red-300"
						}
					/>
					<StateBlock
						label="Over SLA now"
						tooltip="Open cases currently past SLA due time."
						value={
							focusedQueue?.breachedCount ?? live.snapshot.currentBreachedCount
						}
						tone="text-red-600 dark:text-red-300"
					/>
				</div>

				{live.snapshot.stale ? (
					<div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-200">
						<TriangleAlert className="h-4 w-4" />
						Sync is older than 10 minutes. Treat these numbers as stale.
					</div>
				) : null}
			</div>
		</WallboardSection>
	);

	const topIdsPanel = (
		<WallboardSection
			title={
				focusedProductName
					? `Top IDs • ${formatProductLabel(focusedProductName)}`
					: "Top IDs to check"
			}
			className="min-h-0"
		>
			<div className="space-y-2">
				{focusedLookupCases.length === 0 ? (
					<div className="text-lg text-muted-foreground">
						No open cases need support right now.
					</div>
				) : (
					focusedLookupCases.map((item) => (
						<CaseLookupCard
							key={item.id}
							item={item}
							appUrl={live.intercomAppUrl}
						/>
					))
				)}
			</div>
		</WallboardSection>
	);

	return (
		<WallboardShell
			title="Live"
			refreshedAt={live.snapshot.freshnessTimestamp ?? live.refreshedAt}
			stale={live.snapshot.stale}
			tickerItems={liveTickerItems}
			theme={live.wallboardTheme}
			showcase={
				<span className="inline-flex items-center gap-2 font-semibold text-[1.75rem] tracking-tight text-foreground">
					{focusedProductName ? (
						<ProductBrandLogo productName={focusedProductName} size="md" />
					) : null}
					{formatProductLabel(focusedProductName)}
				</span>
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
	);
}

function getStatusTextClass(status: SupportHealthSnapshot["status"]) {
	if (status === "green") return "text-emerald-600 dark:text-emerald-300";
	if (status === "yellow") return "text-amber-600 dark:text-amber-300";
	return "text-red-600 dark:text-red-300";
}

function buildStatusLabel(status: SupportHealthSnapshot["status"]) {
	if (status === "green") return "On track";
	if (status === "yellow") return "Needs attention";
	return "Off track";
}

const ALL_PRODUCTS_SENTINEL = "__all__";

function resolveAutoplayProducts(
	selectedProducts: string[],
	mappedQueueProducts: string[],
	availableProducts: string[],
) {
	const products =
		selectedProducts.length > 0
			? selectedProducts
			: mappedQueueProducts.length > 0
				? Array.from(new Set(mappedQueueProducts))
				: availableProducts;
	return products.length > 1
		? [ALL_PRODUCTS_SENTINEL, ...products]
		: products;
}

function resolveFocusedProductName(input: {
	aiFocusProductName: string | null;
	selectedProducts: string[];
	autoplayProductName: string | null;
	availableProducts: string[];
}) {
	const {
		aiFocusProductName,
		selectedProducts,
		autoplayProductName,
		availableProducts,
	} = input;

	// The sentinel means "all products" → null
	if (autoplayProductName === ALL_PRODUCTS_SENTINEL) return null;

	// If autoplay is cycling, let it drive the focused product.
	if (autoplayProductName) return autoplayProductName;

	// Fallback to AI focus when autoplay hasn't started yet
	if (!aiFocusProductName) return null;
	if (!availableProducts.includes(aiFocusProductName)) return null;
	if (
		selectedProducts.length > 0 &&
		!selectedProducts.includes(aiFocusProductName)
	) {
		return null;
	}
	return aiFocusProductName;
}

function prioritizeLookupCases(
	lookupCases: CaseLookupItem[],
	prioritizedExternalIds: string[],
) {
	if (prioritizedExternalIds.length === 0) return lookupCases;

	const priority = new Map<string, number>();
	prioritizedExternalIds.forEach((externalId, index) => {
		priority.set(externalId, index);
	});

	return [...lookupCases].sort((left, right) => {
		const leftPriority = priority.get(left.externalId);
		const rightPriority = priority.get(right.externalId);
		if (leftPriority !== undefined || rightPriority !== undefined) {
			if (leftPriority === undefined) return 1;
			if (rightPriority === undefined) return -1;
			return leftPriority - rightPriority;
		}
		return left.externalId.localeCompare(right.externalId);
	});
}

function buildLaneRows(snapshot: SupportHealthSnapshot): Record<
	LiveFocusLane,
	{
		id: LiveFocusLane;
		label: string;
		count: number;
		detail: string;
		tone: "neutral" | "warning" | "danger";
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
	};
}

function resolveLaneOrder(laneOrder?: LiveFocusLane[] | null) {
	const defaultOrder: LiveFocusLane[] = ["over-sla", "due-soon", "unassigned"];
	if (!laneOrder || laneOrder.length !== defaultOrder.length)
		return defaultOrder;
	const unique = new Set(laneOrder);
	if (unique.size !== defaultOrder.length) return defaultOrder;
	if (defaultOrder.some((lane) => !unique.has(lane))) return defaultOrder;
	return laneOrder;
}

function resolveFocusStatus(
	queue: LiveWallboardData["mappedQueues"][number] | null,
): SupportHealthSnapshot["status"] {
	if (!queue) return "yellow";
	if (queue.breachedCount > 0 || queue.urgentCount > 0) return "red";
	if (queue.dueSoonCount > 0 || queue.unassignedCount > 0) {
		return "yellow";
	}
	return "green";
}

function buildFocusPrimaryAction(
	queue: LiveWallboardData["mappedQueues"][number] | null,
) {
	if (!queue) return "No open queue pressure in this product right now.";
	if (queue.breachedCount > 0) {
		return `Clear ${queue.breachedCount} over-SLA case${queue.breachedCount === 1 ? "" : "s"} first.`;
	}
	if (queue.dueSoonCount > 0) {
		return `Prioritize ${queue.dueSoonCount} case${queue.dueSoonCount === 1 ? "" : "s"} due in the next hour.`;
	}
	if (queue.unassignedCount > 0) {
		return `Assign ${queue.unassignedCount} unassigned case${queue.unassignedCount === 1 ? "" : "s"}.`;
	}
	if (queue.awaitingTeamCount > 0) {
		return `${queue.awaitingTeamCount} case${queue.awaitingTeamCount === 1 ? "" : "s"} are waiting on support.`;
	}
	return "No immediate risk. Keep normal response cadence.";
}

function buildFocusSecondaryAction(
	queue: LiveWallboardData["mappedQueues"][number] | null,
) {
	if (!queue) return "Select or map a product to start focused playback.";
	const parts = [
		`${queue.activeCaseCount} open`,
		`${queue.awaitingTeamCount} waiting on support`,
		`${queue.breachedCount} over SLA`,
	];
	return parts.join(" • ");
}

function buildLiveTickerItems(
	live: LiveWallboardData,
	focusedProductName: string | null,
	focusedQueue: LiveWallboardData["mappedQueues"][number] | null,
) {
	if (live.peopleMoments.length > 0) {
		return live.peopleMoments;
	}

	const queueLabel = focusedProductName ?? "All products";
	const items: string[] = [
		`${queueLabel}: ${live.snapshot.currentBreachedCount} over SLA now`,
		`${queueLabel}: ${live.snapshot.currentUnassignedCount} unassigned`,
		`${queueLabel}: ${live.snapshot.currentDueSoonCount} due in 60m`,
	];

	if (focusedQueue && focusedQueue.activeCaseCount > 0) {
		items.push(
			`${focusedQueue.teamName}: ${focusedQueue.activeCaseCount} open in active queue`,
		);
	}

	return items;
}

function buildQueueHeadline(snapshot: SupportHealthSnapshot) {
	if (snapshot.currentBreachedCount > 0) {
		return `${snapshot.currentBreachedCount} case${snapshot.currentBreachedCount === 1 ? "" : "s"} ${
			snapshot.currentBreachedCount === 1 ? "is" : "are"
		} over SLA right now`;
	}
	if (snapshot.currentDueSoonCount > 0) {
		return `${snapshot.currentDueSoonCount} case${snapshot.currentDueSoonCount === 1 ? "" : "s"} ${
			snapshot.currentDueSoonCount === 1 ? "is" : "are"
		} due within 60 minutes`;
	}
	if (snapshot.currentAwaitingTeamCount > 0) {
		return `${snapshot.currentAwaitingTeamCount} open case${snapshot.currentAwaitingTeamCount === 1 ? "" : "s"} ${
			snapshot.currentAwaitingTeamCount === 1 ? "needs" : "need"
		} a support reply`;
	}
	return "No open cases need a support reply right now";
}

function buildQueueSupportingText(snapshot: SupportHealthSnapshot) {
	const parts = [
		`${snapshot.currentAwaitingTeamCount} waiting on support`,
		`${snapshot.currentUnassignedCount} unassigned`,
		`${snapshot.currentAwaitingCustomerCount} waiting on customer`,
	];

	if (snapshot.unknownCaseCount > 0) {
		parts.push(`${snapshot.unknownCaseCount} not mapped to a product yet`);
	}

	return parts.join(" • ");
}

function QueueActionValue({
	text,
	tone,
	className,
}: {
	text: string;
	tone: "red" | "amber" | "stone" | "emerald";
	className?: string;
}) {
	return (
		<div
			className={cn(
				"text-sm leading-6",
				tone === "red" && "text-red-700 dark:text-red-200",
				tone === "amber" && "text-amber-700 dark:text-amber-200",
				tone === "emerald" && "text-emerald-700 dark:text-emerald-200",
				tone === "stone" && "text-muted-foreground",
				className,
			)}
		>
			{text}
		</div>
	);
}

function QueueInlineMetric({
	label,
	tooltip,
	value,
	warning,
	danger,
}: {
	label: string;
	tooltip?: string;
	value: number;
	warning?: boolean;
	danger?: boolean;
}) {
	return (
		<div className={cn(wbCell, "flex flex-col rounded-lg px-4 py-3")}>
			<div className="min-h-[2lh] text-xs uppercase tracking-wide text-muted-foreground">
				<InfoTooltip label={label} tooltip={tooltip} />
			</div>
			<div
				className={cn(
					"mt-auto text-4xl font-semibold tabular-nums text-foreground",
					warning && "text-amber-600 dark:text-amber-300",
					danger && "text-red-600 dark:text-red-300",
				)}
			>
				{value}
			</div>
		</div>
	);
}

function LiveLaneRow({
	label,
	count,
	detail,
	tone,
}: {
	label: string;
	count: number;
	detail: string;
	tone: "neutral" | "warning" | "danger";
}) {
	return (
		<div
			className={cn(
				wbCell,
				"grid grid-cols-[200px_100px_minmax(0,1fr)] items-center gap-4 rounded-lg px-4 py-3",
			)}
		>
			<div className="text-base text-foreground">{label}</div>
			<div
				className={cn(
					"text-3xl font-semibold tabular-nums text-foreground",
					tone === "warning" && "text-amber-600 dark:text-amber-300",
					tone === "danger" && "text-red-600 dark:text-red-300",
				)}
			>
				{count}
			</div>
			<div className="text-sm text-muted-foreground">{detail}</div>
		</div>
	);
}

function StateBlock({
	label,
	tooltip,
	value,
	tone,
}: {
	label: string;
	tooltip?: string;
	value: number | string;
	tone: string;
}) {
	return (
		<div className={cn(wbCell, "px-4 py-4")}>
			<div className="text-sm text-muted-foreground">
				<InfoTooltip label={label} tooltip={tooltip} />
			</div>
			<div className={cn("mt-2 text-4xl font-semibold tracking-tight", tone)}>
				{value}
			</div>
		</div>
	);
}

function formatQueueSources(sourceQueues: string[]) {
	if (sourceQueues.length === 0) return "No dedicated queue detected";
	if (sourceQueues.length === 1) return `Queue ${sourceQueues[0]}`;
	return `Queues ${sourceQueues.join(", ")}`;
}

function buildQueueRowAction(
	queue: LiveWallboardData["mappedQueues"][number],
): { text: string; tone: "red" | "amber" | "stone" | "emerald" } {
	if (queue.breachedCount > 0) {
		return {
			text: `Reply to ${queue.breachedCount} over-SLA case${
				queue.breachedCount === 1 ? "" : "s"
			} first.`,
			tone: "red",
		};
	}

	if (queue.dueSoonCount > 0) {
		return {
			text: `Handle ${queue.dueSoonCount} case${queue.dueSoonCount === 1 ? "" : "s"} due in 60m.`,
			tone: "amber",
		};
	}

	if (queue.unassignedCount > 0) {
		return {
			text: `Assign owner to ${queue.unassignedCount} unassigned case${
				queue.unassignedCount === 1 ? "" : "s"
			}.`,
			tone: "amber",
		};
	}

	if (queue.awaitingTeamCount > 0) {
		return {
			text: `Work through ${queue.awaitingTeamCount} case${
				queue.awaitingTeamCount === 1 ? "" : "s"
			} waiting on support.`,
			tone: "stone",
		};
	}

	return {
		text: "Healthy right now. Keep normal response pace.",
		tone: "emerald",
	};
}
