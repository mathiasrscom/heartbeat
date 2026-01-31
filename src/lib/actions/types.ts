/**
 * Action Builder Types
 *
 * Defines the structure of user-configurable rules.
 * Users write natural language, which gets parsed into these structures.
 */

import { z } from "zod"

// ─────────────────────────────────────────────────────────────
// CONDITION TYPES
// ─────────────────────────────────────────────────────────────

/**
 * Field types that can be used in conditions
 */
export const fieldTypes = [
  // Node fields
  "node.status",
  "node.priority",
  "node.type",
  "node.tags",
  "node.sentiment",
  "node.cxScore",
  "node.impactScore",
  "node.effortScore",
  "node.responseTimeMinutes",
  "node.source",

  // Entity fields
  "entity.type",
  "entity.value.tier",
  "entity.value.mrr",
  "entity.nodeCount",

  // Time fields
  "time.hourOfDay",
  "time.dayOfWeek",
  "time.isBusinessHours",

  // Aggregate fields
  "count.openNodes",
  "count.urgentNodes",
  "count.affectedEntities",
] as const

export type FieldType = (typeof fieldTypes)[number]

/**
 * Operators for conditions
 */
export const operators = [
  "equals",
  "notEquals",
  "contains",
  "notContains",
  "greaterThan",
  "lessThan",
  "greaterThanOrEqual",
  "lessThanOrEqual",
  "in",
  "notIn",
  "exists",
  "notExists",
] as const

export type Operator = (typeof operators)[number]

/**
 * A single condition
 */
export const ConditionSchema = z.object({
  field: z.string(),
  operator: z.enum(operators),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
})

export type Condition = z.infer<typeof ConditionSchema>

/**
 * Condition group with AND/OR logic
 */
export const ConditionGroupSchema: z.ZodType<ConditionGroup> = z.lazy(() =>
  z.object({
    logic: z.enum(["and", "or"]),
    conditions: z.array(z.union([ConditionSchema, ConditionGroupSchema])),
  })
)

export interface ConditionGroup {
  logic: "and" | "or"
  conditions: (Condition | ConditionGroup)[]
}

// ─────────────────────────────────────────────────────────────
// OUTPUT TYPES
// ─────────────────────────────────────────────────────────────

/**
 * Output types define what happens when conditions match
 */
export const outputTypes = [
  "focus",           // Add to focus list with priority
  "notify",          // Send notification
  "tag",             // Add tag to node
  "assign",          // Assign to team member
  "escalate",        // Escalate priority
  "slack",           // Send to Slack
  "webhook",         // Call webhook
  "neuphlo",         // Trigger Neuphlo workflow
  "log",             // Log for reporting
] as const

export type OutputType = (typeof outputTypes)[number]

export const OutputSchema = z.object({
  type: z.enum(outputTypes),
  config: z.record(z.unknown()),
})

export type Output = z.infer<typeof OutputSchema>

// ─────────────────────────────────────────────────────────────
// ACTION TYPES
// ─────────────────────────────────────────────────────────────

/**
 * Action categories
 */
export const actionCategories = [
  "focus_rule",      // Affects what shows in Focus view
  "alert",           // Triggers notifications
  "automation",      // Automated actions
  "metric",          // Defines custom metrics
  "filter",          // Filters/views
] as const

export type ActionCategory = (typeof actionCategories)[number]

/**
 * Schedule types
 */
export const scheduleTypes = [
  "realtime",        // Run on every sync
  "hourly",          // Run every hour
  "daily",           // Run once per day
  "weekly",          // Run once per week
  "cron",            // Custom cron expression
] as const

export type ScheduleType = (typeof scheduleTypes)[number]

/**
 * Complete Action definition
 */
export const ActionSchema = z.object({
  id: z.string(),

  // User input
  originalInput: z.string(),
  name: z.string(),
  description: z.string().optional(),

  // Category
  category: z.enum(actionCategories),

  // Parsed structure
  conditions: ConditionGroupSchema,
  outputs: z.array(OutputSchema),

  // Scheduling
  schedule: z.enum(scheduleTypes).default("realtime"),
  cronExpression: z.string().optional(),

  // Rate limiting
  cooldownMinutes: z.number().default(60),
  maxFiresPerDay: z.number().optional(),

  // State
  enabled: z.boolean().default(true),
  lastFiredAt: z.date().optional(),
  fireCount: z.number().default(0),

  // Timestamps
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Action = z.infer<typeof ActionSchema>

// ─────────────────────────────────────────────────────────────
// PARSE RESULT
// ─────────────────────────────────────────────────────────────

/**
 * Result from parsing natural language
 */
export interface ParseResult {
  success: boolean
  action?: Partial<Action>
  confidence: number
  suggestions?: string[]
  error?: string
}

// ─────────────────────────────────────────────────────────────
// EXAMPLE ACTIONS
// ─────────────────────────────────────────────────────────────

export const exampleActions = [
  {
    input: "Alert me when an enterprise customer has more than 3 open tickets",
    category: "alert",
    description: "High-value customer attention needed",
  },
  {
    input: "Focus on negative sentiment tickets from customers with MRR over $1000",
    category: "focus_rule",
    description: "Prioritize unhappy high-value customers",
  },
  {
    input: "Notify Slack #cx-alerts when response time exceeds 4 hours",
    category: "alert",
    description: "SLA breach warning",
  },
  {
    input: "Auto-tag tickets mentioning 'bug' or 'broken' as potential bugs",
    category: "automation",
    description: "Automatic bug detection",
  },
  {
    input: "Escalate tickets that have been open for more than 24 hours",
    category: "automation",
    description: "Prevent tickets from going stale",
  },
  {
    input: "Every morning, show me the top 5 items by impact score",
    category: "focus_rule",
    description: "Daily focus brief",
  },
]
