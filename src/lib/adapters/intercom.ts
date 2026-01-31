/**
 * Intercom Adapter
 *
 * Reference implementation of a Heartbeat adapter.
 * Syncs conversations from Intercom and normalizes them to Nodes.
 */

import { z } from "zod"
import type { Adapter, AdapterConfig, SyncResult, Node, Entity, TeamMember } from "./types"
import { adapterRegistry } from "./types"
import { createIntercomClient, type IntercomConversation, type IntercomContact, type IntercomAdmin } from "../intercom"

// ─────────────────────────────────────────────────────────────
// CONFIG SCHEMA
// ─────────────────────────────────────────────────────────────

const intercomConfigSchema = z.object({
  id: z.literal("intercom"),
  name: z.string(),
  enabled: z.boolean(),
  credentials: z.object({
    accessToken: z.string().min(1, "Access token is required"),
  }),
})

// ─────────────────────────────────────────────────────────────
// ADAPTER IMPLEMENTATION
// ─────────────────────────────────────────────────────────────

export const intercomAdapter: Adapter = {
  id: "intercom",
  name: "Intercom",
  description: "Sync conversations, contacts, and CX data from Intercom",
  icon: "MessageSquare",

  configSchema: intercomConfigSchema,

  async testConnection(config: AdapterConfig): Promise<boolean> {
    try {
      const client = createIntercomClient({
        accessToken: config.credentials.accessToken,
      })
      return await client.testConnection()
    } catch {
      return false
    }
  },

  async sync(config: AdapterConfig): Promise<SyncResult> {
    const startTime = Date.now()
    const errors: string[] = []
    let nodesSynced = 0
    let entitiesSynced = 0
    let teamMembersSynced = 0

    try {
      const client = createIntercomClient({
        accessToken: config.credentials.accessToken,
      })

      // 1. Sync team members
      try {
        const adminsResponse = await client.listAdmins()
        const admins = adminsResponse.data || []
        for (const _admin of admins) {
          // Here you would save to DB
          // await saveTeamMember(this.normalizeTeamMember(_admin))
          teamMembersSynced++
        }
      } catch (err) {
        errors.push(`Team members sync failed: ${err}`)
      }

      // 2. Sync conversations (with pagination)
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
            // Sync contact if available
            if (conv.contacts?.contacts?.[0]) {
              try {
                await client.getContact(conv.contacts.contacts[0].id)
                // TODO: Save entity - await saveEntity(this.normalizeEntity(contact))
                entitiesSynced++
              } catch {
                // Contact might not exist
              }
            }

            // Sync conversation as node
            // await saveNode(this.normalizeNode(conv))
            nodesSynced++
          }

          // Check for more pages
          if (response.pages?.next) {
            cursor = response.pages.next
          } else {
            hasMore = false
          }

          // Rate limiting
          await new Promise((r) => setTimeout(r, 100))
        } catch (err) {
          errors.push(`Conversations sync failed: ${err}`)
          hasMore = false
        }
      }

      return {
        success: errors.length === 0,
        nodesSynced,
        entitiesSynced,
        teamMembersSynced,
        errors,
        duration: Date.now() - startTime,
      }
    } catch (err) {
      return {
        success: false,
        nodesSynced,
        entitiesSynced,
        teamMembersSynced,
        errors: [`Sync failed: ${err}`],
        duration: Date.now() - startTime,
      }
    }
  },

  normalizeNode(raw: unknown): Node {
    const conv = raw as IntercomConversation

    // Map Intercom state to our status
    const statusMap: Record<string, Node["status"]> = {
      open: "open",
      snoozed: "pending",
      closed: "closed",
    }

    return {
      id: `intercom-${conv.id}`,
      externalId: conv.id,
      source: "intercom",

      title: conv.source?.subject || "Conversation",
      description: conv.source?.body,
      bodyPreview: conv.source?.body?.slice(0, 500),

      status: statusMap[conv.state] || "open",
      priority: conv.priority === "priority" ? "high" : "normal",

      type: "conversation",
      tags: conv.tags?.tags?.map((t) => t.name) || [],

      createdBy: conv.source?.author
        ? {
            id: conv.source.author.id,
            name: conv.source.author.name,
            email: conv.source.author.email,
          }
        : undefined,

      assignee: conv.assignee?.id
        ? {
            id: conv.assignee.id,
            name: conv.assignee.name,
          }
        : undefined,

      valueSignals: {
        // These would be enriched from contact data
        sentiment: undefined,
        cxScore: conv.conversation_rating?.rating
          ? conv.conversation_rating.rating * 2 // 1-5 → 1-10
          : undefined,
      },

      effortSignals: {},

      createdAt: new Date(conv.created_at * 1000),
      updatedAt: new Date(conv.updated_at * 1000),

      responseTimeMinutes: conv.statistics?.time_to_first_reply
        ? Math.floor(conv.statistics.time_to_first_reply / 60)
        : undefined,

      rawData: conv as unknown as Record<string, unknown>,
    }
  },

  normalizeEntity(raw: unknown): Entity {
    const contact = raw as IntercomContact

    // Try to extract value from custom attributes
    const plan = contact.custom_attributes?.plan as string | undefined
    const mrr = contact.custom_attributes?.mrr as number | undefined

    // Map plan to tier
    const tierMap: Record<string, Entity["value"]["tier"]> = {
      free: "free",
      starter: "starter",
      pro: "pro",
      enterprise: "enterprise",
    }

    return {
      id: `intercom-${contact.id}`,
      externalId: contact.id,
      source: "intercom",

      type: "person",
      name: contact.name,
      email: contact.email,

      value: {
        tier: plan ? tierMap[plan.toLowerCase()] || "unknown" : "unknown",
        mrr,
      },

      nodeCount: 0, // Would be calculated
      avgCxScore: undefined,

      createdAt: new Date(contact.created_at * 1000),
      updatedAt: new Date(contact.updated_at * 1000),
    }
  },

  normalizeTeamMember(raw: unknown): TeamMember {
    const admin = raw as IntercomAdmin

    return {
      id: `intercom-${admin.id}`,
      externalId: admin.id,
      source: "intercom",

      name: admin.name,
      email: admin.email,

      metrics: {
        nodesHandled: 0,
        cxCount: 0,
      },

      createdAt: new Date(),
      updatedAt: new Date(),
    }
  },
}

// Register the adapter
adapterRegistry.register(intercomAdapter)

export default intercomAdapter
