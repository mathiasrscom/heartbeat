/**
 * Widget System Types (inspired by MCP UI)
 *
 * Adapters declare what widgets they can provide.
 * The UI queries available widgets and renders them dynamically.
 * Only shows relevant metrics based on connected sources.
 */

// ─────────────────────────────────────────────────────────────
// WIDGET TYPES
// ─────────────────────────────────────────────────────────────

/**
 * Base widget types that can be rendered
 */
export type WidgetType =
  | "stat"           // Single value with label
  | "gauge"          // Score with visual indicator (0-10, 0-100)
  | "trend"          // Value with trend arrow
  | "sparkline"      // Mini line chart
  | "pie"            // Pie/donut chart
  | "bar"            // Bar chart
  | "list"           // List of items
  | "table"          // Data table
  | "alert"          // Alert/warning card
  | "custom"         // Custom React component

/**
 * Widget size options
 */
export type WidgetSize = "xs" | "sm" | "md" | "lg" | "xl"

/**
 * Widget declaration - what an adapter can provide
 */
export interface WidgetDeclaration {
  id: string
  source: string           // Which adapter provides this
  type: WidgetType

  // Display
  label: string
  description?: string
  icon?: string            // Lucide icon name

  // Layout
  size?: WidgetSize        // Default size
  minSize?: WidgetSize
  maxSize?: WidgetSize

  // Data
  dataKey: string          // Key to fetch data
  refreshInterval?: number // Auto-refresh in ms

  // Visibility
  priority?: number        // Higher = more important
  category?: string        // Group widgets by category
  requiredFields?: string[] // Only show if these fields exist in data
}

/**
 * Widget data - actual values to display
 */
export interface WidgetData {
  widgetId: string
  value: unknown
  label?: string
  subtitle?: string
  trend?: {
    direction: "up" | "down" | "flat"
    value: number
    label?: string
  }
  series?: Array<{ label: string; value: number }>
  items?: Array<{ id: string; label: string; value?: unknown }>
  metadata?: Record<string, unknown>
  updatedAt: Date
}

/**
 * Widget instance - declaration + data
 */
export interface Widget {
  declaration: WidgetDeclaration
  data: WidgetData | null
  loading: boolean
  error?: string
}

// ─────────────────────────────────────────────────────────────
// WIDGET REGISTRY
// ─────────────────────────────────────────────────────────────

/**
 * Registry of available widgets from all adapters
 */
export interface WidgetRegistry {
  widgets: Map<string, WidgetDeclaration>

  register(widget: WidgetDeclaration): void
  unregister(widgetId: string): void
  get(widgetId: string): WidgetDeclaration | undefined
  list(): WidgetDeclaration[]
  listBySource(source: string): WidgetDeclaration[]
  listByCategory(category: string): WidgetDeclaration[]
}

export function createWidgetRegistry(): WidgetRegistry {
  const widgets = new Map<string, WidgetDeclaration>()

  return {
    widgets,

    register(widget: WidgetDeclaration) {
      widgets.set(widget.id, widget)
    },

    unregister(widgetId: string) {
      widgets.delete(widgetId)
    },

    get(widgetId: string) {
      return widgets.get(widgetId)
    },

    list() {
      return Array.from(widgets.values())
        .sort((a, b) => (b.priority || 0) - (a.priority || 0))
    },

    listBySource(source: string) {
      return this.list().filter(w => w.source === source)
    },

    listByCategory(category: string) {
      return this.list().filter(w => w.category === category)
    },
  }
}

// Global widget registry
export const widgetRegistry = createWidgetRegistry()

// ─────────────────────────────────────────────────────────────
// STANDARD WIDGETS (built-in)
// ─────────────────────────────────────────────────────────────

/**
 * Universal widgets available regardless of adapter
 */
export const universalWidgets: WidgetDeclaration[] = [
  {
    id: "focus-count",
    source: "core",
    type: "stat",
    label: "Focus Items",
    description: "Items needing attention",
    icon: "Target",
    size: "sm",
    dataKey: "focusItems.count",
    priority: 100,
    category: "overview",
  },
  {
    id: "impact-score",
    source: "core",
    type: "gauge",
    label: "Impact Score",
    description: "Potential impact of focus items",
    icon: "TrendingUp",
    size: "sm",
    dataKey: "focusItems.totalImpact",
    priority: 90,
    category: "overview",
  },
  {
    id: "open-nodes",
    source: "core",
    type: "stat",
    label: "Open Items",
    description: "Total open across all sources",
    icon: "Inbox",
    size: "sm",
    dataKey: "nodes.open",
    priority: 80,
    category: "overview",
  },
]

/**
 * Intercom-specific widgets
 */
export const intercomWidgets: WidgetDeclaration[] = [
  {
    id: "intercom-cx-score",
    source: "intercom",
    type: "gauge",
    label: "CX Score",
    description: "Average customer satisfaction",
    icon: "Smile",
    size: "sm",
    dataKey: "intercom.avgCxScore",
    priority: 95,
    category: "satisfaction",
    requiredFields: ["cxScore"],
  },
  {
    id: "intercom-response-time",
    source: "intercom",
    type: "trend",
    label: "Avg Response",
    description: "Average first response time",
    icon: "Clock",
    size: "sm",
    dataKey: "intercom.avgResponseTime",
    priority: 85,
    category: "performance",
  },
  {
    id: "intercom-sentiment",
    source: "intercom",
    type: "pie",
    label: "Sentiment",
    description: "Customer sentiment breakdown",
    icon: "PieChart",
    size: "md",
    dataKey: "intercom.sentiment",
    priority: 70,
    category: "satisfaction",
    requiredFields: ["sentiment"],
  },
  {
    id: "intercom-conversations",
    source: "intercom",
    type: "stat",
    label: "Conversations",
    description: "Open conversations",
    icon: "MessageSquare",
    size: "sm",
    dataKey: "intercom.openConversations",
    priority: 75,
    category: "volume",
  },
]

/**
 * GitHub-specific widgets
 */
export const githubWidgets: WidgetDeclaration[] = [
  {
    id: "github-open-issues",
    source: "github",
    type: "stat",
    label: "Open Issues",
    description: "Issues needing attention",
    icon: "CircleDot",
    size: "sm",
    dataKey: "github.openIssues",
    priority: 85,
    category: "volume",
  },
  {
    id: "github-stars-at-risk",
    source: "github",
    type: "stat",
    label: "Stars at Risk",
    description: "From repos with open issues",
    icon: "Star",
    size: "sm",
    dataKey: "github.starsAtRisk",
    priority: 80,
    category: "impact",
  },
  {
    id: "github-pr-review-time",
    source: "github",
    type: "trend",
    label: "PR Review Time",
    description: "Average time to first review",
    icon: "GitPullRequest",
    size: "sm",
    dataKey: "github.avgPrReviewTime",
    priority: 70,
    category: "performance",
  },
]

/**
 * Linear-specific widgets
 */
export const linearWidgets: WidgetDeclaration[] = [
  {
    id: "linear-cycle-progress",
    source: "linear",
    type: "gauge",
    label: "Cycle Progress",
    description: "Current sprint completion",
    icon: "RefreshCw",
    size: "sm",
    dataKey: "linear.cycleProgress",
    priority: 85,
    category: "progress",
  },
  {
    id: "linear-blocked-issues",
    source: "linear",
    type: "stat",
    label: "Blocked",
    description: "Issues blocked by dependencies",
    icon: "Ban",
    size: "sm",
    dataKey: "linear.blockedIssues",
    priority: 80,
    category: "attention",
  },
]

// Register universal widgets by default
universalWidgets.forEach(w => widgetRegistry.register(w))
