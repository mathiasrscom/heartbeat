import type { SupportServiceBucket } from "./types"

type JsonRecord = Record<string, unknown>

interface ProductPolicyRule {
  id: string
  label: string
  bucket: SupportServiceBucket
  policyName: string
  matchTerms: string[]
}

interface ClassificationInput {
  title: string | null
  description: string | null
  tags: string[]
  queueName: string
  rawData: unknown
}

export interface SupportCaseClassification {
  productName: string
  serviceBucket: SupportServiceBucket
  servicePolicyName: string
}

const PRODUCT_POLICY_RULES: ProductPolicyRule[] = [
  {
    id: "addo-sign",
    label: "Addo Sign",
    bucket: "headline",
    policyName: "Standard workflow",
    matchTerms: ["addo sign", "addosign"],
  },
  {
    id: "twoday",
    label: "twoday",
    bucket: "headline",
    policyName: "Standard workflow",
    matchTerms: ["twoday"],
  },
  {
    id: "pension-broker",
    label: "Pension Broker",
    bucket: "exception",
    policyName: "Separate workflow",
    matchTerms: ["pension broker", "pensionbroker"],
  },
  {
    id: "cvr",
    label: "CVR",
    bucket: "exception",
    policyName: "Separate workflow",
    matchTerms: ["cvr"],
  },
]

export function getKnownSupportProducts() {
  return PRODUCT_POLICY_RULES.map((rule) => rule.label)
}

const GENERIC_QUEUE_NAMES = new Set([
  "general",
  "support",
  "customer support",
  "shared inbox",
  "inbox",
  "team inbox",
])

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function getNestedValue(obj: unknown, path: string[]) {
  let current = obj
  for (const key of path) {
    if (!isRecord(current)) return undefined
    current = current[key]
  }
  return current
}

function normalizeSearchValue(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
}

function formatProductLabel(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return "Unmapped"

  return trimmed
    .split(/\s+/)
    .map((part) => {
      if (/^[A-Z0-9]+$/.test(part)) {
        return part.toUpperCase()
      }

      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    })
    .join(" ")
}

function isGenericQueueName(value: string) {
  return GENERIC_QUEUE_NAMES.has(normalizeSearchValue(value))
}

function getStringCandidate(value: unknown) {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim()
  }

  if (isRecord(value)) {
    const nested = [value.name, value.label, value.value, value.title]
    for (const candidate of nested) {
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        return candidate.trim()
      }
    }
  }

  return null
}

function getExplicitProduct(rawData: unknown) {
  const candidates = [
    getNestedValue(rawData, ["product"]),
    getNestedValue(rawData, ["product_name"]),
    getNestedValue(rawData, ["brand"]),
    getNestedValue(rawData, ["brand_name"]),
    getNestedValue(rawData, ["ticket_attributes", "product"]),
    getNestedValue(rawData, ["ticket_attributes", "product_name"]),
    getNestedValue(rawData, ["ticket_attributes", "brand"]),
    getNestedValue(rawData, ["ticket_attributes", "brand_name"]),
    getNestedValue(rawData, ["custom_attributes", "product"]),
    getNestedValue(rawData, ["custom_attributes", "product_name"]),
    getNestedValue(rawData, ["custom_attributes", "brand"]),
    getNestedValue(rawData, ["custom_attributes", "brand_name"]),
  ]

  for (const candidate of candidates) {
    const resolved = getStringCandidate(candidate)
    if (resolved) {
      return resolved
    }
  }

  return null
}

function matchesRule(rule: ProductPolicyRule, haystack: string, tokens: Set<string>) {
  return rule.matchTerms.some((term) => {
    const normalized = normalizeSearchValue(term)
    if (!normalized) return false
    if (normalized.includes(" ")) return haystack.includes(normalized)
    return tokens.has(normalized)
  })
}

export function classifySupportCase(input: ClassificationInput): SupportCaseClassification {
  const explicitProduct = getExplicitProduct(input.rawData)
  const searchFragments = [
    explicitProduct,
    input.queueName,
    input.title,
    input.description,
    ...input.tags,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map(normalizeSearchValue)

  const haystack = searchFragments.join(" ")
  const tokens = new Set(haystack.split(" ").filter(Boolean))

  const matchedRule = PRODUCT_POLICY_RULES.find((rule) => matchesRule(rule, haystack, tokens))
  if (matchedRule) {
    return {
      productName: matchedRule.label,
      serviceBucket: matchedRule.bucket,
      servicePolicyName: matchedRule.policyName,
    }
  }

  if (explicitProduct) {
    return {
      productName: formatProductLabel(explicitProduct),
      serviceBucket: "headline",
      servicePolicyName: "Standard workflow",
    }
  }

  if (input.queueName && !isGenericQueueName(input.queueName)) {
    return {
      productName: formatProductLabel(input.queueName),
      serviceBucket: "headline",
      servicePolicyName: "Standard workflow",
    }
  }

  return {
    productName: "Unmapped",
    serviceBucket: "unknown",
    servicePolicyName: "Unmapped",
  }
}
