import { eq } from "drizzle-orm"

const WALLBOARD_TICKER_MESSAGES_KEY = "wallboard_ticker_messages"
const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434"
const MAX_TICKER_ITEMS = 10

interface StoredTickerMessages {
  items: string[]
  generatedAt: string
  source: "deterministic" | "ollama"
  model: string | null
}

interface OllamaRewriteResult {
  items: string[]
  model: string
}

export interface TickerLlmConfig {
  provider: "ollama" | null
  enabled: boolean
  model: string | null
  baseUrl: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function normalizeMessage(value: unknown) {
  if (typeof value !== "string") return null
  const normalized = value.replace(/\s+/g, " ").trim()
  if (!normalized) return null
  return normalized.slice(0, 180)
}

function normalizeMessageList(value: unknown) {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const items: string[] = []

  for (const item of value) {
    const normalized = normalizeMessage(item)
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    items.push(normalized)
    if (items.length >= MAX_TICKER_ITEMS) break
  }

  return items
}

function extractJsonArrayFromText(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return null

  try {
    const parsed = JSON.parse(trimmed)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    // Continue to fallback parsing.
  }

  const match = trimmed.match(/\[[\s\S]*\]/)
  if (!match) return null

  try {
    const parsed = JSON.parse(match[0])
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function parseOllamaMessages(text: string) {
  const fromJson = extractJsonArrayFromText(text)
  if (fromJson) return normalizeMessageList(fromJson)

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\-\d\.\)\s]+/, ""))
    .map((line) => normalizeMessage(line))
    .filter((line): line is string => line !== null)

  return normalizeMessageList(lines)
}

async function upsertTickerMessages(value: StoredTickerMessages) {
  const [{ db }, { settings }] = await Promise.all([import("@/db"), import("@/db/schema")])
  const rows = await db
    .select()
    .from(settings)
    .where(eq(settings.key, WALLBOARD_TICKER_MESSAGES_KEY))
    .limit(1)

  if (rows.length > 0) {
    await db
      .update(settings)
      .set({
        value,
        updatedAt: new Date(),
      })
      .where(eq(settings.key, WALLBOARD_TICKER_MESSAGES_KEY))
    return
  }

  await db.insert(settings).values({
    key: WALLBOARD_TICKER_MESSAGES_KEY,
    value,
    updatedAt: new Date(),
  })
}

export async function readWallboardTickerMessages() {
  const [{ db }, { settings }] = await Promise.all([import("@/db"), import("@/db/schema")])
  const rows = await db
    .select()
    .from(settings)
    .where(eq(settings.key, WALLBOARD_TICKER_MESSAGES_KEY))
    .limit(1)

  const value = rows[0]?.value
  if (!isRecord(value)) return []
  return normalizeMessageList(value.items)
}

export async function writeWallboardTickerMessages(input: {
  items: string[]
  source: "deterministic" | "ollama"
  model: string | null
}) {
  const items = normalizeMessageList(input.items)
  if (items.length === 0) return

  await upsertTickerMessages({
    items,
    generatedAt: new Date().toISOString(),
    source: input.source,
    model: input.model,
  })
}

export async function rewriteTickerMessagesWithOllama(
  seedItems: string[],
  config: TickerLlmConfig
) {
  if (!config.enabled || config.provider !== "ollama") return null
  const model = config.model?.trim()
  if (!model) return null

  const facts = normalizeMessageList(seedItems)
  if (facts.length === 0) return null

  const baseUrl = (config.baseUrl || DEFAULT_OLLAMA_BASE_URL).replace(/\/$/, "")
  const prompt = [
    "Write short TV-news ticker messages for a support wallboard.",
    "Rules:",
    "- Keep facts exactly true to input.",
    "- Keep it office-safe. No customer or company names.",
    "- Mention teammates and products when provided.",
    "- Use energetic but professional tone.",
    "- Return only JSON array of strings.",
    "",
    "Facts:",
    ...facts.map((item, index) => `${index + 1}. ${item}`),
  ].join("\n")

  const response = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: {
        temperature: 0.35,
      },
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Ollama API error (${response.status}): ${detail}`)
  }

  const payload = (await response.json()) as { response?: unknown }
  const content = typeof payload.response === "string" ? payload.response : ""
  const items = parseOllamaMessages(content)

  if (items.length === 0) return null

  const result: OllamaRewriteResult = {
    items,
    model,
  }
  return result
}
