/**
 * Adapter Template
 *
 * Copy this file to create a new adapter.
 * Replace "template" with your adapter name (e.g., "github", "linear").
 */

import { z } from "zod"
import type { Adapter, AdapterConfig, SyncResult, Node, Entity, TeamMember } from "./types"

// ─────────────────────────────────────────────────────────────
// CONFIG SCHEMA
// ─────────────────────────────────────────────────────────────

const templateConfigSchema = z.object({
  id: z.literal("template"),
  name: z.string(),
  enabled: z.boolean(),
  credentials: z.object({
    apiKey: z.string().min(1, "API key is required"),
    // Add other required credentials
  }),
})

// ─────────────────────────────────────────────────────────────
// ADAPTER IMPLEMENTATION
// ─────────────────────────────────────────────────────────────

export const templateAdapter: Adapter = {
  id: "template",
  name: "Template",
  description: "Description of what this adapter syncs",
  icon: "Box", // Lucide icon name

  configSchema: templateConfigSchema,

  async testConnection(_config: AdapterConfig): Promise<boolean> {
    // TODO: Implement connection test
    // Make a simple API call to verify credentials work
    return false
  },

  async sync(_config: AdapterConfig): Promise<SyncResult> {
    const startTime = Date.now()
    const errors: string[] = []
    let nodesSynced = 0
    let entitiesSynced = 0
    let teamMembersSynced = 0

    try {
      // TODO: Implement sync logic
      // 1. Fetch data from the API
      // 2. Normalize to Items/Entities/TeamMembers
      // 3. Save to database

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
    // TODO: Map source data to Node type
    // This is where you translate the source's data model to ours

    const data = raw as Record<string, unknown>

    return {
      id: `template-${data.id}`,
      externalId: String(data.id),
      source: "template",

      title: String(data.title || "Untitled"),
      description: data.description as string | undefined,

      status: "open", // Map from source status
      priority: "normal", // Map from source priority

      type: "node", // e.g., "issue", "ticket", "task"
      tags: [],

      valueSignals: {
        // Extract value signals from source data
        // e.g., customer tier, MRR impact, affected users
      },

      effortSignals: {
        // Extract effort signals from source data
        // e.g., story points, time estimate, complexity
      },

      createdAt: new Date(),
      updatedAt: new Date(),
    }
  },

  normalizeEntity(raw: unknown): Entity {
    const data = raw as Record<string, unknown>

    return {
      id: `template-${data.id}`,
      externalId: String(data.id),
      source: "template",

      type: "person",
      name: data.name as string | undefined,
      email: data.email as string | undefined,

      value: {},
      nodeCount: 0,

      createdAt: new Date(),
      updatedAt: new Date(),
    }
  },

  normalizeTeamMember(raw: unknown): TeamMember {
    const data = raw as Record<string, unknown>

    return {
      id: `template-${data.id}`,
      externalId: String(data.id),
      source: "template",

      name: String(data.name || "Unknown"),
      email: String(data.email || ""),

      metrics: {
        nodesHandled: 0,
        cxCount: 0,
      },

      createdAt: new Date(),
      updatedAt: new Date(),
    }
  },
}

// Register the adapter (uncomment when ready)
// import { adapterRegistry } from "./types"
// adapterRegistry.register(templateAdapter)

export default templateAdapter
