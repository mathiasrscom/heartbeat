import { format, formatDistanceToNowStrict } from "date-fns";
import {
	createContext,
	type RefObject,
	useEffect,
	useRef,
	useState,
} from "react";
import { panelSurfaceClassName } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Page indicator mount (from PaginatedContent).
 * WallboardSection renders a small header slot; PaginatedContent portals into it.
 */
export const SectionPageIndicatorMountContext =
	createContext<RefObject<HTMLDivElement | null> | null>(null);

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
	const pageIndicatorMountRef = useRef<HTMLDivElement>(null);

	return (
		<section className={cn("flex min-h-0 flex-col", className)}>
			<div className="flex shrink-0 items-center justify-between gap-3 pb-2">
				<h2 className="text-sm font-medium uppercase tracking-[0.08em] text-muted-foreground">
					{title}
				</h2>
				<div ref={pageIndicatorMountRef} className="empty:hidden" />
			</div>
			<SectionPageIndicatorMountContext.Provider value={pageIndicatorMountRef}>
				<div className="@container min-h-0 flex-1">{children}</div>
			</SectionPageIndicatorMountContext.Provider>
		</section>
	);
}

// Target ticker scroll speed in pixels per second. Kept constant across all
// wallboards so when two TV monitors run side-by-side (e.g. live + trends) the
// ticker text visually moves at the exact same rate even though the content
// length differs.
const TICKER_SPEED_PX_PER_SEC = 80;

function TickerTape({ items }: { items: string[] }) {
	const normalized = items
		.map((item) => item.trim())
		.filter((item) => item.length > 0);

	const trackRef = useRef<HTMLDivElement | null>(null);
	const [durationSec, setDurationSec] = useState(42);

	// Measure one copy of the content and derive the duration so that the
	// -50% translation completes in (halfWidth / speed) seconds.
	useEffect(() => {
		const track = trackRef.current;
		if (!track) return;
		const recompute = () => {
			// The track contains two copies of the content; a -50% translate
			// moves exactly one copy's width. scrollWidth / 2 is that width.
			const halfWidth = track.scrollWidth / 2;
			if (halfWidth <= 0) return;
			const nextDuration = Math.max(
				10,
				Math.round(halfWidth / TICKER_SPEED_PX_PER_SEC),
			);
			setDurationSec((prev) => (prev === nextDuration ? prev : nextDuration));
		};
		recompute();
		const ro = new ResizeObserver(recompute);
		ro.observe(track);
		return () => ro.disconnect();
	}, [normalized.join("|")]);

	if (normalized.length === 0) return null;

	const repeated = [...normalized, ...normalized];

	return (
		<footer className={cn(panelSurfaceClassName, "mt-4")}>
			<div className="flex items-center px-3 py-2">
				<div className="wallboard-ticker-mask">
					<div
						ref={trackRef}
						className="wallboard-ticker-track"
						style={{ animationDuration: `${durationSec}s` }}
					>
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
