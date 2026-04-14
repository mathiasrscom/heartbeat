import { cn } from "@/lib/utils";

const wbCell =
	"rounded-lg border border-border/30 bg-white dark:border-transparent dark:bg-muted/50";

interface NpsDistributionBarProps {
	promoter: number;
	passive: number;
	detractor: number;
	scopeLabel?: string | null;
	className?: string;
}

export function NpsDistributionBar({
	promoter,
	passive,
	detractor,
	scopeLabel,
	className,
}: NpsDistributionBarProps) {
	const total = promoter + passive + detractor;
	const promoterPct = total === 0 ? 0 : (promoter / total) * 100;
	const passivePct = total === 0 ? 0 : (passive / total) * 100;
	const detractorPct = total === 0 ? 0 : (detractor / total) * 100;

	return (
		<div className={cn(wbCell, "px-4 py-4", className)}>
			<div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
				<span className="flex items-center gap-2">
					NPS distribution
					{scopeLabel ? (
						<span className="rounded-md border border-border/50 bg-muted/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
							{scopeLabel}
						</span>
					) : null}
				</span>
				<span>{total} responses</span>
			</div>

			{total === 0 ? (
				<div className="flex h-10 items-center justify-center text-sm text-muted-foreground">
					No NPS responses in this period.
				</div>
			) : (
				<>
					<div className="flex h-4 w-full overflow-hidden rounded-full bg-muted">
						{promoterPct > 0 ? (
							<div
								className="h-full bg-emerald-500 dark:bg-emerald-400"
								style={{ width: `${promoterPct}%` }}
							/>
						) : null}
						{passivePct > 0 ? (
							<div
								className="h-full bg-muted-foreground/40"
								style={{ width: `${passivePct}%` }}
							/>
						) : null}
						{detractorPct > 0 ? (
							<div
								className="h-full bg-red-500 dark:bg-red-400"
								style={{ width: `${detractorPct}%` }}
							/>
						) : null}
					</div>
					<div className="mt-3 grid grid-cols-3 gap-2 text-xs">
						<DistItem
							label="Promoters"
							count={promoter}
							pct={promoterPct}
							dot="bg-emerald-500 dark:bg-emerald-400"
						/>
						<DistItem
							label="Passives"
							count={passive}
							pct={passivePct}
							dot="bg-muted-foreground/40"
						/>
						<DistItem
							label="Detractors"
							count={detractor}
							pct={detractorPct}
							dot="bg-red-500 dark:bg-red-400"
						/>
					</div>
				</>
			)}
		</div>
	);
}

function DistItem({
	label,
	count,
	pct,
	dot,
}: {
	label: string;
	count: number;
	pct: number;
	dot: string;
}) {
	return (
		<div>
			<div className="flex items-center gap-1.5 text-muted-foreground">
				<span className={cn("h-2 w-2 rounded-full", dot)} />
				{label}
			</div>
			<div className="mt-1 text-base font-semibold tabular-nums text-foreground">
				{count} <span className="text-xs text-muted-foreground">· {pct.toFixed(0)}%</span>
			</div>
		</div>
	);
}
