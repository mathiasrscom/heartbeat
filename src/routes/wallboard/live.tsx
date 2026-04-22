import { createFileRoute, useRouter } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { useEffect, useMemo } from "react";
import { InfoTooltip } from "@/components/info-tooltip";
import {
	formatProductLabel,
	ProductBrandLogo,
} from "@/components/product-brand";
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
	LiveWallboardData,
} from "@/lib/support-health/types";
import { cn } from "@/lib/utils";

const wbCell =
	"rounded-lg border border-border/30 bg-white dark:border-transparent dark:bg-muted/50";

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
	const autoplay = useProductAutoplay(autoplayProducts, { intervalMs: 20_000 });
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
	const focusedMetrics =
		focusedProductName === null
			? null
			: (live.productMetrics[focusedProductName] ?? null);
	const currentSnapshot = focusedMetrics?.snapshot ?? live.snapshot;
	const currentWorkflowCounts =
		focusedMetrics?.workflowCounts ?? live.workflowCounts;
	const focusStatus = resolveFocusStatus(focusedQueue);
	const focusStatusLabel = buildStatusLabel(focusStatus);
	const isAiPlan = live.focusPlan?.source !== "deterministic";
	const aiHeadline = isAiPlan ? live.focusPlan?.headline?.trim() || null : null;
	const aiSupportingText = isAiPlan
		? live.focusPlan?.supportingText?.trim() || null
		: null;
	const liveTickerItems = buildLiveTickerItems(
		live,
		focusedProductName,
		focusedQueue,
	);
	const focusedInsight = focusedProductName
		? (live.insights.find((i) => i.productName === focusedProductName) ?? null)
		: null;
	const aggregateScope = describeAggregateScope(
		live.selectedProducts,
		live.availableProducts,
	);
	const immediateQueueScopeText = focusedProductName
		? formatProductLabel(focusedProductName)
		: aggregateScope.isSubset
			? "the selected products"
			: "all products";

	useEffect(() => {
		const timer = window.setInterval(() => {
			void router.invalidate();
		}, WALLBOARD_REFRESH_INTERVAL_MS);

		return () => {
			window.clearInterval(timer);
		};
	}, [router]);

	const immediateQueuePanel = (
		<WallboardSection
			title={
				focusedProductName
					? `Immediate queue state • ${formatProductLabel(focusedProductName)}`
					: aggregateScope.isSubset
						? "Immediate queue state • Selected products"
						: "Immediate queue state"
			}
			className="h-full"
		>
			<PaginatedContent intervalMs={16_000}>
				<div className="grid gap-4 @sm:grid-cols-2 @lg:grid-cols-3 @3xl:grid-cols-4 @5xl:grid-cols-5">
					<QueueInlineMetric
						label="Open now"
						tooltip={`Currently open support cases in ${immediateQueueScopeText}.`}
						value={currentSnapshot.currentActiveCaseCount}
					/>
					<QueueInlineMetric
						label="Waiting on us"
						tooltip={`Open cases where support owes the next reply in ${immediateQueueScopeText}.`}
						value={currentSnapshot.currentAwaitingTeamCount}
					/>
					<QueueInlineMetric
						label="Over SLA"
						tooltip={`Open cases currently past SLA due time in ${immediateQueueScopeText}.`}
						value={currentSnapshot.currentBreachedCount}
						danger={currentSnapshot.currentBreachedCount > 0}
					/>
					<QueueInlineMetric
						label="Due in 60m"
						tooltip={`Open SLA-tracked cases due within the next 60 minutes in ${immediateQueueScopeText}.`}
						value={currentSnapshot.currentDueSoonCount}
						warning={currentSnapshot.currentDueSoonCount > 0}
					/>
					<QueueInlineMetric
						label="Unassigned"
						tooltip={`Open cases without an owner assigned in ${immediateQueueScopeText}.`}
						value={currentSnapshot.currentUnassignedCount}
						warning={currentSnapshot.currentUnassignedCount > 0}
					/>
					<QueueInlineMetric
						label="Waiting on customer"
						tooltip={`Open cases paused while waiting on the customer or another external party in ${immediateQueueScopeText}.`}
						value={currentSnapshot.currentAwaitingCustomerCount}
					/>
					<QueueInlineMetric
						label="Ticket review"
						tooltip={`Open developer tickets in Submitted or Waiting on support in ${immediateQueueScopeText}.`}
						value={currentWorkflowCounts.ticketReviewCount}
					/>
					<QueueInlineMetric
						label="Dev team assigned"
						tooltip={`Open developer tickets already assigned to the developer team in ${immediateQueueScopeText}.`}
						value={currentWorkflowCounts.developerTeamAssignedCount}
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
					: aggregateScope.isSubset
						? "Selected products right now"
						: "By product right now"
			}
			className="h-full"
		>
			<PaginatedContent intervalMs={20_000}>
				<div className="space-y-3">
					{visibleQueues.length === 0 ? (
						live.snapshot.unknownCaseCount > 0 ? (
							<div className="py-10 text-lg text-muted-foreground">
								Product mapping is still incomplete, so this wallboard cannot
								show product rows yet.
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
										<ProductBrandLogo productName={queue.teamName} size="sm" />
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
												<div className="text-muted-foreground text-[10px] uppercase">
													Open
												</div>
												<div className="font-semibold">
													{queue.activeCaseCount}
												</div>
											</div>
											<div>
												<div className="text-muted-foreground text-[10px] uppercase">
													Wait
												</div>
												<div className="font-semibold">
													{queue.awaitingTeamCount}
												</div>
											</div>
											<div>
												<div className="text-muted-foreground text-[10px] uppercase">
													SLA
												</div>
												<div
													className={cn(
														"font-semibold",
														queue.breachedCount > 0 &&
															"text-red-600 dark:text-red-300",
													)}
												>
													{queue.breachedCount}
												</div>
											</div>
											<div>
												<div className="text-muted-foreground text-[10px] uppercase">
													Unasgn
												</div>
												<div
													className={cn(
														"font-semibold",
														queue.unassignedCount > 0 &&
															"text-amber-600 dark:text-amber-300",
													)}
												>
													{queue.unassignedCount}
												</div>
											</div>
										</div>
									</div>
								);
							}

							return (
								<div key={queue.teamName} className="px-1 py-3">
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
											danger={queue.breachedCount > 0}
										/>
										<QueueInlineMetric
											label="Due"
											value={queue.dueSoonCount}
											warning={queue.dueSoonCount > 0}
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
						<p className="text-base leading-7 text-foreground">{aiHeadline}</p>
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
					: aggregateScope.isSubset
						? "Top IDs • Selected products"
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
				<>
					<span className="inline-flex items-center gap-2 font-semibold text-[1.75rem] tracking-tight text-foreground">
						{focusedProductName ? (
							<ProductBrandLogo productName={focusedProductName} size="md" />
						) : null}
						{focusedProductName
							? formatProductLabel(focusedProductName)
							: aggregateScope.label}
					</span>
					{!focusedProductName && aggregateScope.detail ? (
						<span className="text-sm font-medium text-muted-foreground">
							{aggregateScope.detail}
						</span>
					) : null}
				</>
			}
		>
			<div className="grid h-full min-h-0 grid-cols-[minmax(0,1.55fr)_minmax(340px,0.95fr)] grid-rows-1 gap-6">
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
					intervalMs={28_000}
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
					intervalMs={28_000}
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
	return products.length > 1 ? [ALL_PRODUCTS_SENTINEL, ...products] : products;
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

	return lookupCases
		.map((item, index) => ({ item, index }))
		.sort((left, right) => {
			const leftPriority = priority.get(left.item.externalId);
			const rightPriority = priority.get(right.item.externalId);
			if (leftPriority !== undefined || rightPriority !== undefined) {
				if (leftPriority === undefined) return 1;
				if (rightPriority === undefined) return -1;
				return leftPriority - rightPriority;
			}
			return left.index - right.index;
		})
		.map(({ item }) => item);
}

function resolveFocusStatus(
	queue: LiveWallboardData["mappedQueues"][number] | null,
): LiveWallboardData["snapshot"]["status"] {
	if (!queue) return "yellow";
	if (queue.breachedCount >= 2 || queue.urgentCount > 0) return "red";
	if (
		queue.breachedCount > 0 ||
		queue.dueSoonCount > 0 ||
		queue.unassignedCount > 0
	) {
		return "yellow";
	}
	return "green";
}

function buildLiveTickerItems(
	live: LiveWallboardData,
	focusedProductName: string | null,
	focusedQueue: LiveWallboardData["mappedQueues"][number] | null,
) {
	if (live.peopleMoments.length > 0) {
		return live.peopleMoments;
	}

	const queueLabel = focusedProductName
		? focusedProductName
		: describeAggregateScope(live.selectedProducts, live.availableProducts).label;
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

function describeAggregateScope(
	selectedProducts: string[],
	availableProducts: string[],
) {
	if (selectedProducts.length > 0 && selectedProducts.length < availableProducts.length) {
		return {
			label: "Selected products",
			detail: selectedProducts.join(" · "),
			isSubset: true,
		};
	}

	return {
		label: "All products",
		detail: null,
		isSubset: false,
	};
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
