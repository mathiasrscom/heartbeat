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
  className,
}: {
  panels: RotatingPanel[]
  intervalMs?: number
  initialIndex?: number
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
      className={cn("flex min-h-0 h-full flex-col", className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {safePanels.length > 1 ? (
        <div className="mb-2 flex items-center justify-between px-1 text-xs text-stone-500">
          <div>
            View {index + 1}/{safePanels.length}: {active.label}
          </div>
          <div className="flex items-center gap-1.5">
            {safePanels.map((panel, panelIndex) => (
              <button
                key={panel.id}
                type="button"
                aria-label={`Show ${panel.label}`}
                className={cn(
                  "h-1.5 w-4 rounded-full transition-colors",
                  panelIndex === index ? "bg-stone-300" : "bg-white/20 hover:bg-white/35"
                )}
                onClick={() => setIndex(panelIndex)}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div key={active.id} className="min-h-0 flex-1 animate-in fade-in duration-500">
        {active.content}
      </div>
    </div>
  )
}
