type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return null
}

function toDate(value: unknown): Date | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Intercom uses unix seconds for timestamps
    const ms = value > 10_000_000_000 ? value : value * 1000
    const date = new Date(ms)
    return Number.isNaN(date.getTime()) ? null : date
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return null
}

function getFieldCaseInsensitive(obj: JsonRecord, fieldName: string) {
  if (fieldName in obj) return obj[fieldName]
  const lookup = fieldName.toLowerCase()
  for (const [key, value] of Object.entries(obj)) {
    if (key.toLowerCase() === lookup) return value
  }
  return undefined
}

function normalizeNpsScore(value: number): number | null {
  // NPS is 0-10. Accept 0-10 directly. Reject outside range.
  if (value < 0 || value > 10) return null
  return Math.round(value)
}

export type NpsBucket = "promoter" | "passive" | "detractor"

export function classifyNps(score: number): NpsBucket {
  if (score >= 9) return "promoter"
  if (score >= 7) return "passive"
  return "detractor"
}

/**
 * Average NPS rating on the 0–10 scale (one decimal place).
 *
 * The previous implementation returned the classic "% promoters minus
 * % detractors" index (range −100..100). We show a simple average instead
 * because it matches how teams talk about the score ("a 9", "an 8.2") and
 * isn't surprising when most customers rate high.
 *
 * Returns 0 for an empty list.
 */
export function calculateNps(scores: number[]): number {
  if (scores.length === 0) return 0
  const sum = scores.reduce((acc, value) => acc + value, 0)
  return Math.round((sum / scores.length) * 10) / 10
}

export interface ExtractedNps {
  score: number | null
  comment: string | null
  ratedAt: Date | null
}

export function extractNps(rawEntityData: unknown): ExtractedNps {
  if (!isRecord(rawEntityData)) {
    return { score: null, comment: null, ratedAt: null }
  }

  const customAttributes = rawEntityData.custom_attributes
  if (!isRecord(customAttributes)) {
    return { score: null, comment: null, ratedAt: null }
  }

  const rawScore =
    getFieldCaseInsensitive(customAttributes, "nps_score") ??
    getFieldCaseInsensitive(customAttributes, "NPS Score") ??
    getFieldCaseInsensitive(customAttributes, "nps score")
  const numericScore = toNumber(rawScore)
  const score = numericScore === null ? null : normalizeNpsScore(numericScore)

  const rawComment =
    getFieldCaseInsensitive(customAttributes, "nps_comment") ??
    getFieldCaseInsensitive(customAttributes, "NPS Comment") ??
    getFieldCaseInsensitive(customAttributes, "nps comment")
  const comment =
    typeof rawComment === "string" && rawComment.trim().length > 0
      ? rawComment.trim()
      : null

  const rawRatedAt =
    getFieldCaseInsensitive(customAttributes, "nps_rated_at") ??
    getFieldCaseInsensitive(customAttributes, "nps_submitted_at") ??
    getFieldCaseInsensitive(customAttributes, "NPS Rated At") ??
    rawEntityData.updated_at ??
    rawEntityData.signed_up_at
  const ratedAt = toDate(rawRatedAt)

  return { score, comment, ratedAt }
}
