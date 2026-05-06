import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Monitor, Settings2, TriangleAlert } from "lucide-react";
import { type ReactNode, startTransition } from "react";
import { InfoTooltip } from "@/components/info-tooltip";
import { SupportCxSummary } from "@/components/support-cx-summary";
import { SupportPeriodFilter } from "@/components/support-period-filter";
import { SupportProductFilter } from "@/components/support-product-filter";
import { Button } from "@/components/ui/button";
import { CaseLookupCard } from "@/components/wallboard/case-lookup-card";
import { normalizeSupportProductFilterInput } from "@/lib/support-health/filter";
import {
	normalizeSupportPeriodInput,
	type SupportPeriodInput,
} from "@/lib/support-health/period";
import {
	getLiveWallboard,
	getTrendsWallboard,
} from "@/lib/support-health/server";
import type { SupportHealthSnapshot } from "@/lib/support-health/types";
import { cn } from "@/lib/utils";

const dashboardSectionClassName = "border-t border-border/40 pt-5";
const dashboardBlockClassName = "py-2";
const dashboardRowClassName = "py-3";

export const Route = createFileRoute("/")({
	head: () => ({
		meta: [
			{
				title: "Heartbeat - Dashboard",
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
	loader: async ({ deps }) => {
		const [live, trends] = await Promise.all([
			getLiveWallboard({ data: deps }),
			getTrendsWallboard({ data: deps }),
		]);
		return { live, trends };
	},
	component: SupportDashboardPage,
});

function SupportDashboardPage() {
	const { live, trends } = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const periodSearch = {
		period: search.period,
		from: search.from,
		to: search.to,
		products: search.products,
	};
	const selectedPeriodLabel = trends.period.label.toLowerCase();
	const hasCurrentCustomerHappiness = trends.periodSummary.ratedCount > 0;
	const hasAnyCustomerHappiness =
		hasCurrentCustomerHappiness ||
		trends.periods.some((period) => period.ratedCount > 0);
	const customerHappinessScope = formatProductScope(live.selectedProducts);
	const noCustomerHappinessText =
		live.selectedProducts.length === 1
			? `${customerHappinessScope} does not have customer happiness yet.`
			: live.selectedProducts.length > 1
				? `${customerHappinessScope} do not have customer happiness yet.`
				: "Customer happiness is not available yet.";
	const customerHappinessDataScope =
		live.selectedProducts.length === 1 ? "this product" : "these products";

	function handlePeriodChange(next: {
		period: "current-week" | "previous-week" | "custom";
		from?: string;
		to?: string;
	}) {
		navigate({
			search: {
				period: next.period,
				from: next.period === "custom" ? next.from : undefined,
				to: next.period === "custom" ? next.to : undefined,
				products: search.products ?? [],
			},
			replace: true,
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

	return (
		<div className="mx-auto max-w-7xl p-4 lg:p-6">
			<div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">
						Support dashboard
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Start here for the current state, then jump into the monitor views
						when needed.
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Link
						to="/wallboard/live"
						search={{ products: search.products ?? [] }}
					>
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
				<div className="mb-6 flex items-center gap-3 border-l-2 border-amber-400 py-2 pl-3 text-sm text-amber-900 dark:text-amber-200">
					<TriangleAlert className="h-4 w-4 shrink-0" />
					<div>
						The last sync is older than 10 minutes. Treat the board as stale
						until the next Intercom refresh succeeds.
					</div>
				</div>
			) : null}

			<div className="mb-6 flex flex-wrap items-center justify-between gap-3">
				<div>
					<div className="text-sm font-medium">Products in focus</div>
					<div className="text-sm text-muted-foreground">
						{live.selectedProducts.length > 0
							? live.selectedProducts.join(", ")
							: "All products"}
					</div>
				</div>
				<SupportProductFilter
					availableProducts={live.availableProducts}
					selectedProducts={live.selectedProducts}
					onChange={handleProductChange}
				/>
			</div>

			<div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
				<div className="space-y-8">
					<section className={dashboardSectionClassName}>
						<SectionHeader
							title="Current state"
							description="This is the live queue from the last Intercom sync. It shows what support needs to reply to now."
						/>
						<div className="space-y-4">
							<div className={dashboardBlockClassName}>
								<div className="text-lg font-semibold tracking-tight">
									{buildQueueHeadline(live.snapshot)}
								</div>
								<div className="mt-1 text-sm text-muted-foreground">
									{buildQueueSupportingText(live.snapshot)}
								</div>
							</div>
							<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
								<MetricItem
									label={`Satisfaction in ${selectedPeriodLabel}`}
									tooltip={`Percent of rated conversations in ${selectedPeriodLabel} with a 4 or 5 score.`}
									value={
										!hasCurrentCustomerHappiness ||
										trends.periodSummary.satisfactionScorePercent === null
											? "—"
											: `${trends.periodSummary.satisfactionScorePercent}%`
									}
									warning={
										hasCurrentCustomerHappiness &&
										trends.periodSummary.satisfactionScorePercent !== null &&
										trends.periodSummary.satisfactionScorePercent <
											trends.selectedTargets.satisfactionTargetPercent
									}
									detail={
										hasCurrentCustomerHappiness ? undefined : "No ratings yet"
									}
								/>
								<MetricItem
									label={`Rated in ${selectedPeriodLabel}`}
									tooltip={`Share of eligible conversations resolved in ${selectedPeriodLabel} that received a customer rating.`}
									value={
										trends.periodSummary.eligibleCount === 0
											? "—"
											: `${trends.periodSummary.responseRatePercent}%`
									}
									detail={
										trends.periodSummary.eligibleCount === 0
											? "No resolved conversations"
											: trends.periodSummary.ratedCount === 0
												? "No ratings yet"
												: `${trends.periodSummary.ratedCount}/${trends.periodSummary.eligibleCount} rated`
									}
								/>
								<MetricItem
									label="Waiting on us"
									tooltip="Open cases where support owes the next reply. Includes due soon and over-SLA cases."
									value={String(live.snapshot.currentAwaitingTeamCount)}
								/>
								<MetricItem
									label="Over SLA now"
									tooltip="Open cases that are currently past their SLA due time."
									value={String(live.snapshot.currentBreachedCount)}
									danger
								/>
								<MetricItem
									label="Due in 60m"
									tooltip="Open SLA-tracked cases due within 60 minutes, excluding already breached cases."
									value={String(live.snapshot.currentDueSoonCount)}
									warning
								/>
								<MetricItem
									label="Unassigned"
									tooltip="Open cases without an owner assigned."
									value={String(live.snapshot.currentUnassignedCount)}
								/>
							</div>
						</div>
					</section>

					<section className={dashboardSectionClassName}>
						<SectionHeader
							title="Open by product now"
							description="These are the products with open work right now, ordered by where support pressure is highest. `Over SLA` is already missed. `Due in 60m` is the next risk and does not include breached cases."
							action={
								<Link
									to="/wallboard/live"
									search={{ products: search.products ?? [] }}
								>
									<Button variant="ghost" size="sm">
										Open monitor
									</Button>
								</Link>
							}
						/>
						<div className="space-y-3">
							{live.mappedQueues.length === 0 ? (
								live.unknownSignals.length > 0 ? (
									<div className={dashboardBlockClassName}>
										<div className="font-medium">
											Open work is in the database, but product mapping is
											incomplete.
										</div>
										<div className="mt-1 text-sm text-muted-foreground">
											These signals appear most often in the unmapped cases and
											are the best candidates for product rules.
										</div>
										<div className="mt-4 grid gap-2 sm:grid-cols-2">
											{live.unknownSignals.map((signal) => (
												<div
													key={`${signal.kind}-${signal.label}`}
													className="flex items-center justify-between py-2 text-sm"
												>
													<div className="min-w-0">
														<div className="truncate font-medium">
															{signal.label}
														</div>
														<div className="text-xs text-muted-foreground">
															{signal.kind === "queue"
																? "Queue signal"
																: "Tag signal"}
														</div>
													</div>
													<div className="text-base font-semibold">
														{signal.count}
													</div>
												</div>
											))}
										</div>
									</div>
								) : (
									<div
										className={cn(
											dashboardBlockClassName,
											"text-sm text-muted-foreground",
										)}
									>
										No Intercom data yet.
									</div>
								)
							) : (
								live.mappedQueues.slice(0, 6).map((queue) => (
									<div
										key={queue.teamName}
										className={cn(dashboardRowClassName, "first:pt-0")}
									>
										<div className="min-w-0">
											<div className="truncate font-medium">
												{queue.teamName}
											</div>
											<div className="mt-1 text-xs text-muted-foreground">
												{formatQueueSources(queue.sourceQueues)}
											</div>
										</div>
										<div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
											<QueueMetric label="Open" value={queue.activeCaseCount} />
											<QueueMetric
												label="Waiting"
												value={queue.awaitingTeamCount}
											/>
											<QueueMetric
												label="Over SLA"
												value={queue.breachedCount}
												danger
											/>
											<QueueMetric
												label="Due in 60m"
												value={queue.dueSoonCount}
												warning
											/>
											<QueueMetric
												label="Unassigned"
												value={queue.unassignedCount}
											/>
										</div>
									</div>
								))
							)}
						</div>
					</section>

					<section className={dashboardSectionClassName}>
						<SectionHeader
							title="Product health"
							description={`Open work is current. SLA uses ${trends.period.label.toLowerCase()}. CX uses all eligible rated cases in ${trends.period.label.toLowerCase()}. Current targets: SLA ${trends.selectedTargets.slaTargetPercent}% • CX ${trends.selectedTargets.satisfactionTargetPercent}%.`}
							action={
								<SupportPeriodFilter
									period={search.period}
									from={trends.period.from}
									to={trends.period.to}
									onChange={handlePeriodChange}
								/>
							}
						/>
						<div className="space-y-3">
							<div className="grid gap-3 sm:grid-cols-5">
								<CoverageItem
									label="Satisfaction score"
									tooltip={`Percent of rated conversations in ${trends.period.label.toLowerCase()} with a 4 or 5 score.`}
									value={
										!hasCurrentCustomerHappiness ||
										trends.periodSummary.satisfactionScorePercent === null
											? "—"
											: `${trends.periodSummary.satisfactionScorePercent}%`
									}
									detail={
										hasCurrentCustomerHappiness ? undefined : "No ratings yet"
									}
								/>
								<CoverageItem
									label="Rated"
									tooltip={`Share of eligible conversations resolved in ${trends.period.label.toLowerCase()} that received a rating.`}
									value={
										trends.periodSummary.eligibleCount === 0
											? "—"
											: `${trends.periodSummary.responseRatePercent}%`
									}
									detail={
										trends.periodSummary.eligibleCount === 0
											? "No resolved conversations"
											: trends.periodSummary.ratedCount === 0
												? "No ratings yet"
												: `${trends.periodSummary.ratedCount}/${trends.periodSummary.eligibleCount} rated`
									}
								/>
								<CoverageItem
									label="SLA met"
									tooltip={`SLA adherence for the ${trends.period.label.toLowerCase()} period.`}
									value={
										trends.periodSummary.slaAdherencePercent === null
											? "—"
											: `${trends.periodSummary.slaAdherencePercent}%`
									}
									danger={
										trends.periodSummary.slaAdherencePercent !== null &&
										trends.periodSummary.slaAdherencePercent <
											trends.selectedTargets.slaTargetPercent
									}
								/>
								<CoverageItem
									label="Open now"
									tooltip="Count of currently open cases in the selected products."
									value={trends.periodSummary.openNowCount}
								/>
								<CoverageItem
									label="Over SLA now"
									tooltip="Open cases currently beyond SLA due time in the selected products."
									value={trends.periodSummary.breachedNowCount}
								/>
							</div>
							<div className="space-y-3">
								{trends.productHealth.length === 0 ? (
									<div
										className={cn(
											dashboardBlockClassName,
											"text-sm text-muted-foreground",
										)}
									>
										No product activity in this period.
									</div>
								) : (
									trends.productHealth.map((row) => (
										<div
											key={`${row.serviceBucket}-${row.productName}`}
											className={cn(dashboardRowClassName, "first:pt-0")}
										>
											<div className="min-w-0">
												<div className="truncate font-medium">
													{row.productName}
												</div>
												<div className="mt-1 text-xs text-muted-foreground">
													Open work is live. SLA target{" "}
													{row.targets.slaTargetPercent}% • CX target{" "}
													{row.targets.satisfactionTargetPercent}% for{" "}
													{trends.period.label.toLowerCase()}.
												</div>
											</div>
											<div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
												<QueueMetric
													label="Waiting"
													value={row.awaitingTeamCount}
												/>
												<QueueMetric
													label="Open now"
													value={row.openNowCount}
												/>
												<QueueMetric
													label="Over SLA"
													value={row.breachedNowCount}
													danger
												/>
												<QueueMetric
													label="SLA"
													value={
														row.slaAdherencePercent === null
															? "—"
															: `${row.slaAdherencePercent}%`
													}
													danger={
														row.slaAdherencePercent !== null &&
														row.slaAdherencePercent <
															row.targets.slaTargetPercent
													}
												/>
												<QueueMetric
													label="Satisfaction"
													value={
														row.ratedCount === 0 ||
														row.satisfactionScorePercent === null
															? "—"
															: `${row.satisfactionScorePercent}%`
													}
													danger={
														row.ratedCount > 0 &&
														row.satisfactionScorePercent !== null &&
														row.satisfactionScorePercent <
															row.targets.satisfactionTargetPercent
													}
													detail={
														row.ratedCount === 0 ? "No ratings yet" : undefined
													}
												/>
												<QueueMetric
													label="Rated"
													value={
														row.eligibleCount === 0
															? "—"
															: `${row.responseRatePercent}%`
													}
													warning={
														row.ratedCount > 0 && row.responseRatePercent < 20
													}
													detail={
														row.eligibleCount === 0
															? "No resolved conversations"
															: row.ratedCount === 0
																? "No ratings yet"
																: `${row.ratedCount}/${row.eligibleCount} rated`
													}
												/>
											</div>
										</div>
									))
								)}
							</div>
							{live.snapshot.unknownCaseCount > 0 ? (
								<div className="py-2 text-sm text-muted-foreground">
									{live.snapshot.unknownCaseCount} open cases are still unmapped
									and are excluded from the product table above.
								</div>
							) : null}
						</div>
					</section>
				</div>

				<div className="space-y-8">
					<section className={dashboardSectionClassName}>
						<SectionHeader
							title="IDs to check now"
							description="Use these Intercom IDs to open the cases that are currently driving the queue."
						/>
						<div className="space-y-3">
							{live.lookupCases.length === 0 ? (
								<div
									className={cn(
										dashboardBlockClassName,
										"text-sm text-muted-foreground",
									)}
								>
									No open cases need support right now.
								</div>
							) : (
								<div className="space-y-1">
									{live.lookupCases.map((item) => (
										<CaseLookupCard
											key={item.id}
											item={item}
											appUrl={live.intercomAppUrl}
											variant="row"
										/>
									))}
								</div>
							)}
						</div>
					</section>

					<section className={dashboardSectionClassName}>
						<SectionHeader
							title="Customer happiness"
							description="The selected period leads. Month, quarter, and year stay visible as context."
							action={
								<Link to="/wallboard/trends" search={periodSearch}>
									<Button variant="ghost" size="sm">
										Open trends
									</Button>
								</Link>
							}
						/>
						<div className="space-y-4">
							{hasAnyCustomerHappiness ? (
								<>
									<div className={dashboardBlockClassName}>
										<SupportCxSummary
											label={trends.period.label}
											satisfactionScorePercent={
												trends.periodSummary.satisfactionScorePercent
											}
											ratedCount={trends.periodSummary.ratedCount}
											positiveCount={trends.periodSummary.positiveCount}
											responseRatePercent={
												trends.periodSummary.responseRatePercent
											}
											ratingMix={trends.periodSummary.ratingMix}
										/>
									</div>
									<div className="grid gap-3 sm:grid-cols-2">
										{trends.periods.map((period) => (
											<div
												key={period.label}
												className={dashboardBlockClassName}
											>
												<div className="text-sm text-muted-foreground">
													{period.label}
												</div>
												<div className="mt-1 text-3xl font-semibold tracking-tight">
													{period.satisfactionScorePercent === null
														? "—"
														: `${period.satisfactionScorePercent}%`}
												</div>
												<div className="mt-1 text-xs text-muted-foreground">
													{period.eligibleCount === 0
														? "No resolved conversations"
														: period.ratedCount === 0
															? "No ratings yet"
															: `${period.ratedCount}/${period.eligibleCount} rated`}
												</div>
											</div>
										))}
									</div>
								</>
							) : (
								<div className={dashboardBlockClassName}>
									<div className="text-sm font-medium text-foreground">
										{noCustomerHappinessText}
									</div>
									<div className="mt-1 text-sm text-muted-foreground">
										Heartbeat will show satisfaction and rated coverage once
										Intercom has rated resolved conversations for{" "}
										{customerHappinessDataScope}.
									</div>
								</div>
							)}
						</div>
					</section>
				</div>
			</div>
		</div>
	);
}

function SectionHeader({
	title,
	description,
	action,
}: {
	title: string;
	description: string;
	action?: ReactNode;
}) {
	return (
		<div className="mb-4 flex flex-wrap items-start justify-between gap-4">
			<div className="min-w-0">
				<h2 className="text-base font-semibold leading-tight">{title}</h2>
				<p className="mt-1 max-w-3xl text-sm text-muted-foreground">
					{description}
				</p>
			</div>
			{action ? <div className="shrink-0">{action}</div> : null}
		</div>
	);
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
		`${snapshot.currentAwaitingTeamCount} waiting on us`,
		`${snapshot.currentUnassignedCount} unassigned`,
		`${snapshot.currentAwaitingCustomerCount} waiting on customer`,
	];

	if (snapshot.unknownCaseCount > 0) {
		parts.push(`${snapshot.unknownCaseCount} not mapped to a product yet`);
	}

	return parts.join(" • ");
}

function formatProductScope(selectedProducts: string[]) {
	if (selectedProducts.length === 1) return selectedProducts[0];
	if (selectedProducts.length > 1) return "The selected products";
	return "All products";
}

function MetricItem({
	label,
	tooltip,
	value,
	warning,
	danger,
	detail,
}: {
	label: string;
	tooltip?: string;
	value: string;
	warning?: boolean;
	danger?: boolean;
	detail?: string;
}) {
	return (
		<div className={dashboardBlockClassName}>
			<div className="text-sm text-muted-foreground">
				<InfoTooltip label={label} tooltip={tooltip} />
			</div>
			<div
				className={cn(
					"mt-2 text-4xl font-semibold tracking-tight",
					warning && "text-amber-700 dark:text-amber-400",
					danger && "text-red-700 dark:text-red-400",
				)}
			>
				{value}
			</div>
			{detail ? (
				<div className="mt-1 text-xs text-muted-foreground">{detail}</div>
			) : null}
		</div>
	);
}

function QueueMetric({
	label,
	tooltip,
	value,
	warning,
	danger,
	detail,
}: {
	label: string;
	tooltip?: string;
	value: string | number;
	warning?: boolean;
	danger?: boolean;
	detail?: string;
}) {
	return (
		<div className="min-w-0">
			<div className="text-[11px] text-muted-foreground">
				<InfoTooltip label={label} tooltip={tooltip} />
			</div>
			<div
				className={cn(
					"mt-1 text-lg font-medium",
					warning && "text-amber-700 dark:text-amber-400",
					danger && "text-red-700 dark:text-red-400",
				)}
			>
				{value}
			</div>
			{detail ? (
				<div className="mt-1 text-[11px] leading-snug text-muted-foreground">
					{detail}
				</div>
			) : null}
		</div>
	);
}

function CoverageItem({
	label,
	tooltip,
	value,
	danger,
	detail,
}: {
	label: string;
	tooltip?: string;
	value: number | string;
	danger?: boolean;
	detail?: string;
}) {
	return (
		<div className={dashboardBlockClassName}>
			<div className="text-xs text-muted-foreground">
				<InfoTooltip label={label} tooltip={tooltip} />
			</div>
			<div
				className={cn(
					"mt-2 text-3xl font-semibold tracking-tight",
					danger && "text-red-700 dark:text-red-400",
				)}
			>
				{value}
			</div>
			{detail ? (
				<div className="mt-1 text-xs text-muted-foreground">{detail}</div>
			) : null}
		</div>
	);
}

function formatQueueSources(sourceQueues: string[]) {
	if (sourceQueues.length === 0) return "No dedicated queue detected";
	if (sourceQueues.length === 1) return `Queue ${sourceQueues[0]}`;
	return `Queues ${sourceQueues.join(", ")}`;
}
