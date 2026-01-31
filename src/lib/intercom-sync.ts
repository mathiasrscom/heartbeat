/**
 * Intercom Sync Logic
 *
 * Syncs conversations, contacts, and team members from Intercom
 * into our local database for analysis.
 */

import { db } from "@/db"
import { entities, teamMembers, nodes, syncState } from "@/db/schema"
import { createIntercomClient, type IntercomConversation, type IntercomContact, type IntercomAdmin } from "./intercom"
import { eq } from "drizzle-orm"

interface SyncResult {
  success: boolean
  nodesSynced: number
  entitiesSynced: number
  teamMembersSynced: number
  errors: string[]
}

export async function syncIntercom(accessToken: string): Promise<SyncResult> {
  const client = createIntercomClient({ accessToken })
  const errors: string[] = []
  let nodesSynced = 0
  let entitiesSynced = 0
  let teamMembersSynced = 0

  try {
    // 1. Sync team members (admins)
    console.log("Syncing team members...")
    try {
      const adminsResponse = await client.listAdmins()
      const admins = adminsResponse.data || []

      for (const admin of admins) {
        await upsertTeamMember(admin)
        teamMembersSynced++
      }
    } catch (err) {
      errors.push(`Team members sync failed: ${err}`)
    }

    // 2. Sync conversations (with pagination)
    console.log("Syncing conversations...")
    let hasMore = true
    let cursor: string | undefined

    while (hasMore) {
      try {
        const response = await client.listConversations({
          per_page: 50,
          starting_after: cursor,
        })

        const conversations = response.conversations || response.data || []

        for (const conv of conversations) {
          // Sync the contact as an entity
          if (conv.contacts?.contacts?.[0]) {
            try {
              const contact = await client.getContact(conv.contacts.contacts[0].id)
              await upsertEntity(contact)
              entitiesSynced++
            } catch (err) {
              // Contact might not exist, skip
            }
          }

          // Sync the conversation as a node
          await upsertNode(conv)
          nodesSynced++
        }

        // Check for more pages
        if (response.pages?.next) {
          cursor = response.pages.next
        } else {
          hasMore = false
        }

        // Rate limiting - be nice to the API
        await sleep(100)
      } catch (err) {
        errors.push(`Conversations sync failed: ${err}`)
        hasMore = false
      }
    }

    // 3. Update sync state
    await updateSyncState(nodesSynced, entitiesSynced, teamMembersSynced)

    return {
      success: errors.length === 0,
      nodesSynced,
      entitiesSynced,
      teamMembersSynced,
      errors,
    }
  } catch (err) {
    return {
      success: false,
      nodesSynced,
      entitiesSynced,
      teamMembersSynced,
      errors: [`Sync failed: ${err}`],
    }
  }
}

// Upsert a team member
async function upsertTeamMember(admin: IntercomAdmin) {
  const existing = await db
    .select()
    .from(teamMembers)
    .where(eq(teamMembers.externalId, admin.id))
    .limit(1)

  const data = {
    externalId: admin.id,
    source: "intercom" as const,
    name: admin.name,
    email: admin.email,
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

// Upsert an entity (contact/customer)
async function upsertEntity(contact: IntercomContact) {
  const existing = await db
    .select()
    .from(entities)
    .where(eq(entities.externalId, contact.id))
    .limit(1)

  // Try to extract plan from custom attributes
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
      mrr: mrr || null,
      company: contact.companies?.companies?.[0]?.name || null,
    },
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

// Upsert a node from conversation
async function upsertNode(conv: IntercomConversation) {
  const existing = await db
    .select()
    .from(nodes)
    .where(eq(nodes.externalId, conv.id))
    .limit(1)

  // Map Intercom state to our status
  const statusMap: Record<string, "open" | "pending" | "resolved" | "closed"> = {
    open: "open",
    snoozed: "pending",
    closed: "closed",
  }

  // Get entity ID if we have one
  let entityId: string | null = null
  if (conv.contacts?.contacts?.[0]) {
    const entity = await db
      .select()
      .from(entities)
      .where(eq(entities.externalId, conv.contacts.contacts[0].id))
      .limit(1)
    if (entity.length > 0) {
      entityId = entity[0].id
    }
  }

  // Get assignee ID if we have one
  let assigneeId: string | null = null
  if (conv.assignee?.id) {
    const assignee = await db
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.externalId, conv.assignee.id))
      .limit(1)
    if (assignee.length > 0) {
      assigneeId = assignee[0].id
    }
  }

  const data = {
    externalId: conv.id,
    source: "intercom" as const,
    title: conv.source?.subject || null,
    description: conv.source?.body?.slice(0, 500) || null,
    type: "conversation",
    status: statusMap[conv.state] || "open",
    priority: conv.priority === "priority" ? "high" as const : "normal" as const,
    tags: conv.tags?.tags?.map((t) => t.name) || [],
    entityId,
    assigneeId,
    responseTimeMinutes: conv.statistics?.time_to_first_reply
      ? Math.floor(conv.statistics.time_to_first_reply / 60)
      : null,
    cxScore: conv.conversation_rating?.rating
      ? conv.conversation_rating.rating * 2 // Convert 1-5 to 1-10
      : null,
    cxComment: conv.conversation_rating?.remark || null,
    updatedAt: new Date(),
  }

  if (existing.length > 0) {
    await db
      .update(nodes)
      .set(data)
      .where(eq(nodes.externalId, conv.id))
  } else {
    await db.insert(nodes).values({
      ...data,
      createdAt: new Date(conv.created_at * 1000),
    })
  }
}

// Update sync state
async function updateSyncState(nodesSynced: number, entitiesSynced: number, teamMembersSynced: number) {
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
    updatedAt: new Date(),
  }

  if (existing.length > 0) {
    await db
      .update(syncState)
      .set(data)
      .where(eq(syncState.adapterId, "intercom"))
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

// Get sync status
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
