import { cn } from "@/lib/utils";

type RatingKey = 1 | 2 | 3 | 4 | 5;

const ratingOrder: RatingKey[] = [5, 4, 3, 2, 1];

export function SupportCxSummary({
	label,
	satisfactionScorePercent,
	ratedCount,
	positiveCount,
	responseRatePercent,
	ratingMix,
	variant = "dashboard",
	showScore = true,
}: {
	label: string;
	satisfactionScorePercent: number | null;
	ratedCount: number;
	positiveCount: number;
	responseRatePercent: number;
	ratingMix: Record<RatingKey, number>;
	variant?: "dashboard" | "wallboard";
	showScore?: boolean;
}) {
	const isWallboard = variant === "wallboard";
	const hasRatings = ratedCount > 0;

	return (
		<div className="space-y-4">
			<div className="flex items-end justify-between gap-4">
				<div>
					<div className="text-sm text-muted-foreground">{label}</div>
					{showScore ? (
						<div className="mt-2 text-5xl font-semibold tracking-tight text-foreground">
							{satisfactionScorePercent === null
								? "—"
								: `${satisfactionScorePercent.toFixed(1)}%`}
						</div>
					) : (
						<div className="mt-2 text-sm text-muted-foreground">
							Rated coverage and rating distribution
						</div>
					)}
				</div>
				<div className="text-right text-sm text-muted-foreground">
					<div>Rated</div>
					<div className="mt-1 text-xl font-medium text-foreground">
						{responseRatePercent}%
					</div>
				</div>
			</div>

			<div className="text-sm text-muted-foreground">
				{hasRatings
					? `${positiveCount} positive rating${
							positiveCount === 1 ? "" : "s"
						} (4 or 5) of ${ratedCount} total`
					: `No ratings received in ${label.toLowerCase()}.`}
			</div>

			<div
				className={cn(
					"h-4 overflow-hidden rounded-full",
					isWallboard ? "bg-muted/70" : "bg-muted",
				)}
			>
				<div className="flex h-full w-full">
					{ratingOrder.map((rating) => {
						const count = ratingMix[rating];
						const width = hasRatings ? `${(count / ratedCount) * 100}%` : "0%";

						return (
							<div
								key={rating}
								className={cn(
									"h-full transition-[width]",
									rating === 5 &&
										(isWallboard ? "bg-violet-300" : "bg-violet-300/90"),
									rating === 4 &&
										(isWallboard ? "bg-violet-500" : "bg-violet-500/90"),
									rating === 3 &&
										(isWallboard ? "bg-stone-500" : "bg-stone-500/80"),
									rating === 2 &&
										(isWallboard ? "bg-amber-600" : "bg-amber-600/80"),
									rating === 1 &&
										(isWallboard ? "bg-red-700" : "bg-red-700/85"),
								)}
								style={{ width }}
							/>
						);
					})}
				</div>
			</div>

			<div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
				{ratingOrder.map((rating) => (
					<div
						key={rating}
						className="flex items-center gap-2 text-muted-foreground"
					>
						<span
							className={cn(
								"h-2.5 w-2.5 rounded-sm",
								rating === 5 &&
									(isWallboard ? "bg-violet-300" : "bg-violet-300/90"),
								rating === 4 &&
									(isWallboard ? "bg-violet-500" : "bg-violet-500/90"),
								rating === 3 &&
									(isWallboard ? "bg-stone-500" : "bg-stone-500/80"),
								rating === 2 &&
									(isWallboard ? "bg-amber-600" : "bg-amber-600/80"),
								rating === 1 && (isWallboard ? "bg-red-700" : "bg-red-700/85"),
							)}
						/>
						<span>{rating}</span>
						<span>{ratingMix[rating]}</span>
					</div>
				))}
			</div>
		</div>
	);
}
