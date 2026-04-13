import { format, formatDistanceToNowStrict } from "date-fns";
import { panelSurfaceClassName } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface WallboardShellProps {
	title: string;
	refreshedAt: string | null;
	stale: boolean;
	toolbar?: React.ReactNode;
	showcase?: React.ReactNode;
	tickerItems?: string[];
	theme?: "light" | "dark";
	children: React.ReactNode;
}

export function WallboardShell({
	title,
	refreshedAt,
	stale,
	toolbar,
	showcase,
	tickerItems,
	theme = "dark",
	children,
}: WallboardShellProps) {
	const refreshedDate = refreshedAt ? new Date(refreshedAt) : null;

	return (
		<div
			className={cn(
				"h-[100dvh] overflow-hidden bg-bg-app text-foreground dark:bg-background",
				theme !== "light" && "dark",
			)}
		>
			<div className="flex h-full w-full flex-col px-6 py-5 xl:px-8">
				<header className="border-b border-border/40 pb-3">
					<div className="flex items-center justify-between">
						<div className="flex items-baseline gap-4">
							<h1 className="text-[2rem] font-semibold tracking-tight text-foreground">
								{title}
							</h1>
							{showcase ? (
								<>
									<span className="text-border-strong/60 text-xl font-light">/</span>
									{showcase}
								</>
							) : null}
						</div>
						<div className="flex items-center gap-5 text-right">
							<div>
								<div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
									Now
								</div>
								<div className="whitespace-nowrap text-base font-medium text-foreground">
									{format(new Date(), "EEE d MMM • HH:mm")}
								</div>
							</div>
							<div>
								<div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
									Data
								</div>
								<div
									className={cn(
										"whitespace-nowrap text-base font-medium",
										stale ? "text-amber-600 dark:text-amber-300" : "text-foreground",
									)}
								>
									{refreshedDate
										? `${formatDistanceToNowStrict(refreshedDate)} ago`
										: "No sync yet"}
								</div>
							</div>
						</div>
					</div>
					{toolbar ? <div className="mt-2">{toolbar}</div> : null}
				</header>
				<main className="min-h-0 flex-1 overflow-hidden pt-5">{children}</main>
				<TickerTape items={tickerItems ?? []} />
			</div>
		</div>
	);
}

interface WallboardSectionProps {
	title: string;
	className?: string;
	children: React.ReactNode;
}

export function WallboardSection({
	title,
	className,
	children,
}: WallboardSectionProps) {
	return (
		<section className={cn("flex min-h-0 flex-col", className)}>
			<div className="shrink-0 pb-2">
				<h2 className="text-sm font-medium uppercase tracking-[0.08em] text-muted-foreground">
					{title}
				</h2>
			</div>
			<div className="@container min-h-0 flex-1">{children}</div>
		</section>
	);
}

function TickerTape({ items }: { items: string[] }) {
	const normalized = items
		.map((item) => item.trim())
		.filter((item) => item.length > 0);

	if (normalized.length === 0) return null;

	const repeated = [...normalized, ...normalized];

	return (
		<footer className={cn(panelSurfaceClassName, "mt-4")}>
			<div className="flex items-center gap-3 px-3 py-2">
				<div className="shrink-0 rounded-full border border-border/60 bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
					Ticker
				</div>
				<div className="wallboard-ticker-mask">
					<div className="wallboard-ticker-track">
						{repeated.map((item, index) => (
							<span
								key={`${index}-${item}`}
								className="inline-flex items-center gap-3 pr-8 text-sm text-foreground"
							>
								<span className="text-muted-foreground">•</span>
								{item}
							</span>
						))}
					</div>
				</div>
			</div>
		</footer>
	);
}
