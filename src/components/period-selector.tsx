import { cn } from "@/lib/utils"
import { Calendar, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"

export type Period = "today" | "yesterday" | "7d" | "30d" | "custom"

interface PeriodSelectorProps {
  value: Period
  onChange: (period: Period) => void
  className?: string
}

const periods: { value: Period; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
]

export function PeriodSelector({
  value,
  onChange,
  className,
}: PeriodSelectorProps) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Calendar className="h-4 w-4 text-muted-foreground mr-1" />
      {periods.map((period) => (
        <Button
          key={period.value}
          variant={value === period.value ? "secondary" : "ghost"}
          size="sm"
          onClick={() => onChange(period.value)}
          className="h-8"
        >
          {period.label}
        </Button>
      ))}
    </div>
  )
}

// Simple inline version for tight spaces
export function PeriodSelectorCompact({
  value,
  onChange,
  className,
}: PeriodSelectorProps) {
  return (
    <div className={cn("relative inline-block", className)}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Period)}
        className="appearance-none bg-muted rounded-md px-3 py-1.5 pr-8 text-sm font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
      >
        {periods.map((period) => (
          <option key={period.value} value={period.value}>
            {period.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
    </div>
  )
}
