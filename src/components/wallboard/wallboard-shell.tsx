import { formatDistanceToNowStrict, format } from "date-fns"
import { cn } from "@/lib/utils"

interface WallboardShellProps {
  title: string
  refreshedAt: string | null
  stale: boolean
  toolbar?: React.ReactNode
  tickerItems?: string[]
  children: React.ReactNode
}

export function WallboardShell({
  title,
  refreshedAt,
  stale,
  toolbar,
  tickerItems,
  children,
}: WallboardShellProps) {
  const refreshedDate = refreshedAt ? new Date(refreshedAt) : null

  return (
    <div className="h-[100dvh] overflow-hidden bg-[#111315] text-stone-100">
      <div className="flex h-full w-full flex-col px-6 py-5 xl:px-8">
        <header className="flex items-end justify-between border-b border-white/10 pb-4">
          <div>
            <h1 className="text-[2rem] font-semibold tracking-tight text-stone-50">
              {title}
            </h1>
            {toolbar ? <div className="mt-3">{toolbar}</div> : null}
          </div>
          <div className="flex items-center gap-6 text-right">
            <div>
              <div className="text-sm text-stone-400">Now</div>
              <div className="text-lg font-medium text-stone-100">
                {format(new Date(), "EEE d MMM • HH:mm")}
              </div>
            </div>
            <div>
              <div className="text-sm text-stone-400">Data</div>
              <div
                className={cn(
                  "text-lg font-medium",
                  stale ? "text-amber-300" : "text-stone-100"
                )}
              >
                {refreshedDate
                  ? `${formatDistanceToNowStrict(refreshedDate)} ago`
                  : "No sync yet"}
              </div>
            </div>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-hidden pt-5">{children}</main>
        <TickerTape items={tickerItems ?? []} />
      </div>
    </div>
  )
}

interface WallboardSectionProps {
  title: string
  className?: string
  children: React.ReactNode
}

export function WallboardSection({
  title,
  className,
  children,
}: WallboardSectionProps) {
  return (
    <section className={cn("rounded-lg border border-white/10 bg-white/[0.03]", className)}>
      <div className="border-b border-white/10 px-5 py-3">
        <h2 className="text-base font-medium text-stone-200">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

function TickerTape({ items }: { items: string[] }) {
  const normalized = items
    .map((item) => item.trim())
    .filter((item) => item.length > 0)

  if (normalized.length === 0) return null

  const repeated = [...normalized, ...normalized]

  return (
    <footer className="mt-4 border border-white/10 bg-white/[0.02]">
      <div className="flex items-center gap-3 px-3 py-2">
        <div className="shrink-0 rounded-sm border border-sky-300/40 bg-sky-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-200">
          Ticker
        </div>
        <div className="wallboard-ticker-mask">
          <div className="wallboard-ticker-track">
            {repeated.map((item, index) => (
              <span
                key={`${index}-${item}`}
                className="inline-flex items-center gap-3 pr-8 text-sm text-stone-200"
              >
                <span className="text-sky-300">•</span>
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
