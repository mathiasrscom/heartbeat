import type { SupportCaseSubtype } from "@/lib/support-health/types"

const FALLBACK_INTERCOM_APP_URL = "https://app.eu.intercom.com/a/inbox/zah460bv/inbox"

interface ParsedIntercomAppUrl {
  origin: string
  workspaceId: string
  inboxBaseUrl: string
}

function parseIntercomAppUrl(value: string): ParsedIntercomAppUrl | null {
  try {
    const url = new URL(value)
    const parts = url.pathname.split("/").filter(Boolean)
    const inboxIndex = parts.findIndex(
      (part, index) => part === "a" && parts[index + 1] === "inbox"
    )

    if (inboxIndex === -1) return null

    const workspaceId = parts[inboxIndex + 2]
    if (!workspaceId) return null

    return {
      origin: url.origin,
      workspaceId,
      inboxBaseUrl: `${url.origin}/a/inbox/${workspaceId}/inbox`,
    }
  } catch {
    return null
  }
}

export function normalizeIntercomAppUrl(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = parseIntercomAppUrl(trimmed)
  return parsed?.inboxBaseUrl ?? null
}

export function getDefaultIntercomAppUrl() {
  return normalizeIntercomAppUrl(process.env.INTERCOM_APP_URL) ?? FALLBACK_INTERCOM_APP_URL
}

export function buildIntercomCaseUrl(
  appUrl: string | null | undefined,
  input: {
    externalId: string
    subtype: SupportCaseSubtype
  }
) {
  if (!input.externalId) return null

  const normalized = normalizeIntercomAppUrl(appUrl) ?? getDefaultIntercomAppUrl()
  const parsed = parseIntercomAppUrl(normalized)
  if (!parsed) return null

  if (input.subtype === "ticket") {
    return `${parsed.origin}/a/inbox/${parsed.workspaceId}/tickets/${input.externalId}`
  }

  return `${parsed.inboxBaseUrl}/conversation/${input.externalId}`
}
