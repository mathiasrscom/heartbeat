import type { TrendPoint } from "@/lib/support-health/types"

export function SatisfactionTrendChart({
  points,
  title,
}: {
  points: TrendPoint[]
  title: string
}) {
  const withValues = points
    .map((point, index) => ({
      index,
      label: point.label,
      value: point.value,
    }))
    .filter((point): point is { index: number; label: string; value: number } => point.value !== null)

  const totalPoints = Math.max(points.length - 1, 1)
  const toX = (index: number) => (index / totalPoints) * 100
  const toY = (value: number) => 100 - Math.min(100, Math.max(0, value))

  const linePath =
    withValues.length > 0
      ? withValues
          .map((point, index) => `${index === 0 ? "M" : "L"} ${toX(point.index)} ${toY(point.value)}`)
          .join(" ")
      : ""

  const areaPath =
    withValues.length > 0
      ? `${linePath} L ${toX(withValues[withValues.length - 1].index)} 100 L ${toX(withValues[0].index)} 100 Z`
      : ""

  const firstLabel = points[0]?.label ?? ""
  const middleLabel = points[Math.floor(points.length / 2)]?.label ?? ""
  const lastLabel = points[points.length - 1]?.label ?? ""
  const latest = withValues[withValues.length - 1]?.value ?? null

  return (
    <div className="rounded-md border border-white/10 bg-black/10 p-4">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="text-sm text-stone-300">{title}</div>
        <div className="text-sm text-stone-400">
          Latest:{" "}
          <span className="font-medium text-stone-100">
            {latest === null ? "—" : `${latest.toFixed(1)}%`}
          </span>
        </div>
      </div>

      {withValues.length === 0 ? (
        <div className="flex h-36 items-center justify-center text-sm text-stone-400">
          No rated conversations in this period.
        </div>
      ) : (
        <div className="relative h-36">
          <svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="none" aria-hidden>
            <defs>
              <linearGradient id="satisfaction-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(167 243 208 / 0.45)" />
                <stop offset="100%" stopColor="rgb(167 243 208 / 0.02)" />
              </linearGradient>
            </defs>
            <line x1="0" y1="10" x2="100" y2="10" stroke="rgb(255 255 255 / 0.12)" strokeDasharray="2 2" />
            <line x1="0" y1="50" x2="100" y2="50" stroke="rgb(255 255 255 / 0.08)" strokeDasharray="2 2" />
            <line x1="0" y1="90" x2="100" y2="90" stroke="rgb(255 255 255 / 0.12)" strokeDasharray="2 2" />
            <path d={areaPath} fill="url(#satisfaction-area)" />
            <path
              d={linePath}
              fill="none"
              stroke="rgb(94 234 212)"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {withValues.map((point) => (
              <circle
                key={`${point.label}-${point.index}`}
                cx={toX(point.index)}
                cy={toY(point.value)}
                r="1.6"
                fill="rgb(240 253 250)"
                stroke="rgb(20 184 166)"
                strokeWidth="0.8"
              />
            ))}
          </svg>
        </div>
      )}

      <div className="mt-3 grid grid-cols-3 text-xs text-stone-500">
        <div>{firstLabel}</div>
        <div className="text-center">{middleLabel}</div>
        <div className="text-right">{lastLabel}</div>
      </div>
    </div>
  )
}
