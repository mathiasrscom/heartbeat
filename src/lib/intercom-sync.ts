/**
 * Intercom Sync Logic
 *
 * Syncs conversations, tickets, contacts, and team members from Intercom
 * into the local database for wallboard reporting.
 */

import { eq } from "drizzle-orm"
import { db } from "@/db"
import { adapterConfigs, entities, nodes, syncState, teamMembers } from "@/db/schema"
import {
  createIntercomClient,
  isIntercomApiError,
  type IntercomAdmin,
  type IntercomContact,
  type IntercomConversation,
  type IntercomTicket,
} from "./intercom"
import { extractIntercomCx } from "./intercom-cx"
import {
  claimIntercomSyncRuntime,
  finishIntercomSyncRuntime,
  updateIntercomSyncRuntime,
} from "./intercom-sync-runtime"

interface SyncResult {
  success: boolean
  skipped?: boolean
  nodesSynced: number
  entitiesSynced: number
  teamMembersSynced: number
  errors: string[]
}

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function normalizeAppUrl(value: unknown) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

async function getConfiguredIntercomAppUrl() {
  const configRow = await db
    .select({ settings: adapterConfigs.settings })
    .from(adapterConfigs)
    .where(eq(adapterConfigs.adapterId, "intercom"))
    .limit(1)

  const settings = isRecord(configRow[0]?.settings) ? configRow[0].settings : {}
  return normalizeAppUrl(settings.appUrl) ?? normalizeAppUrl(process.env.INTERCOM_APP_URL)
}

async function runIntercomSync(accessToken: string): Promise<SyncResult> {
  const appUrl = await getConfiguredIntercomAppUrl()
  const client = createIntercomClient({ accessToken, appUrl })
  const errors: string[] = []
  const teamNamesById = new Map<string, string>()
  const entityIdCache = new Map<string, string | null>()
  let nodesSynced = 0
  let entitiesSynced = 0
  let teamMembersSynced = 0

  try {
    const previousSync = await getLatestSyncTimestamp()
    const syncCutoff = previousSync ? Math.floor(previousSync.getTime() / 1000) : null

    try {
      await updateIntercomSyncRuntime("teams", "Syncing teams")
      const teamsResponse = await client.listTeams()
      for (const team of teamsResponse.data || []) {
        teamNamesById.set(team.id, team.name)
      }
    } catch (error) {
      errors.push(`Teams sync failed: ${error}`)
    }

    try {
      await updateIntercomSyncRuntime("team-members", "Syncing team members")
      const adminsResponse = await client.listAdmins()
      for (const admin of adminsResponse.data || []) {
        await upsertTeamMember(admin, teamNamesById)
        teamMembersSynced++
      }
    } catch (error) {
      errors.push(`Team members sync failed: ${error}`)
    }

    if (!previousSync) {
      try {
        await updateIntercomSyncRuntime("contacts", "Syncing contacts")
        entitiesSynced += await syncContacts(client)
      } catch (error) {
        errors.push(String(error))
      }
    }

    const conversationIds = new Set<string>()

    let hasMoreConversations = true
    let conversationCursor: string | undefined
    while (hasMoreConversations) {
      try {
        await updateIntercomSyncRuntime(
          "conversations",
          previousSync ? "Syncing changed conversations" : "Syncing conversations"
        )
        const response = previousSync
          ? await client.searchConversations(
              [
                {
                  field: "updated_at",
                  operator: ">",
                  value: syncCutoff ?? 0,
                },
              ],
              {
                per_page: 50,
                starting_after: conversationCursor,
              }
            )
          : await client.listConversations({
              per_page: 50,
              starting_after: conversationCursor,
            })
        const conversations = response.conversations || response.data || []

        for (const conversation of conversations) {
          conversationIds.add(conversation.id)

          const contactId = conversation.contacts?.contacts?.[0]?.id
          if (contactId) {
            entitiesSynced += await ensureContactEntity(client, contactId, entityIdCache)
          }

          await upsertConversationNode(conversation)
          nodesSynced++
        }

        conversationCursor = getNextCursor(response.pages?.next)
        hasMoreConversations = Boolean(conversationCursor)
        await sleep(100)
      } catch (error) {
        errors.push(`Conversations sync failed: ${error}`)
        hasMoreConversations = false
      }
    }

    let hasMoreTickets = true
    let ticketCursor: string | undefined
    while (hasMoreTickets) {
      try {
        await updateIntercomSyncRuntime(
          "tickets",
          previousSync ? "Syncing changed tickets" : "Syncing tickets"
        )
        const response = previousSync
          ? await client.searchTickets(
              [
                {
                  field: "updated_at",
                  operator: ">",
                  value: syncCutoff ?? 0,
                },
              ],
              {
                per_page: 50,
                starting_after: ticketCursor,
              }
            )
          : await client.listTickets({
              per_page: 50,
              starting_after: ticketCursor,
            })
        const tickets = response.tickets || response.data || []

        for (const ticket of tickets) {
          if (conversationIds.has(ticket.id)) {
            continue
          }

          const contactId = ticket.contacts?.contacts?.[0]?.id
          if (contactId) {
            entitiesSynced += await ensureContactEntity(client, contactId, entityIdCache)
          }

          await upsertTicketNode(ticket)
          nodesSynced++
        }

        ticketCursor = getNextCursor(response.pages?.next)
        hasMoreTickets = Boolean(ticketCursor)
        await sleep(100)
      } catch (error) {
        if (isIntercomApiError(error) && error.status === 404) {
          await updateIntercomSyncRuntime(
            "tickets",
            "Tickets endpoint unavailable for this workspace. Skipping ticket sync."
          )
          console.warn(
            "[intercom-sync] Tickets endpoint returned 404. Skipping tickets for this sync run."
          )
          hasMoreTickets = false
          continue
        }

        errors.push(`Tickets sync failed: ${error}`)
        hasMoreTickets = false
      }
    }

    await updateIntercomSyncRuntime("finalizing", "Finalizing sync")
    await updateSyncState(nodesSynced, entitiesSynced, teamMembersSynced, errors)

    return {
      success: errors.length === 0,
      nodesSynced,
      entitiesSynced,
      teamMembersSynced,
      errors,
    }
  } catch (error) {
    const syncError = `Sync failed: ${error}`
    const allErrors = [...errors, syncError]
    await updateSyncState(nodesSynced, entitiesSynced, teamMembersSynced, allErrors)

    return {
      success: false,
      nodesSynced,
      entitiesSynced,
      teamMembersSynced,
      errors: allErrors,
    }
  } finally {
    await finishIntercomSyncRuntime()
  }
}

function skippedSyncResult(): SyncResult {
  return {
    success: false,
    skipped: true,
    nodesSynced: 0,
    entitiesSynced: 0,
    teamMembersSynced: 0,
    errors: ["Sync already running."],
  }
}

export async function syncIntercom(accessToken: string): Promise<SyncResult> {
  const claimed = await claimIntercomSyncRuntime()
  if (!claimed) {
    return skippedSyncResult()
  }

  return runIntercomSync(accessToken)
}

export async function startIntercomSyncInBackground(accessToken: string) {
  const claimed = await claimIntercomSyncRuntime()
  if (!claimed) {
    return false
  }

  void runIntercomSync(accessToken).catch((error) => {
    console.error("[intercom-sync] Background sync failed", error)
  })

  return true
}

function getNextCursor(
  next:
    | string
    | {
        starting_after?: string
        page?: number
      }
    | undefined
) {
  if (typeof next === "string") return next
  return next?.starting_after
}

async function getLatestSyncTimestamp() {
  const existing = await db
    .select()
    .from(syncState)
    .where(eq(syncState.adapterId, "intercom"))
    .limit(1)

  return existing[0]?.lastSyncAt ?? null
}

async function syncContacts(client: ReturnType<typeof createIntercomClient>) {
  let entitiesSynced = 0
  let hasMoreContacts = true
  let contactCursor: string | undefined

  while (hasMoreContacts) {
    try {
      const response = await client.listContacts({
        per_page: 50,
        starting_after: contactCursor,
      })
      const contacts = response.data || []

      for (const contact of contacts) {
        await upsertEntity(contact)
        entitiesSynced++
      }

      contactCursor = getNextCursor(response.pages?.next)
      hasMoreContacts = Boolean(contactCursor)
      await sleep(100)
    } catch (error) {
      throw new Error(`Contacts sync failed: ${error}`)
    }
  }

  return entitiesSynced
}

async function ensureContactEntity(
  client: ReturnType<typeof createIntercomClient>,
  contactId: string,
  entityIdCache: Map<string, string | null>
) {
  if (entityIdCache.has(contactId)) {
    return 0
  }

  const existing = await resolveEntityId(contactId)
  if (existing) {
    entityIdCache.set(contactId, existing)
    return 0
  }

  try {
    const contact = await client.getContact(contactId)
    await upsertEntity(contact)
    const entityId = await resolveEntityId(contactId)
    entityIdCache.set(contactId, entityId)
    return 1
  } catch {
    entityIdCache.set(contactId, null)
    return 0
  }
}

async function upsertTeamMember(
  admin: IntercomAdmin,
  teamNamesById: Map<string, string>
) {
  const existing = await db
    .select()
    .from(teamMembers)
    .where(eq(teamMembers.externalId, admin.id))
    .limit(1)

  const teamName =
    admin.team_ids
      ?.map((teamId) => teamNamesById.get(teamId))
      .filter((name): name is string => Boolean(name))
      .join(", ") || null

  const data = {
    externalId: admin.id,
    source: "intercom" as const,
    name: admin.name,
    email: admin.email,
    teamName,
    updatedAt: new Date(),
  }

  if (existing.length > 0) {
    await db
      .update(teamMembers)
      .set(data)
      .where(eq(teamMembers.externalId, admin.id))
  } else {
    await db.insert(teamMembers).values({
      ...data,
      createdAt: new Date(),
    })
  }
}

async function upsertEntity(contact: IntercomContact) {
  const existing = await db
    .select()
    .from(entities)
    .where(eq(entities.externalId, contact.id))
    .limit(1)

  const plan = contact.custom_attributes?.plan as string | undefined
  const mrr = contact.custom_attributes?.mrr as number | undefined

  const data = {
    externalId: contact.id,
    source: "intercom" as const,
    type: "person" as const,
    email: contact.email || null,
    name: contact.name || null,
    value: {
      plan: plan || null,
      tier: normalizeTier(plan),
      mrr: mrr || null,
      company: contact.companies?.companies?.[0]?.name || null,
    },
    rawData: contact as unknown as Record<string, unknown>,
    updatedAt: new Date(),
  }

  if (existing.length > 0) {
    await db
      .update(entities)
      .set(data)
      .where(eq(entities.externalId, contact.id))
  } else {
    await db.insert(entities).values({
      ...data,
      createdAt: new Date(),
    })
  }
}

function normalizeTier(plan?: string | null) {
  if (!plan) return "unknown"
  const normalized = plan.toLowerCase()
  if (
    normalized === "free" ||
    normalized === "starter" ||
    normalized === "pro" ||
    normalized === "enterprise"
  ) {
    return normalized
  }
  return "unknown"
}

async function resolveEntityId(contactId?: string) {
  if (!contactId) return null

  const entity = await db
    .select()
    .from(entities)
    .where(eq(entities.externalId, contactId))
    .limit(1)

  return entity[0]?.id ?? null
}

async function resolveAssigneeId(adminId?: string | null) {
  if (!adminId) return null

  const assignee = await db
    .select()
    .from(teamMembers)
    .where(eq(teamMembers.externalId, adminId))
    .limit(1)

  return assignee[0]?.id ?? null
}

function mapConversationStatus(state: IntercomConversation["state"]) {
  if (state === "snoozed") return "pending" as const
  if (state === "closed") return "closed" as const
  return "open" as const
}

function mapTicketStatus(ticket: IntercomTicket) {
  if (ticket.open === false) return "closed" as const

  const stateValue =
    typeof ticket.ticket_state === "string"
      ? ticket.ticket_state
      : ticket.ticket_state?.state || ticket.ticket_state?.name

  const normalized = stateValue?.toLowerCase() || ""
  if (normalized.includes("resolved")) return "resolved" as const
  if (normalized.includes("closed")) return "closed" as const
  if (normalized.includes("customer")) return "pending" as const
  return "open" as const
}

async function upsertConversationNode(conversation: IntercomConversation) {
  const existing = await db
    .select()
    .from(nodes)
    .where(eq(nodes.externalId, conversation.id))
    .limit(1)

  const entityId = await resolveEntityId(conversation.contacts?.contacts?.[0]?.id)
  const assigneeId = await resolveAssigneeId(conversation.assignee?.id)
  const responseTimeSeconds =
    conversation.statistics?.time_to_admin_reply ??
    conversation.statistics?.time_to_first_reply
  const resolutionSeconds =
    conversation.statistics?.time_to_first_close ??
    conversation.statistics?.time_to_last_close
  const cx = extractIntercomCx(conversation as unknown as Record<string, unknown>)

  const data = {
    externalId: conversation.id,
    source: "intercom" as const,
    title: conversation.source?.subject || "Conversation",
    description: conversation.source?.body?.slice(0, 500) || null,
    type: "conversation",
    status: mapConversationStatus(conversation.state),
    priority: conversation.priority === "priority" ? "high" as const : "normal" as const,
    tags: conversation.tags?.tags?.map((tag) => tag.name) || [],
    entityId,
    assigneeId,
    valueSignals: {
      team: conversation.team?.name || null,
      tier: null,
      slaStatus: conversation.sla_applied?.sla_status || null,
    },
    effortSignals: {
      waitingSince: conversation.waiting_since || null,
    },
    responseTimeMinutes: responseTimeSeconds
      ? Math.floor(responseTimeSeconds / 60)
      : null,
    resolutionTimeHours: resolutionSeconds
      ? Number((resolutionSeconds / 3600).toFixed(2))
      : null,
    cxScore: cx.score,
    cxComment: cx.comment,
    rawData: conversation as unknown as Record<string, unknown>,
    resolvedAt:
      mapConversationStatus(conversation.state) === "closed"
        ? new Date(conversation.updated_at * 1000)
        : null,
    updatedAt: new Date(conversation.updated_at * 1000),
  }

  if (existing.length > 0) {
    await db.update(nodes).set(data).where(eq(nodes.externalId, conversation.id))
  } else {
    await db.insert(nodes).values({
      ...data,
      createdAt: new Date(conversation.created_at * 1000),
    })
  }
}

async function upsertTicketNode(ticket: IntercomTicket) {
  const existing = await db
    .select()
    .from(nodes)
    .where(eq(nodes.externalId, ticket.id))
    .limit(1)

  const entityId = await resolveEntityId(ticket.contacts?.contacts?.[0]?.id)
  const assigneeId = await resolveAssigneeId(ticket.admin_assignee_id)
  const ticketAttributes =
    (ticket.ticket_attributes as Record<string, unknown> | undefined) || {}

  const title =
    typeof ticketAttributes.subject === "string"
      ? ticketAttributes.subject
      : typeof ticketAttributes.title === "string"
        ? ticketAttributes.title
        : `Ticket ${ticket.ticket_id || ticket.id}`
  const description =
    typeof ticketAttributes.description === "string"
      ? ticketAttributes.description.slice(0, 500)
      : null

  const data = {
    externalId: ticket.id,
    source: "intercom" as const,
    title,
    description,
    type: "ticket",
    status: mapTicketStatus(ticket),
    priority: "normal" as const,
    tags: ticket.tags?.tags?.map((tag) => tag.name) || [],
    entityId,
    assigneeId,
    valueSignals: {
      teamAssigneeId: ticket.team_assignee_id || null,
      ticketType: ticket.ticket_type?.name || null,
    },
    effortSignals: {},
    rawData: ticket as unknown as Record<string, unknown>,
    resolvedAt:
      mapTicketStatus(ticket) === "resolved" || mapTicketStatus(ticket) === "closed"
        ? new Date(ticket.updated_at * 1000)
        : null,
    updatedAt: new Date(ticket.updated_at * 1000),
  }

  if (existing.length > 0) {
    await db.update(nodes).set(data).where(eq(nodes.externalId, ticket.id))
  } else {
    await db.insert(nodes).values({
      ...data,
      createdAt: new Date(ticket.created_at * 1000),
    })
  }
}

async function updateSyncState(
  nodesSynced: number,
  entitiesSynced: number,
  teamMembersSynced: number,
  errors: string[]
) {
  const existing = await db
    .select()
    .from(syncState)
    .where(eq(syncState.adapterId, "intercom"))
    .limit(1)

  const data = {
    lastSyncAt: new Date(),
    nodesSynced,
    entitiesSynced,
    teamMembersSynced,
    lastError: errors.length > 0 ? errors.join(" | ") : null,
    lastErrorAt: errors.length > 0 ? new Date() : null,
    updatedAt: new Date(),
  }

  if (existing.length > 0) {
    await db.update(syncState).set(data).where(eq(syncState.adapterId, "intercom"))
  } else {
    await db.insert(syncState).values({
      adapterId: "intercom",
      ...data,
    })
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function getSyncStatus() {
  const state = await db
    .select()
    .from(syncState)
    .where(eq(syncState.adapterId, "intercom"))
    .limit(1)

  if (state.length === 0) {
    return {
      connected: false,
      lastSyncAt: null,
      nodesSynced: 0,
      entitiesSynced: 0,
      teamMembersSynced: 0,
    }
  }

  return {
    connected: true,
    lastSyncAt: state[0].lastSyncAt,
    nodesSynced: state[0].nodesSynced,
    entitiesSynced: state[0].entitiesSynced,
    teamMembersSynced: state[0].teamMembersSynced,
    lastError: state[0].lastError,
  }
}
