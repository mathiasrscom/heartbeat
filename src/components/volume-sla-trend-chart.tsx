import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import type { DailyVolumeSlaPoint } from "@/lib/support-health/types";
import { cn } from "@/lib/utils";

const wbCell =
	"rounded-lg border border-border/30 bg-white dark:border-transparent dark:bg-muted/50";

const chartConfig = {
	metTarget: {
		label: "Met target",
		color: "var(--color-success)",
	},
	nearTarget: {
		label: "Near target",
		color: "var(--color-warning)",
	},
	missedTarget: {
		label: "Missed target",
		color: "var(--color-danger)",
	},
	noTrackedSla: {
		label: "No SLA",
		color: "var(--color-muted-foreground)",
	},
} satisfies ChartConfig;

type SlaBand = keyof typeof chartConfig;

interface VolumeBarDatum extends DailyVolumeSlaPoint {
	fillKey: SlaBand;
	fillOpacity: number;
	isPeakVolume: boolean;
	slaLabel: string;
	statusLabel: string;
}

function buildTicks(
	start: number,
	end: number,
	step: number,
	required: number[] = [],
) {
	const ticks: number[] = [];

	for (let value = start; value <= end; value += step) {
		ticks.push(value);
	}

	ticks.push(...required.filter((value) => value >= start && value <= end));

	if (!ticks.includes(start)) ticks.push(start);
	if (!ticks.includes(end)) ticks.push(end);

	return [...new Set(ticks)].sort((left, right) => left - right);
}

function resolveVolumeStep(max: number) {
	if (max <= 8) return 2;
	if (max <= 30) return 5;
	if (max <= 60) return 10;
	return 20;
}

function getSlaBand(
	slaAdherencePercent: number | null,
	slaTargetPercent: number,
): SlaBand {
	if (slaAdherencePercent === null) return "noTrackedSla";
	if (slaAdherencePercent >= slaTargetPercent) return "metTarget";
	if (slaAdherencePercent >= Math.max(0, slaTargetPercent - 5)) {
		return "nearTarget";
	}
	return "missedTarget";
}

function formatSlaLabel(slaAdherencePercent: number | null) {
	return slaAdherencePercent === null ? "No tracked SLA" : `${slaAdherencePercent}%`;
}

function formatStatusLabel(fillKey: SlaBand) {
	switch (fillKey) {
		case "metTarget":
			return "Met target";
		case "nearTarget":
			return "Near target";
		case "missedTarget":
			return "Missed target";
		case "noTrackedSla":
			return "No tracked SLA";
	}
}

export function VolumeSlaTrendChart({
	points,
	slaTargetPercent,
	className,
}: {
	points: DailyVolumeSlaPoint[];
	slaTargetPercent: number;
	className?: string;
}) {
	const { chartData, hasWindowData, volumeDomainMax, volumeTicks } = useMemo(() => {
		const hasWindowData = points.some(
			(point) => point.volume > 0 || point.slaAdherencePercent !== null,
		);
		const peakVolumeIndex = points.reduce(
			(bestIndex, point, index, items) =>
				bestIndex === -1 || point.volume >= items[bestIndex].volume
					? index
					: bestIndex,
			-1,
		);
		const chartData: VolumeBarDatum[] = points.map((point, index) => {
			const fillKey = getSlaBand(point.slaAdherencePercent, slaTargetPercent);

			return {
				...point,
				fillKey,
				fillOpacity: fillKey === "noTrackedSla" ? 0.42 : 0.88,
				isPeakVolume: index === peakVolumeIndex && point.volume > 0,
				slaLabel: formatSlaLabel(point.slaAdherencePercent),
				statusLabel: formatStatusLabel(fillKey),
			};
		});
		const volumeMax = points.reduce(
			(max, point) => Math.max(max, point.volume),
			0,
		);
		const step = resolveVolumeStep(volumeMax);
		const volumeDomainMax =
			volumeMax <= 8 ? 8 : Math.ceil(volumeMax / step) * step;
		const volumeTicks = buildTicks(0, volumeDomainMax, resolveVolumeStep(volumeDomainMax), [
			0,
			volumeMax,
		]);

		return { chartData, hasWindowData, volumeDomainMax, volumeTicks };
	}, [points, slaTargetPercent]);

	const tooltipLabelFormatter = (
		_label: unknown,
		payload?: Array<{ payload?: { dateLabel?: string } }>,
	) => String(payload?.[0]?.payload?.dateLabel ?? _label ?? "");

	return (
		<div className={cn(wbCell, "p-4", className)}>
			{!hasWindowData ? (
				<div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
					No cases opened in the last 30 days.
				</div>
			) : (
				<>
					<div className="mb-3 text-xs text-muted-foreground">
						Bar height shows cases. Green hit target, amber is close, red
						missed, gray has no tracked SLA.
					</div>

					<div className="h-64 w-full">
						<ChartContainer config={chartConfig} className="h-full w-full">
							<BarChart
								accessibilityLayer
								data={chartData}
								margin={{ top: 8, right: 8, left: 4, bottom: 8 }}
							>
								<CartesianGrid vertical={false} strokeDasharray="4 4" />
								<XAxis
									dataKey="label"
									axisLine={false}
									tickLine={false}
									tickMargin={10}
									minTickGap={18}
								/>
								<YAxis
									axisLine={false}
									tickLine={false}
									tickMargin={8}
									width={34}
									allowDecimals={false}
									domain={[0, volumeDomainMax]}
									ticks={volumeTicks}
								/>
								<ChartTooltip
									cursor={false}
									content={
										<ChartTooltipContent
											labelFormatter={tooltipLabelFormatter}
											formatter={(_value, _name, item) => {
												const point = item.payload as VolumeBarDatum | undefined;

												if (!point) return null;

												return (
													<div className="grid min-w-[10rem] gap-1">
														<div className="flex items-center justify-between gap-4">
															<span className="text-muted-foreground">Cases</span>
															<span className="font-medium tabular-nums text-foreground">
																{point.volume}
															</span>
														</div>
														<div className="flex items-center justify-between gap-4">
															<span className="text-muted-foreground">SLA</span>
															<span className="font-medium tabular-nums text-foreground">
																{point.slaLabel}
															</span>
														</div>
														<div className="flex items-center justify-between gap-4">
															<span className="text-muted-foreground">Status</span>
															<span className="font-medium text-foreground">
																{point.statusLabel}
															</span>
														</div>
													</div>
												);
											}}
										/>
									}
								/>
								<Bar
									dataKey="volume"
									radius={[4, 4, 0, 0]}
									barSize={16}
									isAnimationActive={false}
								>
									{chartData.map((point) => (
										<Cell
											key={point.dateLabel}
											fill={`var(--color-${point.fillKey})`}
											fillOpacity={point.isPeakVolume ? 1 : point.fillOpacity}
											stroke={
												point.isPeakVolume
													? "var(--color-foreground)"
													: "transparent"
											}
											strokeOpacity={point.isPeakVolume ? 0.28 : 0}
											strokeWidth={point.isPeakVolume ? 1.5 : 0}
										/>
									))}
								</Bar>
							</BarChart>
						</ChartContainer>
					</div>
				</>
			)}
		</div>
	);
}
