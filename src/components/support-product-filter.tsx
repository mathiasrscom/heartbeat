import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { ProductBrandLabel } from "@/components/product-brand"
import { cn } from "@/lib/utils"

interface SupportProductFilterProps {
  availableProducts: string[]
  selectedProducts: string[]
  onChange: (products: string[]) => void
  mode?: "app" | "wallboard"
  className?: string
}

export function SupportProductFilter({
  availableProducts,
  selectedProducts,
  onChange,
  mode = "app",
  className,
}: SupportProductFilterProps) {
  const isWallboard = mode === "wallboard"
  const [draftSelectedProducts, setDraftSelectedProducts] = useState(selectedProducts)

  useEffect(() => {
    setDraftSelectedProducts(selectedProducts)
  }, [selectedProducts])

  const hasChanges = (() => {
    if (draftSelectedProducts.length !== selectedProducts.length) return true

    const selected = new Set(selectedProducts)
    return draftSelectedProducts.some((productName) => !selected.has(productName))
  })()

  useEffect(() => {
    if (!hasChanges) return

    const timeoutId = window.setTimeout(() => {
      onChange(draftSelectedProducts)
    }, 180)

    return () => window.clearTimeout(timeoutId)
  }, [draftSelectedProducts, hasChanges, onChange])

  function toggleProduct(productName: string) {
    if (draftSelectedProducts.includes(productName)) {
      setDraftSelectedProducts(
        draftSelectedProducts.filter((value) => value !== productName)
      )
      return
    }

    setDraftSelectedProducts([...draftSelectedProducts, productName])
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button
        type="button"
        variant={draftSelectedProducts.length === 0 ? "secondary" : "ghost"}
        size="sm"
        className={cn(
          isWallboard &&
            "border border-white/10 bg-transparent text-stone-300 hover:bg-white/5 hover:text-stone-50",
          isWallboard && draftSelectedProducts.length === 0 && "bg-white/10 text-stone-50"
        )}
        onClick={() => setDraftSelectedProducts([])}
      >
        All products
      </Button>

      {availableProducts.map((productName) => {
        const selected = draftSelectedProducts.includes(productName)
        return (
          <Button
            key={productName}
            type="button"
            variant={selected ? "secondary" : "ghost"}
            size="sm"
            className={cn(
              isWallboard &&
                "border border-white/10 bg-transparent text-stone-300 hover:bg-white/5 hover:text-stone-50",
              isWallboard && selected && "bg-white/10 text-stone-50"
            )}
            onClick={() => toggleProduct(productName)}
          >
            <ProductBrandLabel productName={productName} logoSize="xs" />
          </Button>
        )
      })}
    </div>
  )
}
