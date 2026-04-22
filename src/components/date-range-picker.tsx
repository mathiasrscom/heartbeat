import { useState } from "react";
import { cn } from "@/lib/utils";
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export type DateRange = {
	from: Date;
	to: Date;
	label?: string;
};

export type QuickPeriod =
	| "today"
	| "yesterday"
	| "7d"
	| "30d"
	| "90d"
	| "custom";

interface DateRangePickerProps {
	value: DateRange;
	onChange: (range: DateRange) => void;
	className?: string;
}

const quickPeriods: {
	value: QuickPeriod;
	label: string;
	shortLabel: string;
}[] = [
	{ value: "today", label: "Today", shortLabel: "Today" },
	{ value: "yesterday", label: "Yesterday", shortLabel: "Yest" },
	{ value: "7d", label: "Last 7 days", shortLabel: "7d" },
	{ value: "30d", label: "Last 30 days", shortLabel: "30d" },
	{ value: "90d", label: "Last 90 days", shortLabel: "90d" },
];

function getDateRange(period: QuickPeriod): DateRange {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

	switch (period) {
		case "today":
			return { from: today, to: now, label: "Today" };
		case "yesterday": {
			const yesterday = new Date(today);
			yesterday.setDate(yesterday.getDate() - 1);
			return { from: yesterday, to: today, label: "Yesterday" };
		}
		case "7d": {
			const weekAgo = new Date(today);
			weekAgo.setDate(weekAgo.getDate() - 7);
			return { from: weekAgo, to: now, label: "Last 7 days" };
		}
		case "30d": {
			const monthAgo = new Date(today);
			monthAgo.setDate(monthAgo.getDate() - 30);
			return { from: monthAgo, to: now, label: "Last 30 days" };
		}
		case "90d": {
			const quarterAgo = new Date(today);
			quarterAgo.setDate(quarterAgo.getDate() - 90);
			return { from: quarterAgo, to: now, label: "Last 90 days" };
		}
		default:
			return { from: today, to: now, label: "Today" };
	}
}

function formatDateShort(date: Date): string {
	return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Compact date range picker - single dropdown button
 */
export function DateRangePicker({
	value,
	onChange,
	className,
}: DateRangePickerProps) {
	const [isOpen, setIsOpen] = useState(false);

	const handlePeriodSelect = (period: QuickPeriod) => {
		onChange(getDateRange(period));
		setIsOpen(false);
	};

	const displayLabel =
		value.label ||
		`${formatDateShort(value.from)} - ${formatDateShort(value.to)}`;

	return (
		<div className={cn("relative", className)}>
			<Button
				variant="outline"
				size="sm"
				onClick={() => setIsOpen(!isOpen)}
				className="h-8 gap-2 font-normal"
			>
				<Calendar className="h-3.5 w-3.5" />
				<span>{displayLabel}</span>
				<ChevronDown className="h-3.5 w-3.5 opacity-50" />
			</Button>

			{isOpen && (
				<>
					<button
						type="button"
						aria-label="Close date range menu"
						className="fixed inset-0 z-40 bg-transparent"
						onClick={() => setIsOpen(false)}
					/>
					<div className="absolute right-0 top-full mt-1 z-50 bg-popover border rounded-md shadow-lg p-2 min-w-[160px]">
						{quickPeriods.map((period) => (
							<button
								key={period.value}
								type="button"
								onClick={() => handlePeriodSelect(period.value)}
								className={cn(
									"w-full text-left px-3 py-1.5 text-sm rounded-md hover:bg-accent",
									value.label === period.label && "bg-accent font-medium",
								)}
							>
								{period.label}
							</button>
						))}
					</div>
				</>
			)}
		</div>
	);
}

/**
 * Inline pill-style period selector - minimal footprint
 */
export function PeriodPills({
	value,
	onChange,
	className,
}: {
	value: QuickPeriod;
	onChange: (period: QuickPeriod) => void;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"inline-flex items-center gap-0.5 bg-muted p-0.5 rounded-md",
				className,
			)}
		>
			{quickPeriods.slice(0, 4).map((period) => (
				<button
					key={period.value}
					type="button"
					onClick={() => onChange(period.value)}
					className={cn(
						"px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
						value === period.value
							? "bg-background text-foreground shadow-sm"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					{period.shortLabel}
				</button>
			))}
		</div>
	);
}

/**
 * Date navigator with arrows - for timeline views
 */
export function DateNavigator({
	date,
	onChange,
	granularity = "day",
	className,
}: {
	date: Date;
	onChange: (date: Date) => void;
	granularity?: "day" | "week" | "month";
	className?: string;
}) {
	const navigate = (direction: -1 | 1) => {
		const newDate = new Date(date);
		switch (granularity) {
			case "day":
				newDate.setDate(newDate.getDate() + direction);
				break;
			case "week":
				newDate.setDate(newDate.getDate() + direction * 7);
				break;
			case "month":
				newDate.setMonth(newDate.getMonth() + direction);
				break;
		}
		onChange(newDate);
	};

	const formatDate = () => {
		switch (granularity) {
			case "day":
				return date.toLocaleDateString("en-US", {
					weekday: "short",
					month: "short",
					day: "numeric",
				});
			case "week": {
				const weekEnd = new Date(date);
				weekEnd.setDate(weekEnd.getDate() + 6);
				return `${formatDateShort(date)} - ${formatDateShort(weekEnd)}`;
			}
			case "month":
				return date.toLocaleDateString("en-US", {
					month: "long",
					year: "numeric",
				});
		}
	};

	const isToday = () => {
		const today = new Date();
		return (
			date.getDate() === today.getDate() &&
			date.getMonth() === today.getMonth() &&
			date.getFullYear() === today.getFullYear()
		);
	};

	return (
		<div className={cn("inline-flex items-center gap-1", className)}>
			<Button
				variant="ghost"
				size="icon"
				className="h-7 w-7"
				onClick={() => navigate(-1)}
			>
				<ChevronLeft className="h-4 w-4" />
			</Button>
			<button
				type="button"
				onClick={() => onChange(new Date())}
				className={cn(
					"px-3 py-1 text-sm font-medium rounded-md min-w-[140px]",
					isToday() ? "bg-primary text-primary-foreground" : "hover:bg-muted",
				)}
			>
				{isToday() ? "Today" : formatDate()}
			</button>
			<Button
				variant="ghost"
				size="icon"
				className="h-7 w-7"
				onClick={() => navigate(1)}
				disabled={isToday()}
			>
				<ChevronRight className="h-4 w-4" />
			</Button>
		</div>
	);
}

// Export helper
export { getDateRange };
