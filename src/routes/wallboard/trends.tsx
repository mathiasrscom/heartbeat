import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
	Bot,
	Frown,
	Heart,
	MessageSquareQuote,
	MessageSquareText,
	Radar,
	Star,
	Users,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import {
	WallboardSection,
	WallboardShell,
} from "@/components/wallboard/wallboard-shell";
import {
	saveWallboardPulsePeriod,
	type WallboardPulsePeriod,
} from "@/lib/intercom-admin";
import type {
	NpsComment,
	NpsPeriodSummary,
	NpsTheme,
	ProductHealthRow,
	TrendsWallboardData,
} from "@/lib/support-health/types";
import { cn } from "@/lib/utils";

const WALLBOARD_REFRESH_INTERVAL_MS = 60_000;

export const Route = createFileRoute("/wallboard/trends")({
	beforeLoad: () => {
		throw redirect({ to: "/wallboard/pulse" });
	},
});

export function CustomerPulseWallboard({
	data,
}: {
	data: TrendsWallboardData;
}) {
	const router = useRouter();
	const themes = selectPriorityThemes(data.npsThemes);
	const voice = selectVoice(data.npsComments);
	const happiness = selectHappiness(data);
	const satisfaction = happiness?.satisfactionScorePercent ?? null;
	const hasPeriodNps = data.npsSummary.responseCount > 0;
	const pulseLabel =
		satisfaction !== null &&
		satisfaction < data.selectedTargets.satisfactionTargetPercent
			? "Customer confidence needs attention"
			: data.npsSummary.detractorCount > data.npsSummary.promoterCount / 2
				? "Customer needs are shifting"
				: "Customer pulse is steady";

	useEffect(() => {
		const timer = window.setInterval(
			() => void router.invalidate(),
			WALLBOARD_REFRESH_INTERVAL_MS,
		);
		return () => window.clearInterval(timer);
	}, [router]);

	return (
		<WallboardShell
			title="Customer pulse"
			refreshedAt={data.snapshot.freshnessTimestamp ?? data.refreshedAt}
			stale={data.snapshot.stale}
			tickerItems={[...themes.map((theme) => theme.headline)]}
			theme={data.wallboardTheme}
			navigationControl={
				<PulsePeriodPicker period={toPickerPeriod(data.period.preset)} />
			}
			showcase={
				<span className="text-lg font-medium text-muted-foreground">
					What customers need from us
				</span>
			}
		>
			<div className="grid h-full min-h-0 grid-cols-[minmax(0,1.52fr)_minmax(380px,0.88fr)] gap-7">
				<div className="flex min-h-0 flex-col gap-5">
					<PulseHero label={pulseLabel} data={data} />
					<WallboardSection
						title="Recurring customer needs"
						className="min-h-0 flex-1"
					>
						{themes.length > 0 ? (
							<div
								className="grid h-full gap-4"
								style={{
									gridTemplateRows: `repeat(${themes.length}, minmax(0, 1fr))`,
								}}
							>
								{themes.map((theme) => (
									<ThemeCard key={theme.headline} theme={theme} />
								))}
							</div>
						) : (
							<EmptyThemes />
						)}
					</WallboardSection>
				</div>

				<div className="flex min-h-0 flex-col gap-6">
					<WallboardSection title={`Customer happiness · ${data.period.label}`}>
						<div className="grid grid-cols-2 gap-3">
							<PulseMetric
								label="Customer happiness"
								value={satisfaction === null ? "—" : `${satisfaction}%`}
								detail={
									happiness
										? `${happiness.ratedCount} CX ratings · ${formatPeriodContext(happiness.label)}`
										: `No CX ratings in ${data.period.label.toLowerCase()}`
								}
								icon={Heart}
								tone={
									satisfaction !== null &&
									satisfaction < data.selectedTargets.satisfactionTargetPercent
										? "warn"
										: "good"
								}
							/>
							<PulseMetric
								label="NPS"
								value={hasPeriodNps ? formatNps(data.npsSummary.score) : "—"}
								detail={
									hasPeriodNps
										? `${data.npsSummary.responseCount} responses · ${data.period.label.toLowerCase()}`
										: `No dated NPS responses in ${data.period.label.toLowerCase()}`
								}
								icon={Star}
								tone={data.npsSummary.score < 0 ? "warn" : "good"}
							/>
							<PulseMetric
								label="Detractors"
								value={
									hasPeriodNps ? String(data.npsSummary.detractorCount) : "—"
								}
								detail={
									hasPeriodNps
										? "customers scoring 0–6"
										: "Requires a dated NPS response"
								}
								icon={Frown}
								tone={data.npsSummary.detractorCount > 0 ? "warn" : "good"}
							/>
							<PulseMetric
								label="Written feedback"
								value={
									hasPeriodNps ? String(data.npsSummary.commentCount) : "—"
								}
								detail={
									hasPeriodNps
										? "comments to learn from"
										: "No dated feedback in this period"
								}
								icon={MessageSquareText}
							/>
						</div>
					</WallboardSection>

					<WallboardSection title="Customer voice" className="min-h-0">
						<VoiceCard
							comment={voice}
							responseCount={data.npsSummary.responseCount}
						/>
					</WallboardSection>

					<WallboardSection title="Product lens" className="min-h-0 flex-1">
						<div className="divide-y divide-border/40 rounded-2xl border border-border/50 bg-bg-surface/65 px-5">
							{data.productHealth.length > 0 ? (
								data.productHealth
									.slice(0, 4)
									.map((row) => (
										<ProductRow
											key={row.productName}
											row={row}
											nps={data.npsByProduct[row.productName]?.summary}
										/>
									))
							) : (
								<div className="py-6 text-center text-sm text-muted-foreground">
									Product evidence appears after the first Intercom sync.
								</div>
							)}
						</div>
					</WallboardSection>
				</div>
			</div>
		</WallboardShell>
	);
}

function PulseHero({
	label,
	data,
}: {
	label: string;
	data: TrendsWallboardData;
}) {
	return (
		<section className="relative overflow-hidden rounded-3xl border border-accent-soft-border/60 bg-gradient-to-br from-accent-soft/75 via-bg-surface to-bg-surface px-7 py-6">
			<div className="absolute -right-8 -top-16 h-48 w-48 rounded-full bg-accent-primary/15 blur-3xl" />
			<div className="relative flex items-center justify-between gap-8">
				<div>
					<div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
						<Radar className="h-4 w-4 text-accent-primary" />
						Across products
					</div>
					<h2 className="mt-2 text-[2.45rem] font-semibold leading-tight tracking-[-0.04em]">
						{label}
					</h2>
					<p className="mt-2 max-w-3xl text-lg text-text-secondary">
						Heartbeat connects individual conversations into evidence that
						support, development, and leadership can act on together.
					</p>
				</div>
				<AgentPerformanceCard data={data} />
			</div>
		</section>
	);
}

function AgentPerformanceCard({ data }: { data: TrendsWallboardData }) {
	const rows = [
		{ ...data.agentPerformance.fin, icon: Bot },
		{ ...data.agentPerformance.teammates, icon: Users },
	];
	return (
		<div className="w-[19rem] shrink-0 rounded-2xl border border-border/50 bg-background/55 px-5 py-4">
			<div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
				Fin vs teammates · {data.period.label}
			</div>
			<div className="mt-3 divide-y divide-border/40">
				{rows.map((row) => {
					const Icon = row.icon;
					return (
						<div
							key={row.label}
							className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0"
						>
							<div className="flex items-center gap-2 text-sm font-medium">
								<Icon className="h-4 w-4 text-accent-primary" />
								{row.label}
							</div>
							<div className="text-right">
								<div className="text-lg font-semibold tabular-nums">
									{row.happinessPercent === null
										? "—"
										: `${row.happinessPercent}%`}
								</div>
								<div className="text-[0.68rem] text-muted-foreground">
									{row.resolvedCount} resolved · {row.ratedCount} rated
								</div>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function PulseMetric({
	label,
	value,
	detail,
	icon: Icon,
	tone = "default",
}: {
	label: string;
	value: string;
	detail: string;
	icon: typeof Heart;
	tone?: "default" | "warn" | "good";
}) {
	return (
		<div className="rounded-2xl border border-border/50 bg-bg-surface/65 p-4">
			<div className="flex items-center justify-between text-muted-foreground">
				<span className="text-xs font-semibold uppercase tracking-[0.08em]">
					{label}
				</span>
				<Icon className="h-4 w-4" />
			</div>
			<div
				className={cn(
					"mt-3 text-4xl font-semibold tabular-nums tracking-tight",
					tone === "warn" && "text-warning",
					tone === "good" && "text-success",
				)}
			>
				{value}
			</div>
			<div className="mt-1 text-xs text-muted-foreground">{detail}</div>
		</div>
	);
}

function ThemeCard({ theme }: { theme: NpsTheme }) {
	return (
		<article
			className={cn(
				"rounded-2xl border px-6 py-5",
				theme.sentiment === "negative"
					? "border-danger/30 bg-danger-soft/45"
					: theme.sentiment === "mixed"
						? "border-warning/30 bg-warning-soft/35"
						: "border-success/25 bg-success-soft/35",
			)}
		>
			<div className="flex items-start justify-between gap-6">
				<div>
					<div className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
						Customer feedback theme
					</div>
					<h3 className="mt-2 text-2xl font-semibold tracking-tight">
						{theme.headline}
					</h3>
					<p className="mt-2 text-base leading-relaxed text-text-secondary">
						{theme.summary}
					</p>
				</div>
				<div className="shrink-0 text-center">
					<div className="text-3xl font-semibold tabular-nums">
						{theme.mentionCount}
					</div>
					<div className="text-xs text-muted-foreground">mentions</div>
				</div>
			</div>
			{theme.quote ? (
				theme.sourceName ? (
					<div className="mt-4 border-l-2 border-accent-primary/60 pl-4">
						<blockquote className="text-sm italic text-foreground/85">
							“{theme.quote}”
						</blockquote>
						<CustomerReference name={theme.sourceName} />
					</div>
				) : null
			) : null}
		</article>
	);
}

function VoiceCard({
	comment,
	responseCount,
}: {
	comment: NpsComment | null;
	responseCount: number;
}) {
	if (!comment)
		return (
			<div className="rounded-2xl border border-border/50 bg-bg-surface/65 px-5 py-6 text-center text-muted-foreground">
				<MessageSquareQuote className="mx-auto h-7 w-7" />
				<p className="mt-3">No written customer feedback in this period yet.</p>
			</div>
		);
	return (
		<div className="rounded-2xl border border-border/50 bg-bg-surface/65 px-5 py-5">
			<MessageSquareQuote className="h-5 w-5 text-accent-primary" />
			<blockquote className="mt-3 line-clamp-4 text-lg font-medium leading-relaxed tracking-tight text-foreground">
				“{comment.englishComment ?? comment.comment}”
			</blockquote>
			<div className="mt-3 text-xs text-muted-foreground">
				One of {responseCount} NPS response
				{responseCount === 1 ? "" : "s"} · {comment.bucket}
			</div>
			{comment.name ? <CustomerReference name={comment.name} /> : null}
		</div>
	);
}

function CustomerReference({ name }: { name: string }) {
	return (
		<div className="mt-2 text-sm font-medium text-muted-foreground">{name}</div>
	);
}

function ProductRow({
	row,
	nps,
}: {
	row: ProductHealthRow;
	nps?: NpsPeriodSummary;
}) {
	const happiness = row.satisfactionScorePercent;
	const hasCx = happiness !== null;
	const displayValue = hasCx
		? `${happiness}%`
		: nps && nps.responseCount > 0
			? formatNps(nps.score)
			: String(row.resolvedCount);
	return (
		<div className="flex items-center justify-between gap-4 py-3.5">
			<div className="min-w-0">
				<div className="truncate text-sm font-semibold">{row.productName}</div>
				<div className="mt-0.5 text-xs text-muted-foreground">
					{row.resolvedCount} resolved · {row.ratedCount} CX ratings
				</div>
			</div>
			<div className="text-right">
				<div
					className={cn(
						"text-xl font-semibold tabular-nums",
						happiness !== null &&
							happiness < row.targets.satisfactionTargetPercent
							? "text-warning"
							: "text-foreground",
					)}
				>
					{displayValue}
				</div>
				<div className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
					{hasCx
						? "CX happiness"
						: nps && nps.responseCount > 0
							? `NPS · ${nps.responseCount}`
							: "resolved cases"}
				</div>
			</div>
		</div>
	);
}

function selectHappiness(data: TrendsWallboardData) {
	if (data.periodSummary.ratedCount > 0) {
		return {
			label: data.period.label,
			ratedCount: data.periodSummary.ratedCount,
			satisfactionScorePercent: data.periodSummary.satisfactionScorePercent,
		};
	}
	return null;
}

const pulsePeriodOptions: Array<{
	value: WallboardPulsePeriod;
	label: string;
}> = [
	{ value: "current-week", label: "Current week" },
	{ value: "previous-week", label: "Past week" },
	{ value: "rolling-30-days", label: "30 days" },
	{ value: "rolling-90-days", label: "90 days" },
	{ value: "rolling-180-days", label: "180 days" },
];

function toPickerPeriod(
	period: TrendsWallboardData["period"]["preset"],
): WallboardPulsePeriod {
	return pulsePeriodOptions.some((option) => option.value === period)
		? (period as WallboardPulsePeriod)
		: "current-week";
}

function PulsePeriodPicker({ period }: { period: WallboardPulsePeriod }) {
	const router = useRouter();
	const savePeriod = useServerFn(saveWallboardPulsePeriod);
	const selectId = useId();
	const [selectedPeriod, setSelectedPeriod] = useState(period);
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => setSelectedPeriod(period), [period]);

	async function handleChange(nextPeriod: WallboardPulsePeriod) {
		const previousPeriod = selectedPeriod;
		setSelectedPeriod(nextPeriod);
		setIsSaving(true);
		try {
			await Promise.all([
				savePeriod({ data: { pulsePeriod: nextPeriod } }),
				router.navigate({
					to: "/wallboard/pulse",
					search: { period: nextPeriod },
				}),
			]);
		} catch (error) {
			console.error("Unable to update the Pulse period", error);
			setSelectedPeriod(previousPeriod);
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<div className="ml-1 flex h-9 items-center gap-1.5 border-l border-border/50 pl-2">
			<label htmlFor={selectId} className="sr-only">
				Pulse period
			</label>
			<select
				id={selectId}
				aria-label="Pulse period"
				value={selectedPeriod}
				disabled={isSaving}
				onChange={(event) =>
					void handleChange(event.target.value as WallboardPulsePeriod)
				}
				className="h-8 rounded-lg border border-border/50 bg-background px-2 text-xs font-medium text-foreground outline-none transition-colors focus:border-accent-primary disabled:opacity-60"
			>
				{pulsePeriodOptions.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
		</div>
	);
}

function selectPriorityThemes(themes: NpsTheme[]) {
	const priority = { negative: 0, mixed: 1, positive: 2 } as const;
	return [...themes]
		.sort(
			(a, b) =>
				priority[a.sentiment] - priority[b.sentiment] ||
				b.mentionCount - a.mentionCount,
		)
		.slice(0, 2);
}

function formatNps(score: number) {
	return score > 0 ? `+${score}` : String(score);
}

function formatPeriodContext(label: string) {
	if (label === "Year") return "year to date";
	if (label === "Quarter") return "quarter to date";
	if (label === "Month") return "month to date";
	return label.toLowerCase();
}

function selectVoice(comments: NpsComment[]) {
	return (
		comments.find((comment) => comment.bucket === "detractor") ??
		comments.find((comment) => comment.bucket === "promoter") ??
		comments[0] ??
		null
	);
}

function EmptyThemes() {
	return (
		<div className="flex h-full min-h-[280px] items-center justify-center rounded-3xl border border-border/50 bg-bg-surface/45 px-8 text-center">
			<div>
				<Radar className="mx-auto h-10 w-10 text-muted-foreground" />
				<h3 className="mt-4 text-2xl font-semibold">
					No recurring need has enough evidence yet
				</h3>
				<p className="mx-auto mt-2 max-w-xl text-muted-foreground">
					Heartbeat will surface a theme once multiple customer conversations
					point to the same need.
				</p>
			</div>
		</div>
	);
}
