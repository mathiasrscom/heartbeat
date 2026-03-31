import { cn } from "@/lib/utils"

interface SparklineProps {
  values: Array<number | null>
  className?: string
  strokeClassName?: string
}

export function Sparkline({
  values,
  className,
  strokeClassName = "stroke-[#d6d3d1]",
}: SparklineProps) {
  const sanitized = values.map((value) => value ?? 0)
  const max = Math.max(...sanitized, 1)
  const min = Math.min(...sanitized, 0)
  const range = max - min || 1

  const points = sanitized
    .map((value, index) => {
      const x = (index / Math.max(sanitized.length - 1, 1)) * 100
      const y = 100 - ((value - min) / range) * 100
      return `${x},${y}`
    })
    .join(" ")

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={cn("h-20 w-full", className)}
      aria-hidden="true"
    >
      <polyline
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        className={strokeClassName}
      />
    </svg>
  )
}
