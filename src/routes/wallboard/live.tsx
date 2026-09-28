import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import {
	Activity,
	AlertTriangle,
	Clock3,
	Inbox,
	ShieldCheck,
	Sparkles,
	UserPlus,
	Users,
} from "lucide-react";
import { useEffect } from "react";
import { useSettingsDialog } from "@/components/settings-dialog-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AttentionCard } from "@/components/wallboard/attention-card";
import {
	WallboardSection,
	WallboardShell,
} from "@/components/wallboard/wallboard-shell";
import type {
	LiveWallboardData,
	LiveWallboardTeammate,
	QueueHealth,
} from "@/lib/support-health/types";
import { cn } from "@/lib/utils";

const WALLBOARD_REFRESH_INTERVAL_MS = 30_000;

export const Route = createFileRoute("/wallboard/live")({
	beforeLoad: () => {
		throw redirect({ to: "/wallboard/attention" });
	},
});

export function AttentionWallboard({ live }: { live: LiveWallboardData }) {
	const router = useRouter();
	const attention = live.attention;
	const visibleSignals = attention.customerSignals.slice(0, 6);
	const tickerItems = [
		...attention.customerSignals.map((signal) => signal.headline),
		...attention.productSignals.map((signal) => signal.headline),
	];

	useEffect(() => {
		const timer = window.setInterval(
			() => void router.invalidate(),
			WALLBOARD_REFRESH_INTERVAL_MS,
		);
		return () => window.clearInterval(timer);
	}, [router]);

	return (
		<WallboardShell
			title="Attention now"
			refreshedAt={live.snapshot.freshnessTimestamp ?? live.refreshedAt}
			stale={live.snapshot.stale}
			tickerItems={tickerItems}
			theme={live.wallboardTheme}
			seasonalTheme={live.wallboardSeasonalTheme}
			seasonalAnimations={live.wallboardSeasonalAnimations}
			showcase={
				<span className="text-lg font-medium text-muted-foreground">
					Shared customer priorities
				</span>
			}
		>
			<div className="wallboard-live-container @container/live h-full min-h-0 overflow-y-auto @min-[1000px]/live:overflow-hidden">
				<div className="grid min-h-full grid-cols-1 gap-7 @min-[1000px]/live:h-full @min-[1000px]/live:min-h-0 @min-[1000px]/live:grid-cols-[minmax(0,1.58fr)_minmax(360px,0.82fr)]">
					<div className="flex min-h-0 flex-col gap-5">
						<StatusHero data={live} />
						<WallboardSection title="Act now" className="min-h-0 flex-1">
							{visibleSignals.length > 0 ? (
								<div className="attention-card-grid grid min-h-0 auto-rows-max gap-3">
									{visibleSignals.map((signal) => (
										<AttentionCard
											key={signal.id}
											signal={signal}
											appUrl={live.intercomAppUrl}
											compact
										/>
									))}
								</div>
							) : (
								<CalmState waitingElsewhere={attention.waitingElsewhere} />
							)}
						</WallboardSection>
					</div>

					<div className="flex min-h-0 flex-col gap-6">
						<WallboardSection title="Shared picture">
							<div className="grid grid-cols-1 gap-3 @min-[360px]:grid-cols-2">
								<Metric
									label="Support actions"
									value={attention.supportActionCount}
									icon={AlertTriangle}
									tone={attention.supportActionCount > 0 ? "danger" : "good"}
								/>
								<Metric
									label="Waiting on us"
									value={live.snapshot.currentAwaitingTeamCount}
									icon={Inbox}
								/>
								<Metric
									label="Over SLA"
									value={live.snapshot.currentBreachedCount}
									icon={Clock3}
									tone={
										live.snapshot.currentBreachedCount > 0 ? "danger" : "good"
									}
								/>
								<Metric
									label="Unassigned"
									value={live.snapshot.currentUnassignedCount}
									icon={Activity}
									tone={
										live.snapshot.currentUnassignedCount > 0 ? "warn" : "good"
									}
								/>
							</div>
						</WallboardSection>

						<WallboardSection title="Team load">
							<TeammateLoad teammates={live.trackedTeammates} />
						</WallboardSection>

						<WallboardSection
							title="Pressure by product"
							className="min-h-0 flex-1"
						>
							<div className="divide-y divide-border/40 rounded-2xl border border-border/50 bg-bg-surface/65 px-5">
								{live.mappedQueues.length > 0 ? (
									live.mappedQueues
										.slice(0, 4)
										.map((queue) => (
											<QueueRow key={queue.teamName} queue={queue} />
										))
								) : (
									<div className="py-8 text-center text-muted-foreground">
										No mapped product queues yet.
									</div>
								)}
							</div>
						</WallboardSection>
					</div>
				</div>
			</div>
		</WallboardShell>
	);
}

function TeammateLoad({ teammates }: { teammates: LiveWallboardTeammate[] }) {
	const { openSettings } = useSettingsDialog();
	const visibleTeammates = teammates.slice(0, 4);

	if (teammates.length === 0) {
		return (
			<div className="flex min-h-24 items-center justify-between gap-4 rounded-2xl border border-dashed border-border bg-bg-surface/45 px-5 py-4">
				<div>
					<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
						<Users className="h-4 w-4" />
						No teammates tracked
					</div>
					<p className="mt-1 text-sm text-muted-foreground">
						Choose the teammates whose open work should stay visible here.
					</p>
				</div>
				<button
					type="button"
					onClick={openSettings}
					className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-foreground px-3 py-2 text-sm font-medium text-background"
				>
					<UserPlus className="h-4 w-4" />
					Choose
				</button>
			</div>
		);
	}

	return (
		<div className="grid grid-cols-1 gap-2 @min-[400px]:grid-cols-2">
			{visibleTeammates.map((teammate) => (
				<div
					key={teammate.externalId}
					className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-bg-surface/65 px-4 py-3"
				>
					<div className="flex min-w-0 items-center gap-3">
						<Avatar className="h-10 w-10 shrink-0 border border-white/20 bg-white">
							<AvatarImage
								src={teammate.avatarUrl ?? undefined}
								alt=""
								className={cn(
									"object-cover",
									teammate.name.trim().toLowerCase() === "fin" && "p-1.5",
								)}
							/>
							<AvatarFallback className="bg-accent-soft text-sm font-semibold text-foreground">
								{getTeammateInitials(teammate.name)}
							</AvatarFallback>
						</Avatar>
						<div className="min-w-0">
							<div className="truncate text-sm font-semibold text-foreground">
								{teammate.name}
							</div>
							<div className="mt-0.5 text-xs text-muted-foreground">
								Active cases
							</div>
						</div>
					</div>
					<div className="text-3xl font-semibold tabular-nums text-foreground">
						{teammate.activeCaseCount}
					</div>
				</div>
			))}
			{teammates.length > visibleTeammates.length ? (
				<div className="text-right text-xs text-muted-foreground @min-[400px]:col-span-2">
					+{teammates.length - visibleTeammates.length} more tracked
				</div>
			) : null}
		</div>
	);
}

function getTeammateInitials(name: string) {
	return (
		name
			.trim()
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase())
			.join("") || "?"
	);
}

function StatusHero({ data }: { data: LiveWallboardData }) {
	const { attention } = data;
	return (
		<section
			className={cn(
				"@container relative overflow-hidden rounded-3xl border px-7 py-6",
				attention.status === "needs-attention"
					? "border-danger/35 bg-danger-soft/55"
					: attention.status === "watch"
						? "border-warning/30 bg-warning-soft/45"
						: "border-success/25 bg-success-soft/45",
			)}
		>
			<div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-accent-primary/8 blur-3xl" />
			<div className="relative flex flex-col items-stretch gap-5 @min-[640px]:flex-row @min-[640px]:items-center @min-[640px]:justify-between @min-[640px]:gap-8">
				<div>
					<div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
						<span
							className={cn(
								"h-2.5 w-2.5 rounded-full",
								attention.status === "needs-attention"
									? "bg-danger shadow-[0_0_18px_var(--danger)]"
									: attention.status === "watch"
										? "bg-warning"
										: "bg-success",
							)}
						/>
						Customer state
					</div>
					<h2 className="mt-2 text-[2.6rem] font-semibold leading-none tracking-[-0.04em] text-foreground">
						{attention.statusLabel}
					</h2>
					<p className="mt-3 max-w-3xl text-lg leading-relaxed text-text-secondary">
						{attention.summary}
					</p>
				</div>
				<div className="shrink-0 rounded-2xl border border-border/40 bg-background/55 p-4 text-center @min-[640px]:min-w-32">
					<Sparkles className="mx-auto h-5 w-5 text-accent-primary" />
					<div className="mt-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
						Actions found
					</div>
					<div className="mt-1 text-3xl font-semibold tabular-nums">
						{attention.supportActionCount}
					</div>
				</div>
			</div>
		</section>
	);
}

function CalmState({
	waitingElsewhere,
}: {
	waitingElsewhere: LiveWallboardData["attention"]["waitingElsewhere"];
}) {
	const waitingParts = [
		waitingElsewhere.customerCount > 0
			? `${waitingElsewhere.customerCount} with customers`
			: null,
		waitingElsewhere.developmentCount > 0
			? `${waitingElsewhere.developmentCount} with development`
			: null,
		waitingElsewhere.otherCount > 0
			? `${waitingElsewhere.otherCount} with others`
			: null,
	].filter(Boolean);

	return (
		<div className="flex h-full min-h-[260px] items-center justify-center rounded-3xl border border-success/25 bg-success-soft/35 px-8 text-center">
			<div>
				<ShieldCheck className="mx-auto h-12 w-12 text-success" />
				<h3 className="mt-4 text-2xl font-semibold">
					No support action right now
				</h3>
				<p className="mx-auto mt-2 max-w-xl text-base text-muted-foreground">
					{waitingElsewhere.totalCount > 0
						? `${waitingElsewhere.totalCount} open case${waitingElsewhere.totalCount === 1 ? " is" : "s are"} waiting elsewhere: ${waitingParts.join(" · ")}.`
						: "The current Intercom queue has no customer case that Support can move forward."}
				</p>
			</div>
		</div>
	);
}

function Metric({
	label,
	value,
	icon: Icon,
	tone = "default",
}: {
	label: string;
	value: number;
	icon: typeof Activity;
	tone?: "default" | "danger" | "warn" | "good";
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
					tone === "danger" && "text-danger",
					tone === "warn" && "text-warning",
					tone === "good" && "text-success",
				)}
			>
				{value}
			</div>
		</div>
	);
}

function QueueRow({ queue }: { queue: QueueHealth }) {
	const pressure =
		queue.breachedCount * 3 + queue.dueSoonCount * 2 + queue.awaitingTeamCount;
	return (
		<div className="py-4">
			<div className="flex items-center justify-between gap-4">
				<div className="min-w-0">
					<div className="truncate text-base font-semibold text-foreground">
						{queue.teamName}
					</div>
					<div className="mt-1 text-sm text-muted-foreground">
						{queue.activeCaseCount} tracked open · {queue.awaitingTeamCount}{" "}
						need Support · {queue.unassignedCount} unassigned
					</div>
				</div>
				<div className="flex shrink-0 items-baseline gap-1">
					<span
						className={cn(
							"text-3xl font-semibold tabular-nums",
							queue.breachedCount > 0
								? "text-danger"
								: queue.dueSoonCount > 0
									? "text-warning"
									: "text-foreground",
						)}
					>
						{queue.breachedCount}
					</span>
					<span className="text-xs text-muted-foreground">over SLA</span>
				</div>
			</div>
			<div className="mt-3 h-1.5 overflow-hidden rounded-full bg-background">
				<div
					className={cn(
						"h-full rounded-full",
						queue.breachedCount > 0
							? "bg-danger"
							: queue.dueSoonCount > 0
								? "bg-warning"
								: "bg-success",
					)}
					style={{ width: `${Math.min(100, Math.max(8, pressure * 4))}%` }}
				/>
			</div>
		</div>
	);
}
