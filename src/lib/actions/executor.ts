/**
 * Action Executor
 *
 * Evaluates conditions against nodes and executes outputs.
 */

import type { Action, Condition, ConditionGroup, Output } from "./types"
import type { Node, Entity, TeamMember } from "../adapters/types"

// ─────────────────────────────────────────────────────────────
// CONTEXT
// ─────────────────────────────────────────────────────────────

/**
 * Context for evaluating conditions
 */
export interface ExecutionContext {
  node?: Node
  entity?: Entity
  teamMember?: TeamMember
  time?: Date
  aggregates?: {
    openNodes: number
    urgentNodes: number
    affectedEntities: number
  }
}

/**
 * Result of executing an action
 */
export interface ExecutionResult {
  actionId: string
  matched: boolean
  matchedNodes: Node[]
  outputs: OutputResult[]
  error?: string
}

export interface OutputResult {
  type: Output["type"]
  success: boolean
  result?: unknown
  error?: string
}

// ─────────────────────────────────────────────────────────────
// CONDITION EVALUATION
// ─────────────────────────────────────────────────────────────

/**
 * Get a value from the context using dot notation
 */
function getValue(context: ExecutionContext, field: string): unknown {
  const parts = field.split(".")
  let value: unknown = context

  for (const part of parts) {
    if (value === null || value === undefined) return undefined
    value = (value as Record<string, unknown>)[part]
  }

  return value
}

/**
 * Evaluate a single condition
 */
function evaluateCondition(condition: Condition, context: ExecutionContext): boolean {
  const actualValue = getValue(context, condition.field)
  const expectedValue = condition.value

  switch (condition.operator) {
    case "equals":
      return actualValue === expectedValue

    case "notEquals":
      return actualValue !== expectedValue

    case "contains":
      if (Array.isArray(actualValue)) {
        return actualValue.includes(expectedValue)
      }
      if (typeof actualValue === "string" && typeof expectedValue === "string") {
        return actualValue.toLowerCase().includes(expectedValue.toLowerCase())
      }
      return false

    case "notContains":
      if (Array.isArray(actualValue)) {
        return !actualValue.includes(expectedValue)
      }
      if (typeof actualValue === "string" && typeof expectedValue === "string") {
        return !actualValue.toLowerCase().includes(expectedValue.toLowerCase())
      }
      return true

    case "greaterThan":
      return typeof actualValue === "number" && typeof expectedValue === "number"
        ? actualValue > expectedValue
        : false

    case "lessThan":
      return typeof actualValue === "number" && typeof expectedValue === "number"
        ? actualValue < expectedValue
        : false

    case "greaterThanOrEqual":
      return typeof actualValue === "number" && typeof expectedValue === "number"
        ? actualValue >= expectedValue
        : false

    case "lessThanOrEqual":
      return typeof actualValue === "number" && typeof expectedValue === "number"
        ? actualValue <= expectedValue
        : false

    case "in":
      return Array.isArray(expectedValue) && expectedValue.includes(actualValue as string)

    case "notIn":
      return Array.isArray(expectedValue) && !expectedValue.includes(actualValue as string)

    case "exists":
      return actualValue !== undefined && actualValue !== null

    case "notExists":
      return actualValue === undefined || actualValue === null

    default:
      console.warn(`Unknown operator: ${condition.operator}`)
      return false
  }
}

/**
 * Evaluate a condition group (with AND/OR logic)
 */
function evaluateConditionGroup(
  group: ConditionGroup,
  context: ExecutionContext
): boolean {
  const results = group.conditions.map((condition) => {
    if ("logic" in condition) {
      // It's a nested group
      return evaluateConditionGroup(condition as ConditionGroup, context)
    } else {
      // It's a single condition
      return evaluateCondition(condition as Condition, context)
    }
  })

  if (group.logic === "and") {
    return results.every((r) => r)
  } else {
    return results.some((r) => r)
  }
}

// ─────────────────────────────────────────────────────────────
// OUTPUT EXECUTION
// ─────────────────────────────────────────────────────────────

/**
 * Output handlers
 */
const outputHandlers: Record<
  Output["type"],
  (config: Record<string, unknown>, context: ExecutionContext) => Promise<OutputResult>
> = {
  async focus(config, _context) {
    // Would add to focus items in DB
    return {
      type: "focus",
      success: true,
      result: { priority: config.priority, reason: config.reason },
    }
  },

  async notify(config, _context) {
    // Would send notification via configured channel
    console.log(`[Notify] ${config.channel}: ${config.message}`)
    return {
      type: "notify",
      success: true,
      result: { channel: config.channel, message: config.message },
    }
  },

  async tag(config, context) {
    // Would add tag to the node
    const tag = config.tag as string
    if (context.node) {
      context.node.tags = [...(context.node.tags || []), tag]
    }
    return {
      type: "tag",
      success: true,
      result: { tag },
    }
  },

  async assign(config, _context) {
    // Would assign to team member
    return {
      type: "assign",
      success: true,
      result: { assignee: config.assignee },
    }
  },

  async escalate(config, context) {
    // Would update priority
    if (context.node) {
      context.node.priority = config.to as Node["priority"]
    }
    return {
      type: "escalate",
      success: true,
      result: { to: config.to },
    }
  },

  async slack(config, _context) {
    // Would send to Slack webhook
    console.log(`[Slack] #${config.channel}: ${config.message}`)
    return {
      type: "slack",
      success: true,
      result: { channel: config.channel, message: config.message },
    }
  },

  async webhook(config, context) {
    // Would call external webhook
    try {
      const response = await fetch(config.url as string, {
        method: (config.method as string) || "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ node: context.node, entity: context.entity }),
      })
      return {
        type: "webhook",
        success: response.ok,
        result: { status: response.status },
      }
    } catch (error) {
      return {
        type: "webhook",
        success: false,
        error: String(error),
      }
    }
  },

  async neuphlo(config, _context) {
    // Would trigger Neuphlo workflow
    return {
      type: "neuphlo",
      success: true,
      result: { workflowId: config.workflowId },
    }
  },

  async log(config, _context) {
    // Would log event
    console.log(`[${config.level}] ${config.message}`)
    return {
      type: "log",
      success: true,
      result: { level: config.level, message: config.message },
    }
  },
}

/**
 * Execute all outputs for an action
 */
async function executeOutputs(
  outputs: Output[],
  context: ExecutionContext
): Promise<OutputResult[]> {
  const results: OutputResult[] = []

  for (const output of outputs) {
    const handler = outputHandlers[output.type]
    if (handler) {
      const result = await handler(output.config as Record<string, unknown>, context)
      results.push(result)
    } else {
      results.push({
        type: output.type,
        success: false,
        error: `Unknown output type: ${output.type}`,
      })
    }
  }

  return results
}

// ─────────────────────────────────────────────────────────────
// MAIN EXECUTION
// ─────────────────────────────────────────────────────────────

/**
 * Execute an action against a set of nodes
 */
export async function executeAction(
  action: Action,
  nodes: Node[],
  entities: Map<string, Entity>,
  aggregates?: ExecutionContext["aggregates"]
): Promise<ExecutionResult> {
  const matchedNodes: Node[] = []
  const allOutputResults: OutputResult[] = []

  for (const node of nodes) {
    // Build context for this node
    const context: ExecutionContext = {
      node,
      entity: node.createdBy?.id ? entities.get(node.createdBy.id) : undefined,
      time: new Date(),
      aggregates,
    }

    // Evaluate conditions
    const matched = evaluateConditionGroup(action.conditions, context)

    if (matched) {
      matchedNodes.push(node)

      // Execute outputs
      const outputResults = await executeOutputs(action.outputs, context)
      allOutputResults.push(...outputResults)
    }
  }

  return {
    actionId: action.id,
    matched: matchedNodes.length > 0,
    matchedNodes,
    outputs: allOutputResults,
  }
}

/**
 * Check if an action should run based on schedule and cooldown
 */
export function shouldRunAction(action: Action): boolean {
  if (!action.enabled) return false

  const now = new Date()

  // Check cooldown
  if (action.lastFiredAt) {
    const cooldownMs = action.cooldownMinutes * 60 * 1000
    const timeSinceFired = now.getTime() - action.lastFiredAt.getTime()
    if (timeSinceFired < cooldownMs) {
      return false
    }
  }

  // Check max fires per day
  if (action.maxFiresPerDay !== undefined) {
    // Would need to track fires per day in DB
    // For now, just check fire count
    if (action.fireCount >= action.maxFiresPerDay) {
      return false
    }
  }

  // Check schedule (simplified)
  switch (action.schedule) {
    case "realtime":
      return true
    case "hourly":
      // Would check if it's been an hour
      return true
    case "daily":
      // Would check if it's a new day
      return true
    case "weekly":
      // Would check if it's a new week
      return true
    default:
      return true
  }
}

// ─────────────────────────────────────────────────────────────
// BATCH EXECUTION
// ─────────────────────────────────────────────────────────────

/**
 * Run all enabled actions against new/updated nodes
 */
export async function runActions(
  actions: Action[],
  nodes: Node[],
  entities: Map<string, Entity>
): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = []

  // Calculate aggregates
  const aggregates = {
    openNodes: nodes.filter((n) => n.status === "open").length,
    urgentNodes: nodes.filter((n) => n.priority === "urgent").length,
    affectedEntities: entities.size,
  }

  for (const action of actions) {
    if (shouldRunAction(action)) {
      const result = await executeAction(action, nodes, entities, aggregates)
      results.push(result)
    }
  }

  return results
}
