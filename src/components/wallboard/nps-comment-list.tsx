import type { NpsComment } from "@/lib/support-health/types";
import { getEnglishNpsCommentToDisplay } from "@/lib/wallboard-nps-comment-utils";
import { cn } from "@/lib/utils";

const wbCell =
	"rounded-lg border border-border/30 bg-white dark:border-transparent dark:bg-muted/50";

/**
 * Renders raw NPS comments with the rater's score, colour-coded by bucket.
 * Used on the trends wallboard in place of AI-built theme cards so the
 * screen shows actual verbatim feedback.
 */
export function NpsCommentList({
	comments,
	className,
}: {
	comments: NpsComment[];
	className?: string;
}) {
	if (comments.length === 0) return null;

	return (
		<div className={cn("flex flex-col gap-3", className)}>
			{comments.map((entry, index) => (
				<NpsCommentRow
					key={`${entry.ratedAt ?? "unknown"}-${index}`}
					entry={entry}
				/>
			))}
		</div>
	);
}

function NpsCommentRow({ entry }: { entry: NpsComment }) {
	const tone =
		entry.bucket === "promoter"
			? "text-emerald-600 dark:text-emerald-300"
			: entry.bucket === "detractor"
				? "text-red-600 dark:text-red-300"
				: "text-amber-600 dark:text-amber-300";

	const bucketLabel =
		entry.bucket === "promoter"
			? "Promoter"
			: entry.bucket === "detractor"
				? "Detractor"
				: "Passive";
	const englishComment = getEnglishNpsCommentToDisplay(
		entry.comment,
		entry.englishComment,
	);

	return (
		<div className={cn(wbCell, "flex gap-3 px-4 py-3")}>
			<div className="flex w-14 shrink-0 flex-col items-center">
				<span
					className={cn(
						"text-2xl font-semibold tabular-nums leading-none",
						tone,
					)}
				>
					{entry.score}
				</span>
				<span className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
					/ 10
				</span>
				<span
					className={cn(
						"mt-2 rounded-full border border-current/30 px-1.5 py-[1px] text-[9px] font-medium uppercase tracking-wide",
						tone,
					)}
				>
					{bucketLabel}
				</span>
			</div>
			<div className="min-w-0 flex-1">
				{entry.name ? (
					<div className="truncate text-xs font-medium text-muted-foreground">
						{entry.name}
					</div>
				) : null}
				<p className="mt-0.5 text-sm leading-snug text-foreground">
					<span className="text-muted-foreground">“</span>
					{entry.comment}
					<span className="text-muted-foreground">”</span>
				</p>
				{englishComment ? (
					<div className="mt-2 border-t border-border/40 pt-2">
						<div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
							English
						</div>
						<p className="mt-1 text-sm leading-snug text-foreground">
							{englishComment}
						</p>
					</div>
				) : null}
			</div>
		</div>
	);
}
