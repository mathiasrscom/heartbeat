import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
	ArrowDownRight,
	ArrowUpRight,
	Heart,
	MessageSquareQuote,
	MessagesSquare,
	Radar,
	Repeat2,
	Users,
} from "lucide-react";
import { useEffect } from "react";
import { AttentionCard } from "@/components/wallboard/attention-card";
import {
	WallboardSection,
	WallboardShell,
} from "@/components/wallboard/wallboard-shell";
import { getTrendsWallboard } from "@/lib/support-health/server";
import type {
	NpsComment,
	NpsTheme,
	ProductHealthRow,
	TrendsWallboardData,
} from "@/lib/support-health/types";
import { cn } from "@/lib/utils";

const WALLBOARD_REFRESH_INTERVAL_MS = 60_000;

export const Route = createFileRoute("/wallboard/trends")({
	ssr: false,
	head: () => ({ meta: [{ title: "Heartbeat - Customer pulse" }] }),
	loader: async () => getTrendsWallboard(),
	component: CustomerPulsePage,
});

function CustomerPulsePage() {
	const data = Route.useLoaderData() as TrendsWallboardData;
	const router = useRouter();
	const attention = data.attention;
	const productSignals = attention.productSignals.slice(0, 2);
	const voice = selectVoice(data.npsComments);
	const satisfaction = data.periodSummary.satisfactionScorePercent;
	const pulseLabel =
		attention.status === "needs-attention" ||
		(satisfaction !== null &&
			satisfaction < data.selectedTargets.satisfactionTargetPercent)
			? "Customer confidence needs attention"
			: attention.status === "watch"
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
			tickerItems={[
				...productSignals.map((signal) => signal.headline),
				...data.npsThemes.slice(0, 3).map((theme) => theme.headline),
			]}
			theme={data.wallboardTheme}
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
						{productSignals.length > 0 ? (
							<div
								className="grid h-full gap-4"
								style={{
									gridTemplateRows: `repeat(${productSignals.length}, minmax(0, 1fr))`,
								}}
							>
								{productSignals.map((signal) => (
									<AttentionCard
										key={signal.id}
										signal={signal}
										appUrl={data.intercomAppUrl}
									/>
								))}
							</div>
						) : data.npsThemes.length > 0 ? (
							<div
								className="grid h-full gap-4"
								style={{
									gridTemplateRows: `repeat(${Math.min(2, data.npsThemes.length)}, minmax(0, 1fr))`,
								}}
							>
								{data.npsThemes.slice(0, 2).map((theme) => (
									<ThemeCard key={theme.headline} theme={theme} />
								))}
							</div>
						) : (
							<EmptyThemes />
						)}
					</WallboardSection>
				</div>

				<div className="flex min-h-0 flex-col gap-6">
					<WallboardSection title={`Pulse · ${data.period.label}`}>
						<div className="grid grid-cols-2 gap-3">
							<PulseMetric
								label="Customer happiness"
								value={satisfaction === null ? "—" : `${satisfaction}%`}
								detail={
									data.periodSummary.ratedCount > 0
										? `${data.periodSummary.ratedCount} rated`
										: "No ratings yet"
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
								label="Conversations"
								value={String(data.periodSummary.eligibleCount)}
								detail={`${data.periodSummary.responseRatePercent}% rated`}
								icon={MessagesSquare}
							/>
							<PulseMetric
								label="At risk now"
								value={String(attention.atRiskCustomerCount)}
								detail="customer signals"
								icon={Users}
								tone={attention.atRiskCustomerCount > 0 ? "warn" : "good"}
							/>
							<PulseMetric
								label="Recurring needs"
								value={String(attention.recurringThemeCount)}
								detail="evidence clusters"
								icon={Repeat2}
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
									.map((row) => <ProductRow key={row.productName} row={row} />)
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
	const delta =
		data.periodSummary.cxScore === null
			? null
			: data.periodSummary.cxScore -
				(data.periods[1]?.score ?? data.periodSummary.cxScore);
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
				{delta !== null ? (
					<div className="shrink-0 rounded-2xl border border-border/50 bg-background/55 px-5 py-4 text-center">
						<div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
							CX movement
						</div>
						<div
							className={cn(
								"mt-2 flex items-center justify-center gap-1 text-3xl font-semibold",
								delta < 0 ? "text-danger" : "text-success",
							)}
						>
							{delta < 0 ? (
								<ArrowDownRight className="h-6 w-6" />
							) : (
								<ArrowUpRight className="h-6 w-6" />
							)}
							{Math.abs(delta).toFixed(1)}
						</div>
					</div>
				) : null}
			</div>
		</section>
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
				<blockquote className="mt-4 border-l-2 border-accent-primary/60 pl-4 text-sm italic text-foreground/85">
					“{theme.quote}”
				</blockquote>
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
				One of {responseCount} NPS response{responseCount === 1 ? "" : "s"} ·{" "}
				{comment.bucket}
			</div>
		</div>
	);
}

function ProductRow({ row }: { row: ProductHealthRow }) {
	const happiness = row.satisfactionScorePercent;
	return (
		<div className="flex items-center justify-between gap-4 py-3.5">
			<div className="min-w-0">
				<div className="truncate text-sm font-semibold">{row.productName}</div>
				<div className="mt-0.5 text-xs text-muted-foreground">
					{row.awaitingTeamCount} waiting · {row.breachedNowCount} over SLA
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
					{happiness === null ? "—" : `${happiness}%`}
				</div>
				<div className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
					happiness
				</div>
			</div>
		</div>
	);
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
