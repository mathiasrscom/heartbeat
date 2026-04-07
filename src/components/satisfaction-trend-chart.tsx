import { useId } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { panelSurfaceClassName } from "@/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import type { TrendPoint } from "@/lib/support-health/types";
import { cn } from "@/lib/utils";

const chartConfig = {
	satisfaction: {
		label: "Satisfaction",
		color: "var(--color-info)",
	},
} satisfies ChartConfig;

export function SatisfactionTrendChart({
	points,
	title,
}: {
	points: TrendPoint[];
	title: string;
}) {
	const gradientId = useId().replace(/:/g, "");
	const chartData = points.map((point) => ({
		label: point.label,
		value: point.value,
	}));
	const latest =
		[...chartData].reverse().find((point) => point.value !== null)?.value ??
		null;
	const hasValues = chartData.some((point) => point.value !== null);

	return (
		<div className={cn(panelSurfaceClassName, "p-4")}>
			<div className="mb-3 flex items-end justify-between gap-3">
				<div className="text-sm text-muted-foreground">{title}</div>
				<div className="text-sm text-muted-foreground">
					Latest:{" "}
					<span className="font-medium text-foreground">
						{latest === null ? "—" : `${latest.toFixed(1)}%`}
					</span>
				</div>
			</div>

			{!hasValues ? (
				<div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
					No rated conversations in this period.
				</div>
			) : (
				<div className="h-40 w-full">
					<ChartContainer config={chartConfig} className="h-full w-full">
						<AreaChart
							accessibilityLayer
							data={chartData}
							margin={{ top: 12, right: 10, left: -18, bottom: 0 }}
						>
							<defs>
								<linearGradient
									id={`fill-${gradientId}`}
									x1="0"
									y1="0"
									x2="0"
									y2="1"
								>
									<stop
										offset="5%"
										stopColor="var(--color-satisfaction)"
										stopOpacity={0.28}
									/>
									<stop
										offset="95%"
										stopColor="var(--color-satisfaction)"
										stopOpacity={0.04}
									/>
								</linearGradient>
							</defs>
							<CartesianGrid vertical={false} strokeDasharray="4 4" />
							<YAxis hide domain={[0, 100]} ticks={[0, 50, 100]} />
							<XAxis
								dataKey="label"
								axisLine={false}
								tickLine={false}
								tickMargin={10}
								minTickGap={24}
							/>
							<ChartTooltip
								cursor={false}
								content={
									<ChartTooltipContent
										labelFormatter={(label) => `Day ${label}`}
										formatter={(value) => (
											<span className="font-medium tabular-nums text-foreground">
												{typeof value === "number"
													? `${value.toFixed(1)}%`
													: value}
											</span>
										)}
									/>
								}
							/>
							<Area
								type="monotone"
								dataKey="value"
								connectNulls
								stroke="var(--color-satisfaction)"
								fill={`url(#fill-${gradientId})`}
								strokeWidth={2}
								dot={{
									r: 3,
									fill: "var(--background)",
									stroke: "var(--color-satisfaction)",
									strokeWidth: 2,
								}}
								activeDot={{
									r: 4,
									fill: "var(--background)",
									stroke: "var(--color-satisfaction)",
									strokeWidth: 2,
								}}
							/>
						</AreaChart>
					</ChartContainer>
				</div>
			)}
		</div>
	);
}
