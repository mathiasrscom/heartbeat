/**
 * Heartbeat Core Types
 *
 * These types define the normalized data model that all adapters
 * must conform to. The 80/20 scoring engine works on these types,
 * regardless of where the data came from.
 */

import { z } from "zod"

// ─────────────────────────────────────────────────────────────
// CORE NODE - The universal unit of work (aligned with Neuphlo)
// ─────────────────────────────────────────────────────────────

/**
 * A Node is anything that can be prioritized:
 * - Support ticket (Intercom, Zendesk)
 * - Issue (GitHub, Linear, Jira)
 * - Task (Asana, Notion)
 * - Feature request (Productboard, Canny)
 * - Node (Neuphlo)
 */
export const NodeSchema = z.object({
  id: z.string(),
  externalId: z.string(),
  source: z.string(), // "intercom", "github", "linear", "neuphlo", etc.

  // Core fields
  title: z.string(),
  description: z.string().optional(),
  bodyPreview: z.string().optional(),

  // Status
  status: z.enum(["open", "in_progress", "pending", "resolved", "closed"]),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),

  // Categorization
  type: z.string().optional(), // "bug", "feature", "question", "task", etc.
  tags: z.array(z.string()).default([]),

  // People
  createdBy: z.object({
    id: z.string(),
    name: z.string().optional(),
    email: z.string().optional(),
  }).optional(),
  assignee: z.object({
    id: z.string(),
    name: z.string().optional(),
  }).optional(),

  // Value signals (for scoring)
  valueSignals: z.object({
    customerValue: z.number().optional(),    // MRR, plan tier weight, etc.
    affectedCount: z.number().optional(),    // How many people affected
    recurrence: z.number().optional(),       // How often this happens
    sentiment: z.enum(["positive", "neutral", "negative"]).optional(),
    cxScore: z.number().optional(),          // 1-10 score if available
  }).default({}),

  // Effort signals (for scoring)
  effortSignals: z.object({
    estimatedMinutes: z.number().optional(),
    complexity: z.enum(["trivial", "simple", "medium", "complex", "massive"]).optional(),
    dependencies: z.number().optional(),     // Number of blockers
  }).default({}),

  // Timestamps
  createdAt: z.date(),
  updatedAt: z.date(),
  resolvedAt: z.date().optional(),

  // Response metrics
  responseTimeMinutes: z.number().optional(),
  resolutionTimeHours: z.number().optional(),

  // Raw data from source (for debugging/advanced use)
  rawData: z.record(z.unknown()).optional(),
})

export type Node = z.infer<typeof NodeSchema>

// ─────────────────────────────────────────────────────────────
// ENTITY - People and organizations
// ─────────────────────────────────────────────────────────────

export const EntitySchema = z.object({
  id: z.string(),
  externalId: z.string(),
  source: z.string(),

  type: z.enum(["person", "organization", "team"]),

  name: z.string().optional(),
  email: z.string().optional(),

  // Value metrics
  value: z.object({
    tier: z.enum(["free", "starter", "pro", "enterprise", "unknown"]).optional(),
    mrr: z.number().optional(),
    lifetimeValue: z.number().optional(),
  }).default({}),

  // Engagement
  nodeCount: z.number().default(0),
  avgCxScore: z.number().optional(),

  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Entity = z.infer<typeof EntitySchema>

// ─────────────────────────────────────────────────────────────
// TEAM MEMBER - Internal users
// ─────────────────────────────────────────────────────────────

export const TeamMemberSchema = z.object({
  id: z.string(),
  externalId: z.string(),
  source: z.string(),

  name: z.string(),
  email: z.string(),
  avatarUrl: z.string().optional(),
  role: z.string().optional(),

  // Performance
  metrics: z.object({
    nodesHandled: z.number().default(0),
    avgResponseTime: z.number().optional(),
    avgResolutionTime: z.number().optional(),
    avgCxScore: z.number().optional(),
    cxCount: z.number().default(0),
  }).default({}),

  createdAt: z.date(),
  updatedAt: z.date(),
})

export type TeamMember = z.infer<typeof TeamMemberSchema>

// ─────────────────────────────────────────────────────────────
// ADAPTER INTERFACE
// ─────────────────────────────────────────────────────────────

export interface AdapterConfig {
  id: string
  name: string
  enabled: boolean
  credentials: Record<string, string>
}

export interface SyncResult {
  success: boolean
  nodesSynced: number
  entitiesSynced: number
  teamMembersSynced: number
  errors: string[]
  duration: number
}

export interface Adapter {
  // Metadata
  id: string
  name: string
  description: string
  icon: string // Lucide icon name

  // Configuration
  configSchema: z.ZodSchema // What credentials/settings are needed

  // Connection
  testConnection(config: AdapterConfig): Promise<boolean>

  // Sync
  sync(config: AdapterConfig): Promise<SyncResult>

  // Normalize - convert source data to our types
  normalizeNode(raw: unknown): Node
  normalizeEntity(raw: unknown): Entity
  normalizeTeamMember(raw: unknown): TeamMember
}

// ─────────────────────────────────────────────────────────────
// ADAPTER REGISTRY
// ─────────────────────────────────────────────────────────────

export interface AdapterRegistry {
  adapters: Map<string, Adapter>

  register(adapter: Adapter): void
  get(id: string): Adapter | undefined
  list(): Adapter[]
}

export function createAdapterRegistry(): AdapterRegistry {
  const adapters = new Map<string, Adapter>()

  return {
    adapters,

    register(adapter: Adapter) {
      adapters.set(adapter.id, adapter)
    },

    get(id: string) {
      return adapters.get(id)
    },

    list() {
      return Array.from(adapters.values())
    },
  }
}

// Global registry instance
export const adapterRegistry = createAdapterRegistry()
