export interface SupportProductFilterInput {
  products?: string[] | string
}

export function normalizeSupportProductFilterInput(
  input: SupportProductFilterInput | undefined
) {
  const raw = Array.isArray(input?.products)
    ? input?.products
    : typeof input?.products === "string"
      ? input.products.split(",")
      : []

  const products = Array.from(
    new Set(
      raw
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  )

  return {
    products,
  }
}
