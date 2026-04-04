import { useEffect, useMemo, useState } from "react"
import { cn } from "@/lib/utils"

export interface ProductAutoplayState {
  products: string[]
  activeIndex: number
  activeProduct: string | null
  setActiveIndex: (index: number) => void
}

function uniqueProducts(products: string[]) {
  return Array.from(
    new Set(products.map((value) => value.trim()).filter((value) => value.length > 0))
  )
}

export function useProductAutoplay(
  products: string[],
  options?: {
    intervalMs?: number
  }
): ProductAutoplayState {
  const stableProducts = useMemo(() => uniqueProducts(products), [products])
  const intervalMs = options?.intervalMs ?? 12_000
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    setActiveIndex(0)
  }, [stableProducts.join("|")])

  useEffect(() => {
    if (stableProducts.length < 2) return

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % stableProducts.length)
    }, intervalMs)

    return () => window.clearInterval(timer)
  }, [intervalMs, stableProducts.length])

  return {
    products: stableProducts,
    activeIndex: stableProducts.length === 0 ? 0 : activeIndex % stableProducts.length,
    activeProduct:
      stableProducts.length === 0 ? null : stableProducts[activeIndex % stableProducts.length],
    setActiveIndex,
  }
}

export function ProductAutoplayStrip({
  title,
  subtitle,
  state,
  mode = "full",
  className,
}: {
  title: string
  subtitle: string
  state: ProductAutoplayState
  mode?: "full" | "compact"
  className?: string
}) {
  const { products, activeIndex, activeProduct, setActiveIndex } = state

  if (mode === "compact") {
    return (
      <div
        className={cn("rounded-md border border-white/10 bg-white/[0.03] px-4 py-2.5", className)}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 truncate text-sm">
            <span className="text-stone-400">{title}: </span>
            <span className="font-semibold text-stone-100">
              {activeProduct ?? "All products"}
            </span>
          </div>
          <div className="shrink-0 text-xs text-stone-400">
            {products.length > 1 ? `${activeIndex + 1}/${products.length} • 12s` : "Single"}
          </div>
        </div>
        {products.length > 1 ? (
          <div className="mt-2 flex items-center gap-1.5">
            {products.map((product, index) => {
              const active = index === activeIndex
              return (
                <button
                  key={product}
                  type="button"
                  aria-label={`Focus ${product}`}
                  onClick={() => setActiveIndex(index)}
                  className={cn(
                    "h-1.5 rounded-full transition-colors",
                    active ? "w-7 bg-sky-300" : "w-4 bg-white/25 hover:bg-white/45"
                  )}
                />
              )
            })}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className={cn("rounded-lg border border-white/10 bg-white/[0.03] px-5 py-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm font-medium uppercase tracking-[0.12em] text-stone-400">
            {title}
          </div>
          <div className="mt-2 text-xl font-semibold tracking-tight text-stone-50">
            {activeProduct ?? "No product selected"}
          </div>
          <div className="mt-1 text-sm text-stone-400">{subtitle}</div>
        </div>
        <div className="text-right text-sm text-stone-400">
          {products.length > 1 ? (
            <>
              <div>
                Product {activeIndex + 1}/{products.length}
              </div>
              <div>Auto-rotates every 12s</div>
            </>
          ) : (
            <div>Single product focus</div>
          )}
        </div>
      </div>
      {products.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {products.map((product, index) => {
            const active = index === activeIndex
            return (
              <button
                key={product}
                type="button"
                onClick={() => setActiveIndex(index)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "border-sky-300/60 bg-sky-300/15 text-sky-100"
                    : "border-white/10 bg-black/20 text-stone-300 hover:bg-white/10 hover:text-stone-50"
                )}
              >
                {product}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
