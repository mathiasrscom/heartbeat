import {
	createFileRoute,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { startTransition, useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CxNpsTrendChart } from "@/components/cx-nps-trend-chart";
import { NpsDistributionBar } from "@/components/nps-distribution-bar";
import { NpsCommentList } from "@/components/wallboard/nps-comment-list";
import {
	formatProductLabel,
	ProductBrandLogo,
} from "@/components/product-brand";
import { PaginatedContent } from "@/components/wallboard/paginated-content";
import { RotatingPanels } from "@/components/wallboard/rotating-panels";
import {
	WallboardSection,
	WallboardShell,
} from "@/components/wallboard/wallboard-shell";
import {
	normalizeSupportPeriodInput,
	type SupportPeriodInput,
} from "@/lib/support-health/period";
import { getTrendsWallboard } from "@/lib/support-health/server";
import type {
	NpsPeriodSummary,
	NpsTheme,
	ProductHealthRow,
	TopContributor,
} from "@/lib/support-health/types";
import { cn } from "@/lib/utils";

const wbCell =
	"rounded-lg border border-border/30 bg-white dark:border-transparent dark:bg-muted/50";

const WALLBOARD_REFRESH_INTERVAL_MS = 30_000;

const PERIOD_ROTATION_PRESETS = [
	"current-week",
	"previous-week",
	"current-month",
	"previous-month",
	"year-to-date",
] as const;

const PERIOD_ROTATION_INTERVAL_MS = 25_000;

export const Route = createFileRoute("/wallboard/trends")({
	ssr: false,
	head: () => ({
		meta: [
			{
				title: "Heartbeat - Trends",
			},
		],
	}),
	validateSearch: (search: Record<string, unknown>) =>
		normalizeSupportPeriodInput(search as SupportPeriodInput),
	loaderDeps: ({ search }) => normalizeSupportPeriodInput(search),
	loader: async ({ deps }) => getTrendsWallboard({ data: deps }),
	component: TrendsWallboardPage,
});

function TrendsWallboardPage() {
	const data = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const router = useRouter();

	const autoplayProducts = resolveAutoplayProducts(
		data.selectedProducts,
		data.productHealth.map((row) => row.productName),
		data.availableProducts,
	);

	const totalSteps =
		Math.max(autoplayProducts.length, 1) * PERIOD_ROTATION_PRESETS.length;
	const [rotationStep, setRotationStep] = useState(0);

	// When period rotation is active the navigate() below refetches the loader
	// on every 15s tick, so a separate refresh timer would just double-fire
	// (every 30s two loader runs land back-to-back). Only run the plain refresh
	// when there's nothing to rotate.
	useEffect(() => {
		if (totalSteps > 1) return;
		const dataTimer = window.setInterval(() => {
			void router.invalidate();
		}, WALLBOARD_REFRESH_INTERVAL_MS);

		return () => window.clearInterval(dataTimer);
	}, [router, totalSteps]);

	useEffect(() => {
		if (totalSteps <= 1) return;

		const timer = window.setInterval(() => {
			setRotationStep((current) => {
				const next = (current + 1) % totalSteps;
				const nextPeriod =
					PERIOD_ROTATION_PRESETS[next % PERIOD_ROTATION_PRESETS.length];
				if (nextPeriod !== search.period) {
					startTransition(() => {
						navigate({
							search: {
								period: nextPeriod,
								from: undefined,
								to: undefined,
							},
							replace: true,
						});
					});
				}
				return next;
			});
		}, PERIOD_ROTATION_INTERVAL_MS);

		return () => window.clearInterval(timer);
	}, [totalSteps, navigate, search.period]);

	const productIndex =
		autoplayProducts.length > 0
			? Math.floor(rotationStep / PERIOD_ROTATION_PRESETS.length) %
				autoplayProducts.length
			: 0;
	const focusedProductName =
		autoplayProducts.length > 0 ? autoplayProducts[productIndex] : null;
	const focusedRows = focusedProductName
		? data.productHealth.filter((row) => row.productName === focusedProductName)
		: data.productHealth;
	const focusedSummary = aggregateProductRows(focusedRows);

	// Pick the right NPS slice to show. When a product is focused, only
	// show that product's NPS data — never leak global data into a specific
	// product's spotlight. If the focused product has no NPS yet, render an
	// empty state rather than falling back to global.
	const productNps = focusedProductName
		? data.npsByProduct[focusedProductName] ?? null
		: null;
	const npsSummary = productNps?.summary ?? data.npsSummary;
	const npsSeries = productNps?.series ?? data.npsSeries;
	const npsDistribution = productNps?.distribution ?? data.npsDistribution;
	const npsThemes = productNps?.themes ?? data.npsThemes;
	const npsComments = productNps?.comments ?? data.npsComments;
	const npsHasData = focusedProductName
		? (productNps?.summary.responseCount ?? 0) > 0
		: data.npsSummary.responseCount > 0;
	const npsScopeName = focusedProductName ?? null;
	const periodText = periodPhrase(data.period.label);

	const cxHasSeries = data.cxSeries.some((p) => p.value !== null);
	const npsHasSeries = npsSeries.some((p) => p.value !== null);
	const chartHasAnyData = cxHasSeries || npsHasSeries;

	const happinessPanel = (
		<WallboardSection title="Customer happiness" className="h-full">
			<PaginatedContent intervalMs={20_000}>
				{/* Hero row: show CX + NPS side-by-side when NPS has data; when it
				    doesn't, widen CX to full width so we don't leave an empty
				    slot that would force a bigger page. */}
				{npsHasData ? (
					<div className="grid gap-4 @sm:grid-cols-2">
						<HeroStatCard
							label="CX score"
							value={
								focusedSummary.averageCxScore === null
									? "—"
									: `${Math.round((focusedSummary.averageCxScore / 10) * 100)}%`
							}
							caption={
								focusedSummary.averageCxScore === null
									? `${focusedSummary.ratedCount} rated conversation${focusedSummary.ratedCount === 1 ? "" : "s"}`
									: `${(focusedSummary.averageCxScore / 2).toFixed(1)} / 5.0 avg · ${focusedSummary.ratedCount} rated`
							}
						/>
						<NpsHeroCard
							summary={npsSummary}
							scopeLabel={npsScopeName}
							emptyScope={focusedProductName !== null && !npsHasData}
							periodText={periodText}
						/>
					</div>
				) : (
					<HeroStatCard
						label="CX score"
						value={
							focusedSummary.averageCxScore === null
								? "—"
								: `${Math.round((focusedSummary.averageCxScore / 10) * 100)}%`
						}
						caption={
							focusedSummary.averageCxScore === null
								? `${focusedSummary.ratedCount} rated conversation${focusedSummary.ratedCount === 1 ? "" : "s"} · no NPS responses ${periodText}`
								: `${(focusedSummary.averageCxScore / 2).toFixed(1)} / 5.0 avg · ${focusedSummary.ratedCount} rated · no NPS responses ${periodText}`
						}
					/>
				)}

				{chartHasAnyData ? (
					<CxNpsTrendChart
						className="mt-4"
						cxSeries={data.cxSeries}
						npsSeries={npsSeries}
						title={`Daily trend · ${periodText}`}
						cxCurrent={
							focusedSummary.averageCxScore === null
								? null
								: focusedSummary.averageCxScore / 2
						}
						npsCurrent={npsHasData ? npsSummary.score : null}
					/>
				) : null}

				{npsHasData ? (
					<NpsDistributionBar
						className="mt-4"
						promoter={npsDistribution.promoter}
						passive={npsDistribution.passive}
						detractor={npsDistribution.detractor}
						scopeLabel={npsScopeName}
					/>
				) : null}
			</PaginatedContent>
		</WallboardSection>
	);

	const customerVoicePanel = (
		<WallboardSection title="Customer voice" className="h-full">
			<PaginatedContent intervalMs={20_000}>
				{!npsHasData ? (
					<div
						className={cn(
							wbCell,
							"px-4 py-8 text-center text-sm text-muted-foreground",
						)}
					>
						{`No NPS responses ${periodText}.`}
					</div>
				) : npsComments.length === 0 ? (
					<div
						className={cn(
							wbCell,
							"px-4 py-8 text-center text-sm text-muted-foreground",
						)}
					>
						{npsSummary.responseCount} NPS response
						{npsSummary.responseCount === 1 ? "" : "s"} received {periodText}, but
						no written comments.
					</div>
				) : (
					<NpsCommentList comments={npsComments} />
				)}
			</PaginatedContent>
		</WallboardSection>
	);

	const periodHighlightsPanel = (
		<WallboardSection title="Period highlights" className="h-full">
			<PaginatedContent intervalMs={20_000}>
				<div className="grid grid-cols-2 gap-3 @lg:grid-cols-3">
					<HighlightTile
						label="Cases resolved"
						value={String(focusedSummary.ratedCount + focusedSummary.unratedResolved)}
					/>
					<HighlightTile
						label="CX"
						value={
							focusedSummary.averageCxScore === null
								? "—"
								: `${Math.round((focusedSummary.averageCxScore / 10) * 100)}%`
						}
						caption={
							focusedSummary.averageCxScore === null
								? undefined
								: `${(focusedSummary.averageCxScore / 2).toFixed(1)} / 5.0 avg`
						}
					/>
					<HighlightTile
						label="NPS"
						value={npsHasData ? formatNpsScore(npsSummary.score) : "—"}
						caption={
							npsHasData
								? `avg ${formatAverageRating(npsSummary.averageScore)} · ${npsSummary.responseCount} response${npsSummary.responseCount === 1 ? "" : "s"}`
								: `No responses ${periodText}`
						}
					/>
					<HighlightTile
						label="Rated coverage"
						value={`${focusedSummary.responseRatePercent}%`}
					/>
					<HighlightTile
						label="SLA period"
						value={
							focusedSummary.slaAdherencePercent === null
								? "—"
								: `${focusedSummary.slaAdherencePercent}%`
						}
					/>
					<HighlightTile
						label="Promoters"
						value={npsHasData ? String(npsSummary.promoterCount) : "—"}
						caption={
							npsHasData
								? `vs ${npsSummary.detractorCount} detractors`
								: undefined
						}
					/>
				</div>

				<div className={cn(wbCell, "mt-4 px-4 py-3")}>
					<div className="text-xs uppercase tracking-wide text-muted-foreground">
						What happened
					</div>
					<p className="mt-2 text-sm leading-relaxed text-foreground">
						{buildPeriodHeadline(
							data.period.label,
							focusedSummary,
							npsSummary,
						)}
					</p>
				</div>
			</PaginatedContent>
		</WallboardSection>
	);

	const contributorSummary =
		(focusedProductName
			? data.topContributorsByProduct[focusedProductName]
			: data.topContributors) ?? {
			contributors: [],
			totalRated: 0,
			totalPositive: 0,
		};
	const contributorList = contributorSummary.contributors;

	const tickerItems = buildFocusedTickerItems({
		periodLabel: data.period.label,
		productName: focusedProductName,
		focusedSummary,
		npsSummary,
		npsHasData,
		npsThemes,
		topContributor: contributorList[0] ?? null,
		totalRated: contributorSummary.totalRated,
	});
	const contributorsPanel = (
		<WallboardSection title="AI-assessed CX" className="h-full">
			<PaginatedContent intervalMs={20_000}>
				{contributorList.length === 0 ? (
					<div
						className={cn(
							wbCell,
							"px-4 py-8 text-center text-sm text-muted-foreground",
						)}
					>
						{`No AI-scored conversations ${periodText}.`}
					</div>
				) : (
					contributorList.map((contributor, index) => (
						<div
							key={contributor.name}
							className={index === 0 ? undefined : "mt-3"}
						>
							<ContributorRow contributor={contributor} />
						</div>
					))
				)}
			</PaginatedContent>
		</WallboardSection>
	);

	return (
		<WallboardShell
			title="Trends"
			refreshedAt={data.snapshot.freshnessTimestamp ?? data.refreshedAt}
			stale={data.snapshot.stale}
			tickerItems={tickerItems}
			theme={data.wallboardTheme}
			showcase={
				<>
					<span className="inline-flex items-center gap-2 font-semibold text-[1.75rem] tracking-tight text-foreground">
						{focusedProductName ? (
							<ProductBrandLogo productName={focusedProductName} size="md" />
						) : null}
						{formatProductLabel(focusedProductName)}
					</span>
					<span className="text-sm font-medium text-muted-foreground">
						{data.period.label}
					</span>
				</>
			}
		>
			<div className="grid h-full min-h-0 grid-cols-[minmax(0,1.4fr)_minmax(340px,0.95fr)] grid-rows-1 gap-6">
				<RotatingPanels
					panels={[
						{
							id: "trends-happiness",
							label: "Happiness",
							content: happinessPanel,
						},
						// Only include Customer voice when there are NPS responses for
						// the focused scope — no point rotating to an empty page.
						npsHasData
							? {
									id: "trends-customer-voice",
									label: "Customer voice",
									content: customerVoicePanel,
								}
							: null,
					].filter(
						(p): p is { id: string; label: string; content: React.ReactNode } =>
							p !== null,
					)}
					intervalMs={28_000}
					className="min-h-0"
				/>
				<RotatingPanels
					panels={[
						{
							id: "trends-period-highlights",
							label: "Period highlights",
							content: periodHighlightsPanel,
						},
						// Only rotate to AI-assessed CX when the focused scope
						// actually has scored conversations to show.
						contributorList.length > 0
							? {
									id: "trends-contributors",
									label: "AI-assessed CX",
									content: contributorsPanel,
								}
							: null,
					].filter(
						(p): p is { id: string; label: string; content: React.ReactNode } =>
							p !== null,
					)}
					intervalMs={28_000}
					initialIndex={0}
					className="min-h-0"
				/>
			</div>
		</WallboardShell>
	);
}

function HeroStatCard({
	label,
	value,
	caption,
	trendLabel,
}: {
	label: string;
	value: string;
	caption: string;
	trendLabel?: string;
}) {
	return (
		<div className={cn(wbCell, "px-4 py-4")}>
			<div className="text-sm text-muted-foreground">{label}</div>
			<div className="mt-2 text-5xl font-semibold tracking-tight text-foreground">
				{value}
			</div>
			<div className="mt-2 text-xs text-muted-foreground">
				{trendLabel ? `${trendLabel} · ` : ""}
				{caption}
			</div>
		</div>
	);
}

function NpsHeroCard({
	summary,
	scopeLabel,
	emptyScope = false,
	periodText,
}: {
	summary: NpsPeriodSummary;
	scopeLabel: string | null;
	emptyScope?: boolean;
	periodText: string;
}) {
	const hasData = summary.responseCount > 0;
	const score = hasData ? summary.score : null;
	const deltaText =
		summary.delta === null
			? "No prior period data"
			: summary.delta === 0
				? "Unchanged vs previous period"
				: `${summary.delta > 0 ? "+" : ""}${Math.round(summary.delta)} pts vs previous period`;
	return (
		<div className={cn(wbCell, "px-4 py-4")}>
			<div className="flex items-center justify-between gap-2">
				<div className="text-sm text-muted-foreground">NPS score</div>
				{scopeLabel ? (
					<span className="rounded-md border border-border/50 bg-muted/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
						{scopeLabel}
					</span>
				) : null}
			</div>
			<div
				className={cn(
					"mt-2 text-5xl font-semibold tabular-nums tracking-tight",
					score === null
						? "text-foreground"
						: score >= 50
							? "text-emerald-600 dark:text-emerald-300"
							: score >= 0
								? "text-foreground"
								: "text-red-600 dark:text-red-300",
				)}
			>
				{score === null ? "—" : formatNpsScore(score)}
			</div>
			<div className="mt-2 text-xs text-muted-foreground">
				{hasData
					? `${summary.promoterCount} promoter${summary.promoterCount === 1 ? "" : "s"} − ${summary.detractorCount} detractor${summary.detractorCount === 1 ? "" : "s"} of ${summary.responseCount} · avg ${formatAverageRating(summary.averageScore)} · ${deltaText}`
					: `No NPS responses ${periodText}`}
			</div>
		</div>
	);
}

function HighlightTile({
	label,
	value,
	caption,
}: {
	label: string;
	value: string;
	caption?: string;
}) {
	return (
		<div className={cn(wbCell, "px-4 py-3")}>
			<div className="text-xs uppercase tracking-wide text-muted-foreground">
				{label}
			</div>
			<div className="mt-2 text-3xl font-semibold tabular-nums text-foreground">
				{value}
			</div>
			{caption ? (
				<div className="mt-1 text-[11px] text-muted-foreground">
					{caption}
				</div>
			) : null}
		</div>
	);
}

function ContributorRow({
	contributor,
}: {
	contributor: TopContributor;
}) {
	return (
		<div className={cn(wbCell, "flex items-center gap-3 px-4 py-3")}>
			<Avatar className="h-10 w-10 border border-border/60">
				{contributor.avatarUrl ? (
					<AvatarImage src={contributor.avatarUrl} alt={contributor.name} />
				) : null}
				<AvatarFallback className="bg-muted text-sm text-foreground">
					{contributor.name.charAt(0).toUpperCase()}
				</AvatarFallback>
			</Avatar>
			<div className="min-w-0 flex-1">
				<div className="truncate text-base font-semibold text-foreground">
					{contributor.name}
				</div>
				<div className="text-xs text-muted-foreground">
					{contributor.representativeProduct
						? `Shining in ${contributor.representativeProduct}`
						: "Across multiple products"}
				</div>
			</div>
			<div className="shrink-0 text-right">
				<div className="text-2xl font-semibold tabular-nums text-foreground">
					{contributor.positiveCount}
				</div>
				<div className="text-[11px] text-muted-foreground">
					conversation{contributor.positiveCount === 1 ? "" : "s"} AI-scored 4–5
				</div>
			</div>
		</div>
	);
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

interface AggregatedProductSummary {
	ratedCount: number;
	unratedResolved: number;
	openNowCount: number;
	awaitingTeamNowCount: number;
	breachedNowCount: number;
	slaTrackedCount: number;
	slaMissedCount: number;
	slaAdherencePercent: number | null;
	satisfactionScorePercent: number | null;
	responseRatePercent: number;
	/** Weighted average CX rating on the native 0–10 scale. */
	averageCxScore: number | null;
}

function aggregateProductRows(
	rows: ProductHealthRow[],
): AggregatedProductSummary {
	if (rows.length === 0) {
		return {
			ratedCount: 0,
			unratedResolved: 0,
			openNowCount: 0,
			awaitingTeamNowCount: 0,
			breachedNowCount: 0,
			slaTrackedCount: 0,
			slaMissedCount: 0,
			slaAdherencePercent: null,
			satisfactionScorePercent: null,
			responseRatePercent: 0,
			averageCxScore: null,
		};
	}
	const openNowCount = rows.reduce((s, r) => s + r.openNowCount, 0);
	const awaitingTeamNowCount = rows.reduce(
		(s, r) => s + r.awaitingTeamCount,
		0,
	);
	const breachedNowCount = rows.reduce((s, r) => s + r.breachedNowCount, 0);
	const slaTrackedCount = rows.reduce((s, r) => s + r.slaTrackedCount, 0);
	const slaMissedCount = rows.reduce((s, r) => s + r.slaMissedCount, 0);
	const ratedCount = rows.reduce((s, r) => s + r.ratedCount, 0);
	const eligibleCount = rows.reduce((s, r) => s + r.eligibleCount, 0);
	const positiveCount = rows.reduce((s, r) => s + r.positiveCount, 0);
	const unratedResolved = Math.max(0, eligibleCount - ratedCount);

	// Weighted average of per-row average CX scores, weighted by ratedCount.
	let cxScoreWeighted = 0;
	let cxWeight = 0;
	for (const row of rows) {
		if (row.cxScore === null || row.ratedCount === 0) continue;
		cxScoreWeighted += row.cxScore * row.ratedCount;
		cxWeight += row.ratedCount;
	}

	return {
		ratedCount,
		unratedResolved,
		openNowCount,
		awaitingTeamNowCount,
		breachedNowCount,
		slaTrackedCount,
		slaMissedCount,
		slaAdherencePercent:
			slaTrackedCount === 0
				? null
				: Math.round(
						((slaTrackedCount - slaMissedCount) / slaTrackedCount) * 100,
					),
		satisfactionScorePercent:
			ratedCount === 0
				? null
				: Math.round((positiveCount / ratedCount) * 100),
		averageCxScore:
			cxWeight === 0 ? null : Math.round((cxScoreWeighted / cxWeight) * 10) / 10,
		responseRatePercent:
			eligibleCount === 0
				? 0
				: Math.round((ratedCount / eligibleCount) * 100),
	};
}

/**
 * Classic NPS score is an integer in −100..100. Always show the sign so
 * readers can tell at a glance whether the score is positive.
 */
function formatNpsScore(score: number): string {
	const rounded = Math.round(score);
	return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

function formatAverageRating(average: number | null): string {
	return average === null ? "—" : `${average.toFixed(1)} / 10`;
}

/**
 * Turn a period label (e.g. "Current week") into the phrase form used in
 * inline sentences. "Current week" → "this week", "Past month" stays as
 * "past month", "Year to date" stays as-is.
 */
function periodPhrase(label: string): string {
	return label.toLowerCase().replace(/^current /, "this ");
}

/**
 * Ticker items for the trends wallboard, derived client-side so they always
 * match whichever product + period is currently in focus. Every statement
 * scopes to either the focused product ("twoday: …") or "All products".
 */
function buildFocusedTickerItems(input: {
	periodLabel: string;
	productName: string | null;
	focusedSummary: AggregatedProductSummary;
	npsSummary: NpsPeriodSummary;
	npsHasData: boolean;
	npsThemes: NpsTheme[];
	topContributor: TopContributor | null;
	totalRated: number;
}): string[] {
	const {
		periodLabel,
		productName,
		focusedSummary,
		npsSummary,
		npsHasData,
		npsThemes,
		topContributor,
		totalRated,
	} = input;
	const scope = productName ?? "All products";
	const periodLower = periodLabel.toLowerCase();
	// "this week" / "this month" etc.
	const withinPhrase = periodLower
		.replace(/^current /, "this ")
		.replace(/^past /, "past ")
		.replace(/^year to date$/, "year to date");
	const items: string[] = [];

	const resolvedCount =
		focusedSummary.ratedCount + focusedSummary.unratedResolved;
	const cxPart =
		focusedSummary.averageCxScore === null
			? `no CX ratings ${withinPhrase}`
			: (() => {
					const pct = Math.round(
						(focusedSummary.averageCxScore / 10) * 100,
					);
					const raw = (focusedSummary.averageCxScore / 2).toFixed(1);
					return `CX ${pct}% (${raw}/5.0)`;
				})();
	const npsPart = npsHasData
		? `NPS ${formatNpsScore(npsSummary.score)} (avg ${formatAverageRating(npsSummary.averageScore)}) from ${npsSummary.responseCount} response${npsSummary.responseCount === 1 ? "" : "s"}`
		: `no NPS responses ${withinPhrase}`;

	items.push(
		`${scope} · ${periodLabel}: ${resolvedCount} case${resolvedCount === 1 ? "" : "s"} resolved · ${cxPart} · ${npsPart}`,
	);

	if (npsHasData && npsSummary.delta !== null && npsSummary.delta !== 0) {
		const deltaAbs = Math.abs(Math.round(npsSummary.delta));
		items.push(
			`${scope}: NPS ${npsSummary.delta > 0 ? "up" : "down"} ${deltaAbs} point${deltaAbs === 1 ? "" : "s"} vs previous ${periodLower}`,
		);
	}

	const positiveCount = focusedSummary.ratedCount
		? Math.round(
				((focusedSummary.satisfactionScorePercent ?? 0) / 100) *
					focusedSummary.ratedCount,
			)
		: 0;
	if (positiveCount > 0) {
		items.push(
			`${scope}: ${positiveCount} conversation${positiveCount === 1 ? "" : "s"} AI-scored 4–5 ${withinPhrase}`,
		);
	}

	if (topContributor && topContributor.positiveCount > 0 && totalRated > 0) {
		items.push(
			`${topContributor.name}: ${topContributor.positiveCount} of ${totalRated} positive rating${totalRated === 1 ? "" : "s"} in ${scope} ${withinPhrase}`,
		);
	}

	const positiveTheme = npsThemes.find((t) => t.sentiment === "positive");
	if (positiveTheme) {
		items.push(`${scope} customer voice: ${positiveTheme.headline}`);
	}
	const negativeTheme = npsThemes.find((t) => t.sentiment === "negative");
	if (negativeTheme) {
		items.push(`${scope} area to watch: ${negativeTheme.headline}`);
	}

	return items.slice(0, 8);
}

function formatNpsScoreShort(score: number): string {
	return formatNpsScore(score);
}

function formatCxScore(score: number | null): string {
	if (score === null) return "—";
	// cxScore is normalised 0–10 in the DB (doubled from Intercom's 1–5
	// conversation rating). Present as a familiar X/5 average.
	const onFive = score / 2;
	return `${onFive.toFixed(1)} / 5.0`;
}

function buildPeriodHeadline(
	periodLabel: string,
	summary: AggregatedProductSummary,
	nps: NpsPeriodSummary,
): string {
	const parts: string[] = [];
	const cxText =
		summary.averageCxScore === null
			? "No CX ratings"
			: `CX ${Math.round((summary.averageCxScore / 10) * 100)}% (${(summary.averageCxScore / 2).toFixed(1)}/5.0 avg)`;
	parts.push(`${periodLabel}: ${cxText}`);
	if (nps.responseCount > 0) {
		const deltaNote =
			nps.delta === null
				? ""
				: nps.delta === 0
					? ", flat vs previous period"
					: `, ${nps.delta > 0 ? "up" : "down"} ${Math.abs(Math.round(nps.delta))} pts vs previous period`;
		parts.push(
			`NPS ${formatNpsScore(nps.score)} (avg ${formatAverageRating(nps.averageScore)}) from ${nps.responseCount} response${nps.responseCount === 1 ? "" : "s"}${deltaNote}`,
		);
	}
	return `${parts.join(" · ")}.`;
}
