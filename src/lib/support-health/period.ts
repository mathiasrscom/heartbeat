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
  subMonths,
  subWeeks,
} from "date-fns"
import type { SupportPeriodPreset, SupportPeriodRange } from "./types"

export interface SupportPeriodInput {
  period?: string
  from?: string
  to?: string
}

export interface ResolvedSupportPeriod {
  range: SupportPeriodRange
  from: Date
  to: Date
}

function toDateInput(value: Date) {
  return format(value, "yyyy-MM-dd")
}

function parseDate(value: string | undefined) {
  if (!value) return null
  const parsed = parseISO(value)
  return isValid(parsed) ? parsed : null
}

export function normalizeSupportPeriodInput(input: SupportPeriodInput | undefined) {
  const validPresets = ["previous-week", "current-month", "previous-month", "custom"] as const
  const preset =
    validPresets.includes(input?.period as (typeof validPresets)[number])
      ? (input!.period as SupportPeriodPreset)
      : "current-week"

  return {
    period: preset as SupportPeriodPreset,
    from: typeof input?.from === "string" ? input.from : undefined,
    to: typeof input?.to === "string" ? input.to : undefined,
  }
}

export function resolveSupportPeriod(
  input: SupportPeriodInput | undefined,
  now = new Date()
): ResolvedSupportPeriod {
  const normalized = normalizeSupportPeriodInput(input)
  const weekOptions = { weekStartsOn: 1 as const }

  if (normalized.period === "previous-week") {
    const previousWeek = subWeeks(now, 1)
    const from = startOfWeek(previousWeek, weekOptions)
    const to = endOfWeek(previousWeek, weekOptions)

    return {
      range: {
        preset: "previous-week",
        label: "Past week",
        from: toDateInput(from),
        to: toDateInput(to),
      },
      from,
      to,
    }
  }

  if (normalized.period === "current-month") {
    const from = startOfMonth(now)

    return {
      range: {
        preset: "current-month",
        label: "Current month",
        from: toDateInput(from),
        to: toDateInput(now),
      },
      from,
      to: now,
    }
  }

  if (normalized.period === "previous-month") {
    const previousMonth = subMonths(now, 1)
    const from = startOfMonth(previousMonth)
    const to = endOfMonth(previousMonth)

    return {
      range: {
        preset: "previous-month",
        label: "Past month",
        from: toDateInput(from),
        to: toDateInput(to),
      },
      from,
      to,
    }
  }

  if (normalized.period === "custom") {
    const parsedFrom = parseDate(normalized.from)
    const parsedTo = parseDate(normalized.to ?? normalized.from)

    if (parsedFrom && parsedTo) {
      const from = startOfDay(parsedFrom <= parsedTo ? parsedFrom : parsedTo)
      const to = endOfDay(parsedTo >= parsedFrom ? parsedTo : parsedFrom)

      return {
        range: {
          preset: "custom",
          label: `${format(from, "d MMM")} - ${format(to, "d MMM")}`,
          from: toDateInput(from),
          to: toDateInput(to),
        },
        from,
        to,
      }
    }
  }

  const from = startOfWeek(now, weekOptions)

  return {
    range: {
      preset: "current-week",
      label: "Current week",
      from: toDateInput(from),
      to: toDateInput(now),
    },
    from,
    to: now,
  }
}
