import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { startTransition, useMemo } from "react";
import { InfoTooltip } from "@/components/info-tooltip";
import {
	formatProductLabel,
	ProductBrandLabel,
	ProductBrandLogo,
} from "@/components/product-brand";
import { SatisfactionTrendChart } from "@/components/satisfaction-trend-chart";
import { SupportCxSummary } from "@/components/support-cx-summary";
import { SupportPeriodFilter } from "@/components/support-period-filter";
import { SupportProductFilter } from "@/components/support-product-filter";
import {
	cardSurfaceClassName,
	panelSurfaceClassName,
} from "@/components/ui/card";
import { CaseLookupCard } from "@/components/wallboard/case-lookup-card";
import { useProductAutoplay } from "@/components/wallboard/product-autoplay-strip";
import { RotatingPanels } from "@/components/wallboard/rotating-panels";
import {
	WallboardSection,
	WallboardShell,
} from "@/components/wallboard/wallboard-shell";
import { normalizeSupportProductFilterInput } from "@/lib/support-health/filter";
import {
	normalizeSupportPeriodInput,
	type SupportPeriodInput,
} from "@/lib/support-health/period";
import { getTrendsWallboard } from "@/lib/support-health/server";
import { resolveSupportTargets } from "@/lib/support-health/targets";
import type {
	ProductHealthRow,
	TrendsWallboardData,
} from "@/lib/support-health/types";
import { cn } from "@/lib/utils";

const TOP_LOOKUP_LIMIT = 4;

export const Route = createFileRoute("/wallboard/trends")({
	ssr: false,
	head: () => ({
		meta: [
			{
				title: "Heartbeat - Product Health",
			},
		],
	}),
	validateSearch: (search: Record<string, unknown>) => ({
		...normalizeSupportPeriodInput(search as SupportPeriodInput),
		...normalizeSupportProductFilterInput(search),
	}),
	loaderDeps: ({ search }) => ({
		...normalizeSupportPeriodInput(search),
		...normalizeSupportProductFilterInput(search),
	}),
	loader: async ({ deps }) => getTrendsWallboard({ data: deps }),
	component: TrendsWallboardPage,
});

function TrendsWallboardPage() {
	const data = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });

	function handlePeriodChange(next: {
		period: "current-week" | "previous-week" | "custom";
		from?: string;
		to?: string;
	}) {
		startTransition(() => {
			navigate({
				search: {
					period: next.period,
					from: next.period === "custom" ? next.from : undefined,
					to: next.period === "custom" ? next.to : undefined,
					products: search.products ?? [],
				},
				replace: true,
			});
		});
	}

	function handleProductChange(products: string[]) {
		startTransition(() => {
			navigate({
				search: {
					period: search.period,
					from: search.period === "custom" ? search.from : undefined,
					to: search.period === "custom" ? search.to : undefined,
					products,
				},
				replace: true,
			});
		});
	}

	const autoplayProducts = useMemo(
		() =>
			resolveAutoplayProducts(
				data.selectedProducts,
				data.productHealth.map((row) => row.productName),
				data.availableProducts,
			),
		[data.availableProducts, data.productHealth, data.selectedProducts],
	);
	const autoplay = useProductAutoplay(autoplayProducts, { intervalMs: 12_000 });
	const focusedProductName = autoplay.activeProduct;
	const focusedRows = focusedProductName
		? data.productHealth.filter((row) => row.productName === focusedProductName)
		: data.productHealth;
	const focusedSummary = useMemo(
		() => aggregateProductRows(focusedRows),
		[focusedRows],
	);
	const focusedLookupCases =
		focusedProductName === null
			? data.lookupCases.slice(0, TOP_LOOKUP_LIMIT)
			: data.lookupCases
					.filter((item) => item.productName === focusedProductName)
					.slice(0, TOP_LOOKUP_LIMIT);
	const trendTickerItems = buildTrendsTickerItems(
		data,
		focusedProductName,
		focusedSummary,
	);
	const focusSatisfaction =
		focusedProductName === null
			? data.periodSummary.satisfactionScorePercent
			: focusedSummary.satisfactionScorePercent;
	const focusedTargets = resolveWallboardTargets(data, focusedProductName);
	const isSingleProductSpotlight =
		focusedProductName !== null && focusedRows.length === 1;
	const spotlightRow = isSingleProductSpotlight ? focusedRows[0] : null;
	const spotlightAction = spotlightRow
		? buildProductRowAction(spotlightRow)
		: null;

	const customerHappinessPanel = (
		<WallboardSection title="Customer happiness">
			<div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
				<div className="space-y-4">
					<div className={cn(cardSurfaceClassName, "px-4 py-4")}>
						<div className="text-sm text-muted-foreground">
							{focusedProductName
								? `${focusedProductName} satisfaction target: ${focusedTargets.satisfactionTargetPercent}%`
								: `Satisfaction target: ${focusedTargets.satisfactionTargetPercent}%`}
						</div>
						<div
							className={cn(
								"mt-2 text-5xl font-semibold tracking-tight",
								getSatisfactionToneClass(
									focusSatisfaction,
									focusedTargets.satisfactionTargetPercent,
								),
							)}
						>
							{focusSatisfaction === null ? "—" : `${focusSatisfaction}%`}
						</div>
						<div className="mt-2 text-base text-foreground">
							{buildSatisfactionHeadline(
								focusSatisfaction,
								focusedTargets.satisfactionTargetPercent,
							)}
						</div>
					</div>

					<div className={cn(cardSurfaceClassName, "px-4 py-4")}>
						<SupportCxSummary
							label={data.period.label}
							satisfactionScorePercent={
								data.periodSummary.satisfactionScorePercent
							}
							ratedCount={data.periodSummary.ratedCount}
							positiveCount={data.periodSummary.positiveCount}
							responseRatePercent={data.periodSummary.responseRatePercent}
							ratingMix={data.periodSummary.ratingMix}
							variant="wallboard"
							showScore={false}
						/>
					</div>
				</div>

				<div className="space-y-3">
					<SatisfactionTrendChart
						points={data.cxSeries}
						title={`Daily satisfaction • ${data.period.label}`}
					/>
					<div className="grid grid-cols-3 gap-2">
						{data.periods.slice(0, 3).map((period) => (
							<div
								key={period.label}
								className={cn(cardSurfaceClassName, "rounded-lg px-3 py-2")}
							>
								<div className="text-xs text-muted-foreground">
									{period.label}
								</div>
								<div
									className={cn(
										"mt-1 text-2xl font-semibold tracking-tight",
										getSatisfactionToneClass(
											period.satisfactionScorePercent,
											focusedTargets.satisfactionTargetPercent,
										),
									)}
								>
									{period.satisfactionScorePercent === null
										? "—"
										: `${period.satisfactionScorePercent}%`}
								</div>
								<div className="mt-0.5 text-[11px] text-muted-foreground">
									Rated {period.responseRatePercent}%
								</div>
							</div>
						))}
						{data.periods.length === 0 ? (
							<div
								className={cn(
									cardSurfaceClassName,
									"col-span-3 px-4 py-3 text-sm text-muted-foreground",
								)}
							>
								CX context periods will appear after the next loader refresh.
							</div>
						) : null}
					</div>
				</div>
			</div>
		</WallboardSection>
	);

	const productsPanel = (
		<WallboardSection
			title={
				focusedProductName
					? `Product spotlight • ${focusedProductName}`
					: "Products"
			}
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
							focusedSummary.satisfactionScorePercent <
								focusedTargets.satisfactionTargetPercent
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

				{focusedRows.length === 0 ? (
					<div className="py-10 text-lg text-muted-foreground">
						No product activity in this view.
					</div>
				) : isSingleProductSpotlight && spotlightRow ? (
					<div className={cn(cardSurfaceClassName, "px-4 py-3")}>
						<div className="flex items-start justify-between gap-4">
							<div className="min-w-0">
								<ProductBrandLabel
									productName={spotlightRow.productName}
									logoSize="md"
									className="text-xl font-medium text-foreground"
								/>
								<div className="mt-1 text-xs text-muted-foreground">
									{spotlightRow.servicePolicyName}
								</div>
							</div>
							<ActionCell
								text={spotlightAction?.text ?? "No immediate action."}
								tone={spotlightAction?.tone ?? "stone"}
								className="max-w-[46ch] text-right"
							/>
						</div>
						<div className="mt-3 text-sm text-muted-foreground">
							Open Top IDs to see the exact conversations to handle first.
						</div>
					</div>
				) : (
					<div className="space-y-3">
						{focusedRows.map((row) => {
							const nextAction = buildProductRowAction(row);

							return (
								<div
									key={`${row.serviceBucket}-${row.productName}`}
									className={cn(cardSurfaceClassName, "px-4 py-3")}
								>
									<div className="flex items-start justify-between gap-4">
										<div className="min-w-0">
											<ProductBrandLabel
												productName={row.productName}
												logoSize="sm"
												className="text-xl font-medium text-foreground"
											/>
											<div className="mt-1 text-xs text-muted-foreground">
												{row.servicePolicyName}
											</div>
										</div>
										<ActionCell
											text={nextAction.text}
											tone={nextAction.tone}
											className="max-w-[42ch] text-right"
										/>
									</div>
									<div className="mt-3 grid grid-cols-4 gap-2">
										<RowMetric
											label="Satisfaction"
											value={
												row.satisfactionScorePercent === null
													? "—"
													: `${row.satisfactionScorePercent}%`
											}
											danger={
												row.satisfactionScorePercent !== null &&
												row.satisfactionScorePercent <
													row.targets.satisfactionTargetPercent
											}
										/>
										<RowMetric
											label="SLA period"
											value={
												row.slaAdherencePercent === null
													? "—"
													: `${row.slaAdherencePercent}%`
											}
											danger={
												row.slaAdherencePercent !== null &&
												row.slaAdherencePercent < row.targets.slaTargetPercent
											}
										/>
										<RowMetric label="Open" value={row.openNowCount} />
										<RowMetric
											label="Over SLA"
											value={row.breachedNowCount}
											danger={row.breachedNowCount > 0}
										/>
									</div>
								</div>
							);
						})}
					</div>
				)}
				<div
					className={cn(
						cardSurfaceClassName,
						"px-4 py-3 text-sm text-foreground",
					)}
				>
					SLA score for selected period:{" "}
					{focusedSummary.slaAdherencePercent === null
						? "—"
						: `${focusedSummary.slaAdherencePercent}%`}{" "}
					({focusedSummary.slaMissedCount} breached of{" "}
					{focusedSummary.slaTrackedCount} tracked). Target:{" "}
					{focusedTargets.slaTargetPercent}%.
				</div>
			</div>
		</WallboardSection>
	);

	const topIdsPanel = (
		<WallboardSection
			title={
				focusedProductName
					? `Top ${TOP_LOOKUP_LIMIT} IDs • ${formatProductLabel(focusedProductName)}`
					: `Top ${TOP_LOOKUP_LIMIT} IDs to inspect`
			}
			className="min-h-0"
		>
			<div className="space-y-2">
				{focusedLookupCases.length === 0 ? (
					<div className="text-base text-muted-foreground">
						No open cases need support in the selected products.
					</div>
				) : (
					focusedLookupCases.map((item) => (
						<CaseLookupCard
							key={item.id}
							item={item}
							appUrl={data.intercomAppUrl}
						/>
					))
				)}
			</div>
		</WallboardSection>
	);

	const topThemeTrends = data.themeTrends.slice(0, 3);
	const pressureQueue =
		[...data.queuePressure].sort((a, b) => b.delta - a.delta)[0] ?? null;

	const periodHighlightsPanel = (
		<WallboardSection title="Period highlights">
			<div className="space-y-4">
				<p className="text-base leading-7 text-foreground">
					{buildTrendHealthHeadline(
						focusedSummary,
						data.period.label,
						focusedProductName,
						focusedTargets,
					)}
				</p>
				<p className="text-sm leading-6 text-muted-foreground">
					{buildTrendSupportingText(focusedSummary, data.period.label)}
				</p>
			</div>
			<div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-3">
				<SnapshotValue
					label={`Satisfaction (${data.period.label.toLowerCase()})`}
					tooltip={`Percent of rated conversations in ${data.period.label.toLowerCase()} with a 4 or 5 score.`}
					value={
						focusedSummary.satisfactionScorePercent === null
							? "—"
							: `${focusedSummary.satisfactionScorePercent}%`
					}
					danger={
						focusedSummary.satisfactionScorePercent !== null &&
						focusedSummary.satisfactionScorePercent <
							focusedTargets.satisfactionTargetPercent
					}
				/>
				<SnapshotValue
					label="Rated coverage"
					tooltip={`Share of eligible conversations resolved in ${data.period.label.toLowerCase()} that received a rating.`}
					value={`${focusedSummary.responseRatePercent}%`}
				/>
				<SnapshotValue
					label="SLA period"
					tooltip={`SLA adherence for the ${data.period.label.toLowerCase()} period.`}
					value={
						focusedSummary.slaAdherencePercent === null
							? "—"
							: `${focusedSummary.slaAdherencePercent}%`
					}
					danger={
						focusedSummary.slaAdherencePercent !== null &&
						focusedSummary.slaAdherencePercent < focusedTargets.slaTargetPercent
					}
				/>
				<SnapshotValue
					label="Open now"
					tooltip="Count of currently open cases in the selected products."
					value={String(focusedSummary.openNowCount)}
				/>
				<SnapshotValue
					label="Ticket review"
					tooltip="Open developer tickets in Submitted or Waiting on support. This follows the global Intercom Ticket review view."
					value={String(data.workflowCounts.ticketReviewCount)}
				/>
				<SnapshotValue
					label="Dev team assigned"
					tooltip="Open developer tickets already assigned to the developer team. This is tracked globally, not by the selected product filter."
					value={String(data.workflowCounts.developerTeamAssignedCount)}
				/>
			</div>
			{topThemeTrends.length > 0 ? (
				<div className={cn(cardSurfaceClassName, "mt-4 px-3 py-3")}>
					<div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
						Recurring themes
					</div>
					<div className="mt-2 space-y-1.5 text-sm">
						{topThemeTrends.map((trend) => (
							<div
								key={trend.label}
								className="flex items-center justify-between gap-2"
							>
								<span className="truncate text-foreground">{trend.label}</span>
								<span
									className={cn(
										"shrink-0 font-medium",
										trend.delta > 0 && "text-red-300",
										trend.delta < 0 && "text-emerald-300",
										trend.delta === 0 && "text-muted-foreground",
									)}
								>
									{trend.delta > 0 ? "+" : ""}
									{trend.delta}
								</span>
							</div>
						))}
					</div>
				</div>
			) : null}
			{pressureQueue ? (
				<div className="mt-3 text-sm text-muted-foreground">
					Queue pressure:{" "}
					<span className="text-foreground">{pressureQueue.teamName}</span>{" "}
					{pressureQueue.delta > 0
						? "increased"
						: pressureQueue.delta < 0
							? "decreased"
							: "is flat"}{" "}
					by{" "}
					<span className="font-medium text-foreground">
						{Math.abs(pressureQueue.delta)}
					</span>{" "}
					open cases versus prior period.
				</div>
			) : null}
		</WallboardSection>
	);

	return (
		<WallboardShell
			title="Product Health"
			refreshedAt={data.snapshot.freshnessTimestamp ?? data.refreshedAt}
			stale={data.snapshot.stale}
			tickerItems={trendTickerItems}
			toolbar={
				<div className="flex flex-wrap items-center gap-4">
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
					<div
						className={cn(
							panelSurfaceClassName,
							"rounded-lg px-3 py-1.5 text-xs text-muted-foreground",
						)}
					>
						<span className="mr-2 uppercase tracking-[0.12em] text-muted-foreground">
							Showcase
						</span>
						<span className="inline-flex items-center gap-1.5 font-medium text-foreground">
							{focusedProductName ? (
								<ProductBrandLogo productName={focusedProductName} size="xs" />
							) : null}
							{formatProductLabel(focusedProductName)}
						</span>{" "}
						<span className="text-muted-foreground">• 12s</span>
					</div>
				</div>
			}
		>
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
							label: "Period highlights",
							content: periodHighlightsPanel,
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

function getSatisfactionToneClass(satisfaction: number | null, target: number) {
	if (satisfaction === null) return "text-foreground";
	if (satisfaction >= target) return "text-emerald-300";
	if (satisfaction >= 75) return "text-amber-300";
	return "text-red-300";
}

function buildSatisfactionHeadline(
	satisfaction: number | null,
	target: number,
) {
	if (satisfaction === null) {
		return "No rated conversations yet in the selected period.";
	}

	if (satisfaction >= target) {
		return "Customer happiness is on target.";
	}

	if (satisfaction >= 75) {
		return "Customer happiness is below target and needs monitoring.";
	}

	return "Customer happiness is off target and needs action.";
}

interface AggregatedProductSummary {
	openNowCount: number;
	awaitingTeamNowCount: number;
	breachedNowCount: number;
	slaTrackedCount: number;
	slaMissedCount: number;
	slaAdherencePercent: number | null;
	satisfactionScorePercent: number | null;
	responseRatePercent: number;
	topPerformerName: string | null;
	topPerformerPositiveCount: number;
}

function round(value: number, digits = 1) {
	return Number(value.toFixed(digits));
}

function resolveAutoplayProducts(
	selectedProducts: string[],
	rowProducts: string[],
	availableProducts: string[],
) {
	if (selectedProducts.length > 0) return selectedProducts;
	if (rowProducts.length > 0) return Array.from(new Set(rowProducts));
	return availableProducts;
}

function aggregateProductRows(
	rows: ProductHealthRow[],
): AggregatedProductSummary {
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
		};
	}

	const openNowCount = rows.reduce((sum, row) => sum + row.openNowCount, 0);
	const awaitingTeamNowCount = rows.reduce(
		(sum, row) => sum + row.awaitingTeamCount,
		0,
	);
	const breachedNowCount = rows.reduce(
		(sum, row) => sum + row.breachedNowCount,
		0,
	);
	const slaTrackedCount = rows.reduce(
		(sum, row) => sum + row.slaTrackedCount,
		0,
	);
	const slaMissedCount = rows.reduce((sum, row) => sum + row.slaMissedCount, 0);
	const ratedCount = rows.reduce((sum, row) => sum + row.ratedCount, 0);
	const eligibleCount = rows.reduce((sum, row) => sum + row.eligibleCount, 0);
	const positiveCount = rows.reduce((sum, row) => sum + row.positiveCount, 0);
	const topPerformer = [...rows]
		.filter((row) => row.topPerformerName && row.topPerformerPositiveCount > 0)
		.sort((left, right) => {
			if (right.topPerformerPositiveCount !== left.topPerformerPositiveCount) {
				return right.topPerformerPositiveCount - left.topPerformerPositiveCount;
			}
			return (left.topPerformerName ?? "").localeCompare(
				right.topPerformerName ?? "",
			);
		})[0];

	return {
		openNowCount,
		awaitingTeamNowCount,
		breachedNowCount,
		slaTrackedCount,
		slaMissedCount,
		slaAdherencePercent:
			slaTrackedCount === 0
				? null
				: round(((slaTrackedCount - slaMissedCount) / slaTrackedCount) * 100),
		satisfactionScorePercent:
			ratedCount === 0 ? null : round((positiveCount / ratedCount) * 100),
		responseRatePercent:
			eligibleCount === 0 ? 0 : round((ratedCount / eligibleCount) * 100),
		topPerformerName: topPerformer?.topPerformerName ?? null,
		topPerformerPositiveCount: topPerformer?.topPerformerPositiveCount ?? 0,
	};
}

function buildTrendHealthHeadline(
	summary: AggregatedProductSummary,
	periodLabel: string,
	focusedProductName: string | null,
	targets: { satisfactionTargetPercent: number },
) {
	const focusPrefix = focusedProductName ? `${focusedProductName}: ` : "";
	if (summary.satisfactionScorePercent === null) {
		return `${focusPrefix}No CX ratings in ${periodLabel.toLowerCase()} yet. Keep feedback collection active.`;
	}
	if (summary.satisfactionScorePercent < 75) {
		return `${focusPrefix}Customer happiness is ${summary.satisfactionScorePercent}% and needs immediate recovery.`;
	}
	if (summary.satisfactionScorePercent < targets.satisfactionTargetPercent) {
		return `${focusPrefix}Customer happiness is ${summary.satisfactionScorePercent}% and below target.`;
	}
	return `${focusPrefix}Customer happiness is on target at ${summary.satisfactionScorePercent}%.`;
}

function buildTrendSupportingText(
	summary: AggregatedProductSummary,
	periodLabel: string,
) {
	const parts = [
		`${summary.openNowCount} open now`,
		`${summary.breachedNowCount} over SLA now`,
		summary.slaAdherencePercent === null
			? `No tracked SLA in ${periodLabel.toLowerCase()}`
			: `SLA ${summary.slaAdherencePercent}% in ${periodLabel.toLowerCase()}`,
		`Rated coverage ${summary.responseRatePercent}%`,
	];

	return parts.join(" • ");
}

function buildTrendsTickerItems(
	data: TrendsWallboardData,
	focusedProductName: string | null,
	summary: AggregatedProductSummary,
) {
	if (data.peopleMoments.length > 0) {
		return data.peopleMoments;
	}

	const focusLabel = focusedProductName ?? "All products";
	const items: string[] = [
		`${focusLabel}: CX ${
			summary.satisfactionScorePercent === null
				? "—"
				: `${summary.satisfactionScorePercent}%`
		} in ${data.period.label.toLowerCase()}`,
		`${focusLabel}: SLA ${
			summary.slaAdherencePercent === null
				? "—"
				: `${summary.slaAdherencePercent}%`
		} in ${data.period.label.toLowerCase()}`,
		`${focusLabel}: rated coverage ${summary.responseRatePercent}%`,
	];

	for (const trend of data.themeTrends.slice(0, 2)) {
		items.push(
			`${focusLabel}: theme ${trend.label} ${trend.delta > 0 ? "+" : ""}${trend.delta} vs prior`,
		);
	}

	const pressure = [...data.queuePressure].sort((a, b) => b.delta - a.delta)[0];
	if (pressure) {
		items.push(
			`${focusLabel}: queue ${pressure.teamName} ${pressure.delta > 0 ? "+" : ""}${pressure.delta} open vs prior`,
		);
	}

	if (summary.topPerformerName && summary.topPerformerPositiveCount > 0) {
		items.push(
			`Quick win: ${summary.topPerformerName} delivered ${summary.topPerformerPositiveCount} positive rating${
				summary.topPerformerPositiveCount === 1 ? "" : "s"
			} in ${data.period.label.toLowerCase()}`,
		);
	}

	return items;
}

function SummaryTile({
	label,
	tooltip,
	value,
	danger,
}: {
	label: string;
	tooltip?: string;
	value: string;
	danger?: boolean;
}) {
	return (
		<div className={cn(cardSurfaceClassName, "px-4 py-4")}>
			<div className="text-sm text-muted-foreground">
				<InfoTooltip label={label} tooltip={tooltip} />
			</div>
			<div
				className={cn(
					"mt-2 text-4xl font-semibold tracking-tight text-foreground",
					danger && "text-red-300",
				)}
			>
				{value}
			</div>
		</div>
	);
}

function ActionCell({
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
				tone === "red" && "text-red-200",
				tone === "amber" && "text-amber-200",
				tone === "emerald" && "text-emerald-200",
				tone === "stone" && "text-muted-foreground",
				className,
			)}
		>
			{text}
		</div>
	);
}

function RowMetric({
	label,
	value,
	danger,
}: {
	label: string;
	value: string | number;
	danger?: boolean;
}) {
	return (
		<div className={cn(cardSurfaceClassName, "rounded-lg px-3 py-2")}>
			<div className="text-[11px] uppercase tracking-wide text-muted-foreground">
				{label}
			</div>
			<div
				className={cn(
					"mt-1 text-2xl font-semibold tabular-nums text-foreground",
					danger && "text-red-300",
				)}
			>
				{value}
			</div>
		</div>
	);
}

function SnapshotValue({
	label,
	tooltip,
	value,
	danger,
}: {
	label: string;
	tooltip?: string;
	value: string;
	danger?: boolean;
}) {
	return (
		<div className={cn(cardSurfaceClassName, "rounded-lg px-3 py-3")}>
			<div className="text-sm text-muted-foreground">
				<InfoTooltip label={label} tooltip={tooltip} />
			</div>
			<div
				className={cn(
					"mt-1 text-3xl font-semibold tracking-tight text-foreground",
					danger && "text-red-300",
				)}
			>
				{value}
			</div>
		</div>
	);
}

function buildProductRowAction(row: ProductHealthRow): {
	text: string;
	tone: "red" | "amber" | "stone" | "emerald";
} {
	if (row.breachedNowCount > 0) {
		return {
			text: `Reply on ${row.breachedNowCount} over-SLA case${
				row.breachedNowCount === 1 ? "" : "s"
			} first.`,
			tone: "red",
		};
	}

	if (row.awaitingTeamCount > 0) {
		return {
			text: `Work through ${row.awaitingTeamCount} case${
				row.awaitingTeamCount === 1 ? "" : "s"
			} waiting on support.`,
			tone: "amber",
		};
	}

	if (
		row.slaAdherencePercent !== null &&
		row.slaAdherencePercent < row.targets.slaTargetPercent
	) {
		return {
			text: `SLA is ${row.slaAdherencePercent}% in this period. Recover to ${row.targets.slaTargetPercent}% target.`,
			tone: "amber",
		};
	}

	if (
		row.satisfactionScorePercent !== null &&
		row.satisfactionScorePercent < row.targets.satisfactionTargetPercent
	) {
		return {
			text: `CX is ${row.satisfactionScorePercent}%. Review negative feedback themes.`,
			tone: "amber",
		};
	}

	if (row.openNowCount === 0) {
		return {
			text: "No open queue pressure right now.",
			tone: "stone",
		};
	}

	return {
		text: "Healthy queue. Keep normal response cadence.",
		tone: "emerald",
	};
}

function resolveWallboardTargets(
	data: TrendsWallboardData,
	productName: string | null,
) {
	if (!productName) return data.selectedTargets;
	return resolveSupportTargets(
		{
			defaultTargets: data.defaultTargets,
			productTargets: data.productTargets,
		},
		productName,
	);
}
