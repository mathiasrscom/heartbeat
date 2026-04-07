import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { panelSurfaceClassName } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { SupportPeriodPreset } from "@/lib/support-health/types";
import { cn } from "@/lib/utils";

interface SupportPeriodFilterProps {
	period: SupportPeriodPreset;
	from: string;
	to: string;
	onChange: (next: {
		period: SupportPeriodPreset;
		from?: string;
		to?: string;
	}) => void;
	mode?: "app" | "wallboard";
	className?: string;
}

const OPTIONS: Array<{
	value: SupportPeriodPreset;
	label: string;
	wallboardLabel: string;
}> = [
	{ value: "current-week", label: "Current week", wallboardLabel: "This week" },
	{ value: "previous-week", label: "Past week", wallboardLabel: "Last week" },
	{ value: "custom", label: "Custom", wallboardLabel: "Custom" },
];

export function SupportPeriodFilter({
	period,
	from,
	to,
	onChange,
	mode = "app",
	className,
}: SupportPeriodFilterProps) {
	const [draftFrom, setDraftFrom] = useState(from);
	const [draftTo, setDraftTo] = useState(to);

	useEffect(() => {
		setDraftFrom(from);
		setDraftTo(to);
	}, [from, to]);

	const isWallboard = mode === "wallboard";

	return (
		<div
			className={cn(
				"flex flex-wrap items-center gap-2",
				isWallboard && "gap-1.5",
				className,
			)}
		>
			<div
				className={cn(
					"flex items-center gap-2",
					isWallboard && panelSurfaceClassName,
					isWallboard && "gap-1 p-1",
				)}
			>
				{OPTIONS.map((option) => (
					<Button
						key={option.value}
						type="button"
						variant={period === option.value ? "secondary" : "ghost"}
						size="sm"
						className={cn(
							isWallboard && "h-7 rounded-md px-2.5 text-[11px] shadow-none",
							isWallboard &&
								"border-transparent bg-transparent text-muted-foreground hover:bg-card hover:text-foreground",
							isWallboard &&
								period === option.value &&
								"bg-card text-foreground",
						)}
						onClick={() =>
							onChange({
								period: option.value,
								from,
								to,
							})
						}
					>
						{isWallboard ? option.wallboardLabel : option.label}
					</Button>
				))}
			</div>

			{period === "custom" ? (
				<div
					className={cn(
						"flex flex-wrap items-center gap-2",
						isWallboard && "gap-1.5",
					)}
				>
					<Input
						type="date"
						value={draftFrom}
						onChange={(event) => setDraftFrom(event.target.value)}
						className={cn(
							"h-8 w-[148px]",
							isWallboard &&
								"h-7 rounded-md border-border/40 bg-background text-foreground",
						)}
					/>
					<Input
						type="date"
						value={draftTo}
						onChange={(event) => setDraftTo(event.target.value)}
						className={cn(
							"h-8 w-[148px]",
							isWallboard &&
								"h-7 rounded-md border-border/40 bg-background text-foreground",
						)}
					/>
					<Button
						type="button"
						size="sm"
						variant={isWallboard ? "secondary" : "outline"}
						className={cn(
							isWallboard &&
								"h-7 rounded-md border border-border/40 bg-card px-2.5 text-[11px] text-foreground shadow-none hover:border-border",
						)}
						onClick={() =>
							onChange({
								period: "custom",
								from: draftFrom,
								to: draftTo || draftFrom,
							})
						}
						disabled={!draftFrom || !draftTo}
					>
						Apply
					</Button>
				</div>
			) : null}
		</div>
	);
}
