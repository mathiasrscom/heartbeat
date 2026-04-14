import type { NpsTheme } from "@/lib/support-health/types";
import { cn } from "@/lib/utils";

const wbCell =
	"rounded-lg border border-border/30 bg-white dark:border-transparent dark:bg-muted/50";

export function NpsThemeCard({ theme }: { theme: NpsTheme }) {
	return (
		<div className={cn(wbCell, "px-4 py-3")}>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<h3 className="truncate text-base font-semibold text-foreground">
							{theme.headline}
						</h3>
						<SentimentChip sentiment={theme.sentiment} />
					</div>
					<p className="mt-1 text-sm leading-relaxed text-foreground">
						{theme.summary}
					</p>
					{theme.quote ? (
						<p className="mt-2 border-l-2 border-border/60 pl-3 text-xs italic text-muted-foreground">
							&ldquo;{theme.quote}&rdquo;
						</p>
					) : null}
				</div>
				{theme.mentionCount > 0 ? (
					<div className="shrink-0 text-right">
						<div className="text-xs uppercase tracking-wide text-muted-foreground">
							Mentions
						</div>
						<div className="text-xl font-semibold tabular-nums text-foreground">
							{theme.mentionCount}
						</div>
					</div>
				) : null}
			</div>
		</div>
	);
}

function SentimentChip({ sentiment }: { sentiment: NpsTheme["sentiment"] }) {
	const style =
		sentiment === "positive"
			? "border-emerald-300/40 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-300"
			: sentiment === "negative"
				? "border-red-300/40 bg-red-50 text-red-700 dark:border-red-400/30 dark:bg-red-500/10 dark:text-red-300"
				: "border-border/60 bg-muted text-muted-foreground";
	const label =
		sentiment === "positive"
			? "Positive"
			: sentiment === "negative"
				? "Negative"
				: "Mixed";
	return (
		<span
			className={cn(
				"shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
				style,
			)}
		>
			{label}
		</span>
	);
}
