import { formatDistanceToNowStrict, format } from "date-fns"
import { cn } from "@/lib/utils"

interface WallboardShellProps {
  title: string
  refreshedAt: string | null
  stale: boolean
  children: React.ReactNode
}

export function WallboardShell({
  title,
  refreshedAt,
  stale,
  children,
}: WallboardShellProps) {
  const refreshedDate = refreshedAt ? new Date(refreshedAt) : null

  return (
    <div className="min-h-screen bg-[#111315] text-stone-100">
      <div className="mx-auto flex min-h-screen max-w-[1880px] flex-col px-8 py-6">
        <header className="flex items-end justify-between border-b border-white/10 pb-4">
          <div>
            <h1 className="text-[2rem] font-semibold tracking-tight text-stone-50">
              {title}
            </h1>
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
        <main className="flex-1 pt-6">{children}</main>
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
