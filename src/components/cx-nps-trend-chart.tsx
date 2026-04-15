import { useId, useMemo } from "react";
import {
	CartesianGrid,
	Line,
	LineChart,
	ReferenceLine,
	XAxis,
	YAxis,
} from "recharts";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import type { TrendPoint } from "@/lib/support-health/types";
import { cn } from "@/lib/utils";

const wbCell =
	"rounded-lg border border-border/30 bg-white dark:border-transparent dark:bg-muted/50";

const chartConfig = {
	cx: {
		label: "CX",
		color: "var(--color-info)",
	},
	nps: {
		label: "NPS",
		color: "var(--color-success)",
	},
} satisfies ChartConfig;

interface CxNpsTrendChartProps {
	cxSeries: TrendPoint[];
	npsSeries: TrendPoint[];
	title: string;
	/** Current CX average on the 1–5 scale (header callout). */
	cxCurrent: number | null;
	/** Current NPS score in the range −100..100 (header callout). */
	npsCurrent: number | null;
	/** Target CX on the 1–5 scale (reference line). Default 4. */
	cxTarget?: number;
	/** Target NPS in the range −100..100 (reference line). Default 50. */
	npsTarget?: number;
	className?: string;
}

export function CxNpsTrendChart({
	cxSeries,
	npsSeries,
	title,
	cxCurrent,
	npsCurrent,
	cxTarget = 4,
	npsTarget = 50,
	className,
}: CxNpsTrendChartProps) {
	const gradientId = useId().replace(/:/g, "");
	const { merged, hasCx, hasNps } = useMemo(() => {
		const labels = new Set<string>();
		for (const point of cxSeries) labels.add(point.label);
		for (const point of npsSeries) labels.add(point.label);
		const ordered = Array.from(labels);
		const cxMap = new Map(cxSeries.map((p) => [p.label, p.value]));
		const npsMap = new Map(npsSeries.map((p) => [p.label, p.value]));
		return {
			// CX is natively 1–5 → map to 0..100 via (v/5)*100.
			// NPS is now the classic score in −100..100 → map to 0..100 via
			// (v+100)/2 so both lines can share a single 0..100 Y axis. The
			// raw value is preserved in `npsRaw` for the tooltip display.
			merged: ordered.map((label) => {
				const cxRaw = cxMap.get(label) ?? null;
				const npsRaw = npsMap.get(label) ?? null;
				return {
					label,
					cxRaw,
					npsRaw,
					cx: cxRaw === null ? null : Math.round((cxRaw / 5) * 100),
					nps: npsRaw === null ? null : Math.round(((npsRaw + 100) / 2)),
				};
			}),
			hasCx: cxSeries.some((p) => p.value !== null),
			hasNps: npsSeries.some((p) => p.value !== null),
		};
	}, [cxSeries, npsSeries]);

	const cxTargetPct = (cxTarget / 5) * 100;
	const npsTargetPct = (npsTarget + 100) / 2;

	return (
		<div className={cn(wbCell, "p-4", className)}>
			<div className="mb-3 flex flex-wrap items-center gap-3">
				<div className="flex-1 truncate text-sm text-muted-foreground">
					{title}
				</div>
				<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
					<LegendMetric
						color="#2563eb"
						label="CX"
						value={cxCurrent}
						target={cxTarget}
						max={5}
						display="percent"
					/>
					<LegendMetric
						color="#16a34a"
						label="NPS"
						value={npsCurrent}
						target={npsTarget}
						max={100}
						display="signed"
					/>
					<span className="inline-flex items-center gap-1.5 text-muted-foreground">
						<span className="inline-block h-px w-3 border-t border-dashed border-muted-foreground" />
						Target
					</span>
				</div>
			</div>

			{!hasCx && !hasNps ? (
				<div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
					No rated data in this period.
				</div>
			) : (
				<div className="h-40 w-full">
					<ChartContainer config={chartConfig} className="h-full w-full">
						<LineChart
							accessibilityLayer
							data={merged}
							margin={{ top: 12, right: 10, left: -18, bottom: 0 }}
						>
							<CartesianGrid vertical={false} strokeDasharray="4 4" />
							<YAxis hide domain={[0, 100]} />
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
										labelFormatter={(label) => String(label)}
										formatter={(_value, name, item) => {
											const raw = item.payload;
											if (name === "cx") {
												const v = raw?.cxRaw;
												return (
													<span className="font-medium tabular-nums text-foreground">
														{typeof v === "number" ? `${v.toFixed(1)} / 5.0` : "—"}
													</span>
												);
											}
											const v = raw?.npsRaw;
											return (
												<span className="font-medium tabular-nums text-foreground">
													{typeof v === "number"
														? v > 0
															? `+${Math.round(v)}`
															: `${Math.round(v)}`
														: "—"}
												</span>
											);
										}}
									/>
								}
							/>
							{hasCx ? (
								<ReferenceLine
									y={cxTargetPct}
									stroke="#2563eb"
									strokeDasharray="4 4"
									strokeOpacity={0.55}
								/>
							) : null}
							{hasNps && Math.abs(cxTargetPct - npsTargetPct) > 0.5 ? (
								<ReferenceLine
									y={npsTargetPct}
									stroke="#16a34a"
									strokeDasharray="4 4"
									strokeOpacity={0.55}
								/>
							) : null}
							{hasCx ? (
								<Line
									type="monotone"
									dataKey="cx"
									connectNulls
									stroke="#2563eb"
									strokeWidth={2.5}
									dot={false}
									isAnimationActive={false}
								/>
							) : null}
							{hasNps ? (
								<Line
									type="monotone"
									dataKey="nps"
									connectNulls
									stroke="#16a34a"
									strokeWidth={2.5}
									dot={false}
									isAnimationActive={false}
								/>
							) : null}
						</LineChart>
					</ChartContainer>
				</div>
			)}
			<span className="hidden" aria-hidden>
				{gradientId}
			</span>
		</div>
	);
}

function LegendMetric({
	color,
	label,
	value,
	target,
	max,
	display,
}: {
	color: string;
	label: string;
	value: number | null;
	target: number;
	max: number;
	/**
	 * "percent" — show value as (value/max)*100 with a "%" suffix and the raw
	 * "(v/max)" hint. Good for a 0..N scale like CX (1–5).
	 * "signed"  — show the value itself as a signed integer (e.g. "+42"). Good
	 * for the classic NPS score on the −100..100 scale.
	 */
	display: "percent" | "signed";
}) {
	const onTarget = value !== null && value >= target;
	const primary =
		value === null
			? "—"
			: display === "signed"
				? value > 0
					? `+${Math.round(value)}`
					: `${Math.round(value)}`
				: `${Math.round((value / max) * 100)}%`;
	const hint =
		value === null || display === "signed"
			? null
			: `(${value.toFixed(1)}/${max.toFixed(1)})`;
	return (
		<span className="inline-flex items-center gap-1.5">
			<span
				className="h-2 w-2 rounded-full"
				style={{ backgroundColor: color }}
			/>
			<span className="text-muted-foreground">{label}</span>
			<span
				className={cn(
					"font-semibold tabular-nums",
					value === null
						? "text-muted-foreground"
						: onTarget
							? "text-emerald-600 dark:text-emerald-300"
							: "text-red-600 dark:text-red-300",
				)}
			>
				{primary}
			</span>
			{hint ? (
				<span className="text-[10px] text-muted-foreground">{hint}</span>
			) : null}
		</span>
	);
}
