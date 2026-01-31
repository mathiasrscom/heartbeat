/**
 * Action Parser
 *
 * Converts natural language into structured action rules.
 * Uses AI to understand intent and extract conditions/outputs.
 */

import type { ParseResult, ConditionGroup, Output, ActionCategory } from "./types"
import { actionCategories, outputTypes } from "./types"

// ─────────────────────────────────────────────────────────────
// PARSER PROMPT
// ─────────────────────────────────────────────────────────────

const PARSER_SYSTEM_PROMPT = `You are a rule parser for Heartbeat, a CX intelligence platform.
Your job is to convert natural language rules into structured JSON.

Available fields for conditions:
- node.status: open, pending, resolved, closed
- node.priority: low, normal, high, urgent
- node.type: conversation, issue, ticket, task
- node.tags: array of strings
- node.sentiment: positive, neutral, negative
- node.cxScore: 1-10
- node.impactScore: 0-100
- node.responseTimeMinutes: number
- node.source: intercom, github, linear, etc.
- entity.type: person, company, organization
- entity.value.tier: free, starter, pro, enterprise
- entity.value.mrr: number (monthly recurring revenue)
- entity.nodeCount: number of open items
- time.hourOfDay: 0-23
- time.dayOfWeek: 0-6 (0=Sunday)
- time.isBusinessHours: boolean
- count.openNodes: total open items
- count.urgentNodes: urgent priority items

Available operators:
- equals, notEquals
- contains, notContains (for strings/arrays)
- greaterThan, lessThan, greaterThanOrEqual, lessThanOrEqual (for numbers)
- in, notIn (for checking against lists)
- exists, notExists

Available output types:
- focus: Add to focus list (config: { priority: 1-10, reason: string })
- notify: Send notification (config: { channel: "email" | "push", message: string })
- tag: Add tag (config: { tag: string })
- assign: Assign to team member (config: { assignee: string | "auto" })
- escalate: Increase priority (config: { to: "high" | "urgent" })
- slack: Send to Slack (config: { channel: string, message: string })
- webhook: Call URL (config: { url: string, method: string })
- neuphlo: Trigger workflow (config: { workflowId: string })
- log: Log event (config: { level: string, message: string })

Categories:
- focus_rule: Affects what appears in the Focus view
- alert: Triggers notifications/alerts
- automation: Automated actions (tagging, assigning, etc.)
- metric: Custom metric definitions
- filter: Saved filters/views

Respond with valid JSON only. No markdown, no explanation.`

// ─────────────────────────────────────────────────────────────
// PARSE FUNCTION
// ─────────────────────────────────────────────────────────────

interface AIProvider {
  chat(messages: { role: string; content: string }[]): Promise<string>
}

/**
 * Parse natural language into an action
 */
export async function parseAction(
  input: string,
  ai: AIProvider
): Promise<ParseResult> {
  try {
    const userPrompt = `Parse this rule into structured JSON:

"${input}"

Return JSON with this structure:
{
  "name": "short descriptive name",
  "description": "what this rule does",
  "category": "focus_rule" | "alert" | "automation" | "metric" | "filter",
  "conditions": {
    "logic": "and" | "or",
    "conditions": [
      { "field": "...", "operator": "...", "value": ... }
    ]
  },
  "outputs": [
    { "type": "...", "config": { ... } }
  ],
  "schedule": "realtime" | "hourly" | "daily" | "weekly",
  "confidence": 0.0-1.0
}`

    const response = await ai.chat([
      { role: "system", content: PARSER_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ])

    // Parse the JSON response
    const parsed = JSON.parse(response)

    // Validate the parsed result
    const validation = validateParsedAction(parsed)
    if (!validation.valid) {
      return {
        success: false,
        confidence: 0,
        error: validation.error,
        suggestions: validation.suggestions,
      }
    }

    return {
      success: true,
      action: {
        originalInput: input,
        name: parsed.name,
        description: parsed.description,
        category: parsed.category as ActionCategory,
        conditions: parsed.conditions,
        outputs: parsed.outputs,
        schedule: parsed.schedule || "realtime",
        enabled: true,
        fireCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      confidence: parsed.confidence || 0.8,
    }
  } catch (error) {
    return {
      success: false,
      confidence: 0,
      error: `Failed to parse: ${error}`,
      suggestions: [
        "Try being more specific about the condition",
        "Specify what should happen when the condition is met",
        'Example: "Alert me when enterprise customers have negative sentiment"',
      ],
    }
  }
}

// ─────────────────────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────────────────────

interface ValidationResult {
  valid: boolean
  error?: string
  suggestions?: string[]
}

function validateParsedAction(parsed: unknown): ValidationResult {
  if (!parsed || typeof parsed !== "object") {
    return { valid: false, error: "Invalid response format" }
  }

  const obj = parsed as Record<string, unknown>

  // Check required fields
  if (!obj.name || typeof obj.name !== "string") {
    return { valid: false, error: "Missing or invalid name" }
  }

  if (!obj.category || !actionCategories.includes(obj.category as ActionCategory)) {
    return {
      valid: false,
      error: `Invalid category. Must be one of: ${actionCategories.join(", ")}`,
    }
  }

  if (!obj.conditions || typeof obj.conditions !== "object") {
    return { valid: false, error: "Missing or invalid conditions" }
  }

  if (!obj.outputs || !Array.isArray(obj.outputs) || obj.outputs.length === 0) {
    return {
      valid: false,
      error: "Missing outputs. What should happen when conditions match?",
      suggestions: ["Add what action to take, e.g., 'alert me', 'add to focus', 'notify Slack'"],
    }
  }

  // Validate outputs
  for (const output of obj.outputs as Output[]) {
    if (!output.type || !outputTypes.includes(output.type)) {
      return {
        valid: false,
        error: `Invalid output type: ${output.type}`,
        suggestions: [`Valid types: ${outputTypes.join(", ")}`],
      }
    }
  }

  return { valid: true }
}

// ─────────────────────────────────────────────────────────────
// LOCAL PARSER (fallback when AI unavailable)
// ─────────────────────────────────────────────────────────────

/**
 * Simple pattern-based parser for common rules
 * Used as fallback when AI is not available
 */
export function parseActionLocal(input: string): ParseResult {
  const lower = input.toLowerCase()

  // Pattern: "alert/notify when X"
  const alertMatch = lower.match(/^(alert|notify)\s+(me\s+)?(when|if)\s+(.+)$/i)
  if (alertMatch) {
    const condition = alertMatch[4]
    return parseConditionPhrase(condition, "alert", "notify")
  }

  // Pattern: "focus on X"
  const focusMatch = lower.match(/^focus\s+on\s+(.+)$/i)
  if (focusMatch) {
    const condition = focusMatch[1]
    return parseConditionPhrase(condition, "focus_rule", "focus")
  }

  // Pattern: "auto-tag X as Y"
  const tagMatch = lower.match(/^auto[- ]?tag\s+(.+)\s+as\s+(.+)$/i)
  if (tagMatch) {
    return {
      success: true,
      action: {
        originalInput: input,
        name: `Auto-tag: ${tagMatch[2]}`,
        category: "automation",
        conditions: parseSimpleCondition(tagMatch[1]),
        outputs: [{ type: "tag", config: { tag: tagMatch[2].trim() } }],
        schedule: "realtime",
      },
      confidence: 0.7,
    }
  }

  // Pattern: "escalate X"
  const escalateMatch = lower.match(/^escalate\s+(.+)$/i)
  if (escalateMatch) {
    return {
      success: true,
      action: {
        originalInput: input,
        name: "Auto-escalate",
        category: "automation",
        conditions: parseSimpleCondition(escalateMatch[1]),
        outputs: [{ type: "escalate", config: { to: "urgent" } }],
        schedule: "realtime",
      },
      confidence: 0.7,
    }
  }

  return {
    success: false,
    confidence: 0,
    error: "Could not parse rule. Try a simpler format.",
    suggestions: [
      'Try: "Alert me when [condition]"',
      'Try: "Focus on [condition]"',
      'Try: "Auto-tag [condition] as [tag]"',
    ],
  }
}

function parseConditionPhrase(
  phrase: string,
  category: ActionCategory,
  outputType: "notify" | "focus"
): ParseResult {
  const conditions = parseSimpleCondition(phrase)

  const output: Output =
    outputType === "notify"
      ? { type: "notify", config: { channel: "push", message: `Rule triggered: ${phrase}` } }
      : { type: "focus", config: { priority: 8, reason: phrase } }

  return {
    success: true,
    action: {
      originalInput: phrase,
      name: `${category === "alert" ? "Alert" : "Focus"}: ${phrase.slice(0, 30)}...`,
      category,
      conditions,
      outputs: [output],
      schedule: "realtime",
    },
    confidence: 0.6,
  }
}

function parseSimpleCondition(phrase: string): ConditionGroup {
  const lower = phrase.toLowerCase()
  const conditions: ConditionGroup = { logic: "and", conditions: [] }

  // Enterprise/tier detection
  if (lower.includes("enterprise")) {
    conditions.conditions.push({
      field: "entity.value.tier",
      operator: "equals",
      value: "enterprise",
    })
  }

  // MRR detection
  const mrrMatch = lower.match(/mrr\s*(over|above|>|greater than)\s*\$?(\d+)/i)
  if (mrrMatch) {
    conditions.conditions.push({
      field: "entity.value.mrr",
      operator: "greaterThan",
      value: parseInt(mrrMatch[2]),
    })
  }

  // Sentiment detection
  if (lower.includes("negative sentiment") || lower.includes("unhappy")) {
    conditions.conditions.push({
      field: "node.sentiment",
      operator: "equals",
      value: "negative",
    })
  }

  // Priority detection
  if (lower.includes("urgent")) {
    conditions.conditions.push({
      field: "node.priority",
      operator: "equals",
      value: "urgent",
    })
  }

  // Open ticket count
  const countMatch = lower.match(/more than\s*(\d+)\s*(open\s*)?(ticket|node|item)/i)
  if (countMatch) {
    conditions.conditions.push({
      field: "entity.nodeCount",
      operator: "greaterThan",
      value: parseInt(countMatch[1]),
    })
  }

  // Response time
  const timeMatch = lower.match(/response time\s*(over|exceeds|>)\s*(\d+)\s*(hour|minute)/i)
  if (timeMatch) {
    const value = timeMatch[3].includes("hour")
      ? parseInt(timeMatch[2]) * 60
      : parseInt(timeMatch[2])
    conditions.conditions.push({
      field: "node.responseTimeMinutes",
      operator: "greaterThan",
      value,
    })
  }

  // If no conditions detected, add a generic one
  if (conditions.conditions.length === 0) {
    conditions.conditions.push({
      field: "node.status",
      operator: "equals",
      value: "open",
    })
  }

  return conditions
}

// ─────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────

export { PARSER_SYSTEM_PROMPT }
