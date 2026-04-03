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

function normalizeCxScore(value: number) {
  if (value > 0 && value <= 5) return Math.round(value * 2)
  if (value > 5 && value <= 10) return Number(value.toFixed(1))
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

function extractConversationRating(raw: JsonRecord) {
  const conversationRating = raw.conversation_rating
  if (!isRecord(conversationRating)) {
    return null
  }

  const score = toNumber(conversationRating.rating)
  if (score === null) return null

  const remark =
    typeof conversationRating.remark === "string" &&
    conversationRating.remark.trim().length > 0
      ? conversationRating.remark
      : null

  return {
    score,
    comment: remark,
    source: "conversation_rating" as const,
  }
}

function extractCustomAttributeRating(raw: JsonRecord) {
  const customAttributes = raw.custom_attributes
  if (!isRecord(customAttributes)) {
    return null
  }

  const rawScore =
    getFieldCaseInsensitive(customAttributes, "CX Score rating") ??
    getFieldCaseInsensitive(customAttributes, "cx_score_rating") ??
    getFieldCaseInsensitive(customAttributes, "cx score rating")
  const score = toNumber(rawScore)
  if (score === null) return null

  const explanation =
    getFieldCaseInsensitive(customAttributes, "CX Score explanation") ??
    getFieldCaseInsensitive(customAttributes, "cx_score_explanation") ??
    getFieldCaseInsensitive(customAttributes, "cx score explanation")

  const comment =
    typeof explanation === "string" && explanation.trim().length > 0
      ? explanation
      : null

  return {
    score,
    comment,
    source: "custom_attribute" as const,
  }
}

function extractAiAgentRating(raw: JsonRecord) {
  const aiAgent = raw.ai_agent
  if (!isRecord(aiAgent)) {
    return null
  }

  const score = toNumber(aiAgent.rating)
  if (score === null) return null

  const comment =
    typeof aiAgent.rating_remark === "string" && aiAgent.rating_remark.trim().length > 0
      ? aiAgent.rating_remark
      : null

  return {
    score,
    comment,
    source: "ai_agent" as const,
  }
}

export function extractIntercomCx(rawData: unknown): {
  score: number | null
  comment: string | null
  source: "conversation_rating" | "custom_attribute" | "ai_agent" | null
} {
  if (!isRecord(rawData)) {
    return { score: null, comment: null, source: null }
  }

  const conversation = extractConversationRating(rawData)
  if (conversation) {
    return {
      score: normalizeCxScore(conversation.score),
      comment: conversation.comment,
      source: conversation.source,
    }
  }

  const customAttribute = extractCustomAttributeRating(rawData)
  if (customAttribute) {
    return {
      score: normalizeCxScore(customAttribute.score),
      comment: customAttribute.comment,
      source: customAttribute.source,
    }
  }

  const aiAgent = extractAiAgentRating(rawData)
  if (aiAgent) {
    return {
      score: normalizeCxScore(aiAgent.score),
      comment: aiAgent.comment,
      source: aiAgent.source,
    }
  }

  return { score: null, comment: null, source: null }
}
