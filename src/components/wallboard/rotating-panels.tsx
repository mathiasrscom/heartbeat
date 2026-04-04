import { useEffect, useMemo, useState } from "react"
import { cn } from "@/lib/utils"

export interface RotatingPanel {
  id: string
  label: string
  content: React.ReactNode
}

export function RotatingPanels({
  panels,
  intervalMs = 18_000,
  initialIndex = 0,
  showIndicators = true,
  className,
}: {
  panels: RotatingPanel[]
  intervalMs?: number
  initialIndex?: number
  showIndicators?: boolean
  className?: string
}) {
  const safePanels = useMemo(() => panels.filter((panel) => panel.content), [panels])
  const [index, setIndex] = useState(
    safePanels.length === 0 ? 0 : Math.min(initialIndex, safePanels.length - 1)
  )
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (safePanels.length === 0) return
    setIndex((current) => current % safePanels.length)
  }, [safePanels.length])

  useEffect(() => {
    if (paused || safePanels.length < 2) return

    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % safePanels.length)
    }, intervalMs)

    return () => window.clearInterval(timer)
  }, [intervalMs, paused, safePanels.length])

  if (safePanels.length === 0) return null

  const active = safePanels[index]

  return (
    <div
      className={cn("relative flex h-full min-h-0 flex-col", className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {showIndicators && safePanels.length > 1 ? (
        <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-black/30 px-2 py-1 backdrop-blur-sm">
          <div className="flex items-center gap-1.5">
            {safePanels.map((panel, panelIndex) => (
              <button
                key={panel.id}
                type="button"
                aria-label={`Show ${panel.label}`}
                className={cn(
                  "h-1.5 rounded-full transition-colors",
                  panelIndex === index
                    ? "w-5 bg-stone-200"
                    : "w-3 bg-white/25 hover:bg-white/45"
                )}
                onClick={() => setIndex(panelIndex)}
              />
            ))}
          </div>
          <div className="text-[10px] text-stone-400">
            {index + 1}/{safePanels.length}
          </div>
        </div>
      ) : null}

      <div
        key={active.id}
        className="min-h-0 flex-1 overflow-y-auto pr-1 animate-in fade-in duration-500"
      >
        {active.content}
      </div>
    </div>
  )
}
