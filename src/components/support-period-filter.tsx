import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { SupportPeriodPreset } from "@/lib/support-health/types"
import { cn } from "@/lib/utils"

interface SupportPeriodFilterProps {
  period: SupportPeriodPreset
  from: string
  to: string
  onChange: (next: { period: SupportPeriodPreset; from?: string; to?: string }) => void
  mode?: "app" | "wallboard"
  className?: string
}

const OPTIONS: Array<{ value: SupportPeriodPreset; label: string }> = [
  { value: "current-week", label: "Current week" },
  { value: "previous-week", label: "Past week" },
  { value: "custom", label: "Custom" },
]

export function SupportPeriodFilter({
  period,
  from,
  to,
  onChange,
  mode = "app",
  className,
}: SupportPeriodFilterProps) {
  const [draftFrom, setDraftFrom] = useState(from)
  const [draftTo, setDraftTo] = useState(to)

  useEffect(() => {
    setDraftFrom(from)
    setDraftTo(to)
  }, [from, to])

  const isWallboard = mode === "wallboard"

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="flex items-center gap-2">
        {OPTIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={period === option.value ? "secondary" : "ghost"}
            size="sm"
            className={cn(
              isWallboard &&
                "border border-white/10 bg-transparent text-stone-300 hover:bg-white/5 hover:text-stone-50",
              isWallboard && period === option.value && "bg-white/10 text-stone-50"
            )}
            onClick={() =>
              onChange({
                period: option.value,
                from,
                to,
              })
            }
          >
            {option.label}
          </Button>
        ))}
      </div>

      {period === "custom" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={draftFrom}
            onChange={(event) => setDraftFrom(event.target.value)}
            className={cn(
              "h-8 w-[148px]",
              isWallboard && "border-white/10 bg-black/20 text-stone-100"
            )}
          />
          <Input
            type="date"
            value={draftTo}
            onChange={(event) => setDraftTo(event.target.value)}
            className={cn(
              "h-8 w-[148px]",
              isWallboard && "border-white/10 bg-black/20 text-stone-100"
            )}
          />
          <Button
            type="button"
            size="sm"
            variant={isWallboard ? "secondary" : "outline"}
            className={cn(isWallboard && "bg-white/10 text-stone-50 hover:bg-white/15")}
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
  )
}
