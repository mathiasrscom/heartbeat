import {
	endOfDay,
	endOfMonth,
	endOfWeek,
	format,
	isValid,
	parseISO,
	startOfDay,
	startOfMonth,
	startOfWeek,
	startOfYear,
	subDays,
	subMonths,
	subWeeks,
} from "date-fns";
import type { SupportPeriodPreset, SupportPeriodRange } from "./types";

export interface SupportPeriodInput {
	period?: string;
	from?: string;
	to?: string;
}

export interface ResolvedSupportPeriod {
	range: SupportPeriodRange;
	from: Date;
	to: Date;
}

function toDateInput(value: Date) {
	return format(value, "yyyy-MM-dd");
}

function parseDate(value: string | undefined) {
	if (!value) return null;
	const parsed = parseISO(value);
	return isValid(parsed) ? parsed : null;
}

export function normalizeSupportPeriodInput(
	input: SupportPeriodInput | undefined,
) {
	const validPresets = [
		"previous-week",
		"rolling-30-days",
		"rolling-90-days",
		"rolling-180-days",
		"current-month",
		"previous-month",
		"year-to-date",
		"custom",
	] as const;
	const preset = validPresets.includes(
		input?.period as (typeof validPresets)[number],
	)
		? (input?.period as SupportPeriodPreset)
		: "current-week";

	return {
		period: preset as SupportPeriodPreset,
		from: typeof input?.from === "string" ? input.from : undefined,
		to: typeof input?.to === "string" ? input.to : undefined,
	};
}

export function resolveSupportPeriod(
	input: SupportPeriodInput | undefined,
	now = new Date(),
): ResolvedSupportPeriod {
	const normalized = normalizeSupportPeriodInput(input);
	const weekOptions = { weekStartsOn: 1 as const };

	if (normalized.period === "previous-week") {
		const previousWeek = subWeeks(now, 1);
		const from = startOfWeek(previousWeek, weekOptions);
		const to = endOfWeek(previousWeek, weekOptions);

		return {
			range: {
				preset: "previous-week",
				label: "Past week",
				from: toDateInput(from),
				to: toDateInput(to),
			},
			from,
			to,
		};
	}

	if (normalized.period === "current-month") {
		const from = startOfMonth(now);

		return {
			range: {
				preset: "current-month",
				label: "Current month",
				from: toDateInput(from),
				to: toDateInput(now),
			},
			from,
			to: now,
		};
	}

	if (normalized.period === "rolling-30-days") {
		const from = startOfDay(subDays(now, 29));

		return {
			range: {
				preset: "rolling-30-days",
				label: "Last 30 days",
				from: toDateInput(from),
				to: toDateInput(now),
			},
			from,
			to: now,
		};
	}

	if (
		normalized.period === "rolling-90-days" ||
		normalized.period === "rolling-180-days"
	) {
		const days = normalized.period === "rolling-90-days" ? 90 : 180;
		const from = startOfDay(subDays(now, days - 1));

		return {
			range: {
				preset: normalized.period,
				label: `Last ${days} days`,
				from: toDateInput(from),
				to: toDateInput(now),
			},
			from,
			to: now,
		};
	}

	if (normalized.period === "previous-month") {
		const previousMonth = subMonths(now, 1);
		const from = startOfMonth(previousMonth);
		const to = endOfMonth(previousMonth);

		return {
			range: {
				preset: "previous-month",
				label: "Past month",
				from: toDateInput(from),
				to: toDateInput(to),
			},
			from,
			to,
		};
	}

	if (normalized.period === "year-to-date") {
		const from = startOfYear(now);

		return {
			range: {
				preset: "year-to-date",
				label: "Year to date",
				from: toDateInput(from),
				to: toDateInput(now),
			},
			from,
			to: now,
		};
	}

	if (normalized.period === "custom") {
		const parsedFrom = parseDate(normalized.from);
		const parsedTo = parseDate(normalized.to ?? normalized.from);

		if (parsedFrom && parsedTo) {
			const from = startOfDay(parsedFrom <= parsedTo ? parsedFrom : parsedTo);
			const to = endOfDay(parsedTo >= parsedFrom ? parsedTo : parsedFrom);

			return {
				range: {
					preset: "custom",
					label: `${format(from, "d MMM")} - ${format(to, "d MMM")}`,
					from: toDateInput(from),
					to: toDateInput(to),
				},
				from,
				to,
			};
		}
	}

	const from = startOfWeek(now, weekOptions);

	return {
		range: {
			preset: "current-week",
			label: "Current week",
			from: toDateInput(from),
			to: toDateInput(now),
		},
		from,
		to: now,
	};
}
