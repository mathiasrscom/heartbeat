/**
 * Heartbeat Action System
 *
 * Actions are user-configurable rules created via natural language.
 * The AI parses user input into structured actions that BullMQ executes.
 *
 * Flow:
 *   User: "Alert me when 3+ tickets mention billing in an hour"
 *     ↓
 *   TanStack AI parses → Action object
 *     ↓
 *   Stored in TanStack DB
 *     ↓
 *   BullMQ evaluates on schedule
 *     ↓
 *   When triggered → outputs fire (Slack, email, Neuphlo, etc.)
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// ACTION TYPES
// ─────────────────────────────────────────────────────────────

export type ActionType =
  | "focus_rule" // Affects prioritization
  | "trigger" // Fires when condition met
  | "automation" // Does something automatically
  | "metric" // Custom measurement
  | "filter"; // Excludes from focus

// ─────────────────────────────────────────────────────────────
// CONDITIONS (the "when" part)
// ─────────────────────────────────────────────────────────────

export const ConditionOperator = z.enum([
  "equals",
  "not_equals",
  "greater_than",
  "less_than",
  "contains",
  "not_contains",
  "matches_regex",
  "in_list",
  "not_in_list",
]);

export const ConditionField = z.enum([
  // Ticket/conversation fields
  "ticket_count",
  "ticket_subject",
  "ticket_body",
  "ticket_tags",
  "ticket_priority",
  "ticket_status",
  "ticket_age_hours",

  // Customer fields
  "customer_plan",
  "customer_mrr",
  "customer_tenure_days",
  "customer_name",
  "customer_company",

  // CX metrics
  "csat_score",
  "response_time_minutes",
  "resolution_time_hours",

  // Team fields
  "assignee",
  "team",

  // Time-based
  "time_window_hours",
  "day_of_week",
  "hour_of_day",
]);

export const ConditionSchema = z.object({
  field: ConditionField,
  operator: ConditionOperator,
  value: z.union([z.string(), z.number(), z.array(z.string())]),

  // For aggregations: "3+ tickets" → count condition
  aggregation: z
    .enum(["count", "sum", "avg", "min", "max"])
    .optional(),
  timeWindowHours: z.number().optional(), // "in the last 2 hours"
});

export type Condition = z.infer<typeof ConditionSchema>;

// Conditions can be combined with AND/OR
export const ConditionGroupSchema: z.ZodType<ConditionGroup> = z.object({
  operator: z.enum(["and", "or"]),
  conditions: z.array(
    z.union([ConditionSchema, z.lazy(() => ConditionGroupSchema)])
  ),
});

export type ConditionGroup = {
  operator: "and" | "or";
  conditions: (Condition | ConditionGroup)[];
};

// ─────────────────────────────────────────────────────────────
// OUTPUTS (the "then" part)
// ─────────────────────────────────────────────────────────────

export const OutputType = z.enum([
  // Notifications
  "slack_message",
  "email",
  "push_notification",
  "in_app_alert",

  // Integrations
  "create_neuphlo_node",
  "create_linear_issue",
  "create_github_issue",

  // Internal
  "boost_priority", // Increase focus score
  "assign_to", // Suggest assignee
  "add_tag", // Tag for tracking
  "log_metric", // Record custom metric
]);

export const OutputSchema = z.object({
  type: OutputType,

  // Configuration varies by output type
  config: z.record(z.unknown()),

  // Template for dynamic content (uses {{variables}})
  messageTemplate: z.string().optional(),
});

export type Output = z.infer<typeof OutputSchema>;

// ─────────────────────────────────────────────────────────────
// ACTION (the full rule)
// ─────────────────────────────────────────────────────────────

export const ActionSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
  createdBy: z.string(), // User ID

  // User's original natural language input
  originalInput: z.string(),

  // Parsed structured data
  name: z.string(), // AI-generated short name
  description: z.string(), // AI-generated description
  type: z.enum(["focus_rule", "trigger", "automation", "metric", "filter"]),

  // The rule logic
  conditions: z.union([ConditionSchema, ConditionGroupSchema]),
  outputs: z.array(OutputSchema),

  // Execution settings
  enabled: z.boolean().default(true),
  schedule: z
    .enum([
      "realtime", // Check every cycle (5 min)
      "hourly",
      "daily",
      "weekly",
    ])
    .default("realtime"),

  // Rate limiting
  cooldownMinutes: z.number().default(60), // Don't fire again within X minutes
  maxFiresPerDay: z.number().optional(),

  // Tracking
  lastFiredAt: z.date().optional(),
  fireCount: z.number().default(0),
});

export type Action = z.infer<typeof ActionSchema>;

// ─────────────────────────────────────────────────────────────
// NATURAL LANGUAGE PARSING
// ─────────────────────────────────────────────────────────────

/**
 * Examples of natural language → structured action:
 *
 * "Alert me when enterprise CSAT drops below 8"
 * → {
 *     type: "trigger",
 *     conditions: {
 *       operator: "and",
 *       conditions: [
 *         { field: "customer_plan", operator: "equals", value: "enterprise" },
 *         { field: "csat_score", operator: "less_than", value: 8 }
 *       ]
 *     },
 *     outputs: [{ type: "in_app_alert", config: {} }]
 *   }
 *
 * "Prioritize tickets from customers paying over $1000/mo"
 * → {
 *     type: "focus_rule",
 *     conditions: {
 *       field: "customer_mrr",
 *       operator: "greater_than",
 *       value: 1000
 *     },
 *     outputs: [{ type: "boost_priority", config: { boost: 2.0 } }]
 *   }
 *
 * "When 3+ tickets mention 'billing' in 2 hours, create a Neuphlo node"
 * → {
 *     type: "automation",
 *     conditions: {
 *       field: "ticket_body",
 *       operator: "contains",
 *       value: "billing",
 *       aggregation: "count",
 *       timeWindowHours: 2,
 *       // Implicitly: count >= 3
 *     },
 *     outputs: [{
 *       type: "create_neuphlo_node",
 *       config: { nodeType: "issue_cluster" },
 *       messageTemplate: "{{count}} tickets about billing in the last 2 hours"
 *     }]
 *   }
 *
 * "Ignore tickets tagged 'spam'"
 * → {
 *     type: "filter",
 *     conditions: {
 *       field: "ticket_tags",
 *       operator: "contains",
 *       value: "spam"
 *     },
 *     outputs: [] // Filters just exclude, no output needed
 *   }
 *
 * "Track average response time for VIP customers"
 * → {
 *     type: "metric",
 *     conditions: {
 *       field: "customer_plan",
 *       operator: "in_list",
 *       value: ["enterprise", "vip"]
 *     },
 *     outputs: [{
 *       type: "log_metric",
 *       config: {
 *         metricName: "vip_response_time",
 *         metricField: "response_time_minutes",
 *         aggregation: "avg"
 *       }
 *     }]
 *   }
 */

// ─────────────────────────────────────────────────────────────
// AI PARSING PROMPT (for TanStack AI)
// ─────────────────────────────────────────────────────────────

export const ACTION_PARSER_SYSTEM_PROMPT = `
You are an action parser for Heartbeat, a CX intelligence platform.

Your job is to convert natural language rules into structured Action objects.

## Action Types:
- focus_rule: Affects how items are prioritized (boost/demote)
- trigger: Fires an alert when condition is met
- automation: Does something automatically when condition is met
- metric: Tracks a custom measurement
- filter: Excludes items from focus/reports

## Available Condition Fields:
- ticket_count, ticket_subject, ticket_body, ticket_tags, ticket_priority, ticket_status, ticket_age_hours
- customer_plan, customer_mrr, customer_tenure_days, customer_name, customer_company
- csat_score, response_time_minutes, resolution_time_hours
- assignee, team
- time_window_hours, day_of_week, hour_of_day

## Available Outputs:
- slack_message, email, push_notification, in_app_alert
- create_neuphlo_node, create_linear_issue, create_github_issue
- boost_priority, assign_to, add_tag, log_metric

## Guidelines:
1. Infer the action type from context
2. Parse conditions carefully - handle aggregations ("3+ tickets")
3. Set sensible defaults for cooldown (don't spam alerts)
4. Generate a clear name and description
5. If ambiguous, ask for clarification

Return a valid Action object (without id, createdAt, updatedAt - those are added by the system).
`;

// ─────────────────────────────────────────────────────────────
// ACTION EXECUTION RESULT
// ─────────────────────────────────────────────────────────────

export const ActionExecutionResultSchema = z.object({
  actionId: z.string().uuid(),
  executedAt: z.date(),
  triggered: z.boolean(),

  // What matched
  matchedItems: z
    .array(
      z.object({
        type: z.enum(["ticket", "conversation", "customer"]),
        id: z.string(),
      })
    )
    .optional(),

  // What outputs fired
  outputResults: z.array(
    z.object({
      outputType: OutputType,
      success: z.boolean(),
      error: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    })
  ),
});

export type ActionExecutionResult = z.infer<typeof ActionExecutionResultSchema>;
