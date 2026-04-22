import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { InfoTooltip } from "@/components/info-tooltip";
import {
	formatProductLabel,
	ProductBrandLogo,
} from "@/components/product-brand";
import { CaseLookupCard } from "@/components/wallboard/case-lookup-card";
import { PaginatedContent } from "@/components/wallboard/paginated-content";
import { RotatingPanels } from "@/components/wallboard/rotating-panels";
import {
	WallboardSection,
	WallboardShell,
} from "@/components/wallboard/wallboard-shell";
import { getLiveWallboard } from "@/lib/support-health/server";
import type {
	CaseLookupItem,
	LiveWallboardData,
	ProductLiveMetrics,
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
	const aggregateScope = describeAggregateScope(
		live.selectedProducts,
		live.availableProducts,
	);
	const visibleProducts = resolveVisibleProducts(live);
	const visibleInsights = live.insights.filter((insight) =>
		visibleProducts.includes(insight.productName),
	);
	const prioritizedLookupCases = prioritizeLookupCases(
		live.lookupCases,
		live.focusPlan?.topCaseExternalIds ?? [],
	).slice(0, TOP_LOOKUP_LIMIT);
	const liveTickerItems = buildLiveTickerItems(live, visibleProducts);

	useEffect(() => {
		const timer = window.setInterval(() => {
			void router.invalidate();
		}, WALLBOARD_REFRESH_INTERVAL_MS);

		return () => {
			window.clearInterval(timer);
		};
	}, [router]);

	const queueStackPanel = (
		<WallboardSection
			title={
				aggregateScope.isSubset
					? "Immediate queue state • Selected products"
					: "Immediate queue state"
			}
			className="min-h-0"
		>
			<div className="divide-y divide-border/40 pt-3">
				{visibleProducts.length === 0 ? (
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
					visibleProducts.map((productName) => {
						const metrics = live.productMetrics[productName];
						if (!metrics) return null;

						const queue =
							live.mappedQueues.find((item) => item.teamName === productName) ??
							null;

						return (
							<div
								key={productName}
								className="py-4 first:pt-0 last:pb-0"
							>
								<ProductQueueStateCard
									productName={productName}
									metrics={metrics}
									action={queue ? buildQueueRowAction(queue) : null}
								/>
							</div>
						);
					})
				)}
			</div>
		</WallboardSection>
	);

	const trackedTeammatesPanel = (
		<WallboardSection title="Tracked teammates" className="min-h-0">
			<div className="space-y-2">
				{live.trackedTeammates.length === 0 ? (
					<div className="text-lg text-muted-foreground">
						Choose tracked teammates in Settings to show open assigned Inbox
						load.
					</div>
				) : (
					live.trackedTeammates.map((teammate) => (
						<div
							key={teammate.externalId}
							className={cn(
								wbCell,
								"flex items-center justify-between gap-4 rounded-lg px-4 py-3",
							)}
						>
							<div className="min-w-0 flex items-center gap-3">
								<Avatar className="h-8 w-8">
									<AvatarImage
										src={teammate.avatarUrl ?? undefined}
										alt={teammate.name}
									/>
									<AvatarFallback className="bg-muted text-[11px] text-foreground">
										{teammate.name
											.split(/\s+/)
											.slice(0, 2)
											.map((part) => part.charAt(0).toUpperCase())
											.join("")}
									</AvatarFallback>
								</Avatar>
								<div className="min-w-0">
									<div className="truncate text-sm font-medium text-foreground">
										{teammate.name}
									</div>
									<div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
										<span
											className={cn(
												"h-1.5 w-1.5 rounded-full",
												teammate.isAvailable
													? "bg-emerald-500"
													: "bg-amber-500",
											)}
										/>
										<span>
											{teammate.isAvailable ? "Available" : "Away"}
										</span>
									</div>
								</div>
							</div>
							<div className="shrink-0 text-right">
								<div className="text-[10px] uppercase tracking-wide text-muted-foreground">
									Open
								</div>
								<div
									className={cn(
										"text-3xl font-semibold tabular-nums text-foreground",
										getTrackedTeammateCountToneClassName(
											teammate.openCaseCount,
										),
									)}
								>
									{teammate.openCaseCount}
								</div>
							</div>
						</div>
					))
				)}
			</div>
		</WallboardSection>
	);

	const topIdsPanel = (
		<WallboardSection
			title="Cases needing attention"
			className="min-h-0"
		>
			<div className="space-y-2">
				{prioritizedLookupCases.length === 0 ? (
					<div className="text-lg text-muted-foreground">
						No open cases need support right now.
					</div>
				) : (
					prioritizedLookupCases.map((item) => (
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

	const insightsPanel =
		visibleInsights.length > 0 ? (
			<WallboardSection title="Team coaching" className="min-h-0">
				<PaginatedContent intervalMs={20_000}>
					<div className="space-y-4">
						{visibleInsights.map((insight) => (
							<div key={insight.productName} className="space-y-3">
								<div className="flex items-center gap-2 text-base font-semibold text-foreground">
									<ProductBrandLogo productName={insight.productName} size="sm" />
									<span>{formatProductLabel(insight.productName)}</span>
								</div>
								<div className="grid gap-3">
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
											{insight.wentWell}
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
											{insight.toImprove}
										</p>
									</div>
								</div>
							</div>
						))}
					</div>
				</PaginatedContent>
			</WallboardSection>
		) : null;

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
						{aggregateScope.label}
					</span>
					{aggregateScope.detail ? (
						<span className="text-sm font-medium text-muted-foreground">
							{aggregateScope.detail}
						</span>
					) : null}
				</>
			}
		>
			<div className="grid h-full min-h-0 grid-cols-[minmax(0,1.55fr)_minmax(340px,0.95fr)] gap-6">
				<div className="min-h-0 overflow-auto pr-1">{queueStackPanel}</div>
				<RotatingPanels
					panels={[
						{
							id: "live-tracked-teammates",
							label: "Tracked teammates",
							content: trackedTeammatesPanel,
						},
						{
							id: "live-top-ids",
							label: "Top IDs",
							content: topIdsPanel,
						},
						{
							id: "live-team-coaching",
							label: "Team coaching",
							content: insightsPanel,
						},
					]}
					intervalMs={28_000}
					className="min-h-0"
				/>
			</div>
		</WallboardShell>
	);
}

function resolveVisibleProducts(live: LiveWallboardData) {
	const scopedProducts =
		live.selectedProducts.length > 0 ? live.selectedProducts : live.availableProducts;

	return scopedProducts.filter((productName) => Boolean(live.productMetrics[productName]));
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

function buildLiveTickerItems(
	live: LiveWallboardData,
	visibleProducts: string[],
) {
	if (live.peopleMoments.length > 0) {
		return live.peopleMoments;
	}

	const aggregate = describeAggregateScope(
		live.selectedProducts,
		live.availableProducts,
	);
	const items: string[] = [
		`${aggregate.label}: ${live.snapshot.currentBreachedCount} over SLA now`,
		`${aggregate.label}: ${live.snapshot.currentUnassignedCount} unassigned`,
		`${aggregate.label}: ${live.snapshot.currentDueSoonCount} due in 60m`,
	];

	for (const productName of visibleProducts.slice(0, 2)) {
		const metrics = live.productMetrics[productName];
		if (!metrics) continue;
		items.push(
			`${productName}: ${metrics.snapshot.currentActiveCaseCount} open • ${metrics.snapshot.currentAwaitingTeamCount} waiting on us`,
		);
	}

	return items;
}

function describeAggregateScope(
	selectedProducts: string[],
	availableProducts: string[],
) {
	if (
		selectedProducts.length > 0 &&
		selectedProducts.length < availableProducts.length
	) {
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

function ProductQueueStateCard({
	productName,
	metrics,
	action,
}: {
	productName: string;
	metrics: ProductLiveMetrics;
	action: { text: string; tone: "red" | "amber" | "stone" | "emerald" } | null;
}) {
	const snapshot = metrics.snapshot;
	const workflowCounts = metrics.workflowCounts;

	return (
		<div className="space-y-3">
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0">
					<div className="flex items-center gap-2 text-[0.95rem] font-semibold text-foreground">
						<ProductBrandLogo productName={productName} size="sm" />
						<span className="truncate">{formatProductLabel(productName)}</span>
					</div>
					{action ? (
						<QueueActionValue
							text={action.text}
							tone={action.tone}
							className="mt-1.5 text-[0.95rem] leading-5"
						/>
					) : null}
				</div>
			</div>
			<div className="grid gap-2 md:grid-cols-4">
				<QueueInlineMetric
					label="Open now"
					tooltip={`Currently open support cases in ${formatProductLabel(productName)}.`}
					value={snapshot.currentActiveCaseCount}
				/>
				<QueueInlineMetric
					label="Waiting on us"
					tooltip={`Open cases where support owes the next reply in ${formatProductLabel(productName)}.`}
					value={snapshot.currentAwaitingTeamCount}
				/>
				<QueueInlineMetric
					label="Unassigned"
					tooltip={`Open cases without an owner assigned in ${formatProductLabel(productName)}.`}
					value={snapshot.currentUnassignedCount}
					warning={snapshot.currentUnassignedCount > 0}
				/>
				<QueueInlineMetric
					label="Waiting on customer"
					tooltip={`Open cases paused while waiting on the customer or another external party in ${formatProductLabel(productName)}.`}
					value={snapshot.currentAwaitingCustomerCount}
				/>
				<QueueInlineMetric
					label="Ticket review"
					tooltip={`Open developer tickets in Submitted or Waiting on support in ${formatProductLabel(productName)}.`}
					value={workflowCounts.ticketReviewCount}
				/>
				<QueueInlineMetric
					label="Dev team assigned"
					tooltip={`Open developer tickets already assigned to the developer team in ${formatProductLabel(productName)}.`}
					value={workflowCounts.developerTeamAssignedCount}
				/>
			</div>
		</div>
	);
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
		<div
			className={cn(
				wbCell,
				"flex min-h-[6.5rem] flex-col rounded-lg px-3 py-2.5",
			)}
		>
			<div className="min-h-[1.6lh] text-[11px] uppercase tracking-wide text-muted-foreground">
				<InfoTooltip label={label} tooltip={tooltip} />
			</div>
			<div
				className={cn(
					"mt-auto text-[2.5rem] font-semibold tabular-nums leading-none text-foreground",
					warning && "text-amber-600 dark:text-amber-300",
					danger && "text-red-600 dark:text-red-300",
				)}
			>
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
			text: `Handle ${queue.dueSoonCount} case${
				queue.dueSoonCount === 1 ? "" : "s"
			} due in 60m.`,
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

function getTrackedTeammateCountToneClassName(openCaseCount: number) {
	if (openCaseCount >= 15) {
		return "text-red-600 dark:text-red-300";
	}

	if (openCaseCount >= 10) {
		return "text-amber-600 dark:text-amber-300";
	}

	return "";
}
