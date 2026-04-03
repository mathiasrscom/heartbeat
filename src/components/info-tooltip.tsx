import { Info } from "lucide-react"
import { cn } from "@/lib/utils"

interface InfoTooltipProps {
  label: string
  tooltip?: string
  className?: string
}

export function InfoTooltip({ label, tooltip, className }: InfoTooltipProps) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <span>{label}</span>
      {tooltip ? (
        <span className="group relative inline-flex items-center">
          <span
            role="img"
            aria-label={`Info: ${tooltip}`}
            title={tooltip}
            className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-current/25 text-current/70"
          >
            <Info className="h-3 w-3" />
          </span>
          <span
            role="tooltip"
            className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 hidden w-64 -translate-x-1/2 rounded-md border bg-popover px-2 py-1.5 text-[11px] leading-4 text-popover-foreground shadow-lg group-hover:block group-focus-within:block"
          >
            {tooltip}
          </span>
        </span>
      ) : null}
    </div>
  )
}
