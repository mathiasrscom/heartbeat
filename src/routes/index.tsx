import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { FocusCard } from "@/components/focus-card"
import { DateRangePicker, PeriodPills, getDateRange, type DateRange } from "@/components/date-range-picker"
import { WidgetCard } from "@/components/widgets/widget-card"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Settings2,
} from "lucide-react"
import type { Widget } from "@/lib/widgets/types"
import { intercomWidgets, universalWidgets } from "@/lib/widgets/types"

export const Route = createFileRoute("/")({ component: FocusPage })

// Mock data - will be replaced with real data
const mockFocusItems = [
  {
    id: "1",
    title: "Billing sync failing for enterprise customers",
    description:
      "Multiple enterprise customers are reporting that their billing information isn't syncing correctly, causing invoice discrepancies.",
    category: "bug" as const,
    impactScore: 92,
    effortEstimate: "quick" as const,
    relatedTicketCount: 12,
    affectedCustomerCount: 3,
    affectedMrr: 45000,
    suggestedAssignee: {
      name: "Marcus Chen",
      reason: "Owns billing infrastructure, fixed similar issue last month",
    },
    suggestedAction: "Fix the webhook retry logic in billing-sync service",
    estimatedImpact: "Resolves 40% of open enterprise tickets",
  },
  {
    id: "2",
    title: "Onboarding flow confusion at step 3",
    description:
      "New users are dropping off at the workspace creation step. The UI doesn't clearly explain the team vs personal workspace options.",
    category: "documentation" as const,
    impactScore: 78,
    effortEstimate: "quick" as const,
    relatedTicketCount: 8,
    affectedCustomerCount: 15,
    suggestedAssignee: {
      name: "Sarah Kim",
      reason: "Owns onboarding experience",
    },
    suggestedAction: "Add tooltips and improve copy on workspace selection",
    estimatedImpact: "Reduces new user friction by ~25%",
  },
  {
    id: "3",
    title: "API rate limiting too aggressive",
    description:
      "Developers hitting rate limits during normal usage patterns, especially during batch operations.",
    category: "feature_request" as const,
    impactScore: 65,
    effortEstimate: "medium" as const,
    relatedTicketCount: 6,
    affectedCustomerCount: 8,
    affectedMrr: 12000,
    suggestedAssignee: {
      name: "Jake Thompson",
      reason: "API team lead",
    },
    suggestedAction: "Implement tiered rate limits based on plan",
    estimatedImpact: "Improves developer experience for Pro+ customers",
  },
]

// Simulate connected adapters - in real app, comes from settings/DB
const connectedAdapters = ["intercom"]

// Build widgets based on connected adapters
function getAvailableWidgets(): Widget[] {
  const widgets: Widget[] = []

  // Add universal widgets
  for (const decl of universalWidgets) {
    widgets.push({
      declaration: decl,
      data: getMockWidgetData(decl.id),
      loading: false,
    })
  }

  // Add adapter-specific widgets (only if connected)
  if (connectedAdapters.includes("intercom")) {
    for (const decl of intercomWidgets) {
      widgets.push({
        declaration: decl,
        data: getMockWidgetData(decl.id),
        loading: false,
      })
    }
  }

  // Sort by priority
  return widgets.sort((a, b) =>
    (b.declaration.priority || 0) - (a.declaration.priority || 0)
  )
}

// Mock widget data
function getMockWidgetData(widgetId: string): Widget["data"] {
  const mockData: Record<string, Widget["data"]> = {
    "focus-count": {
      widgetId: "focus-count",
      value: 3,
      subtitle: "Top priorities",
      updatedAt: new Date(),
    },
    "impact-score": {
      widgetId: "impact-score",
      value: 78,
      trend: { direction: "up", value: 12, label: "vs last week" },
      updatedAt: new Date(),
    },
    "open-nodes": {
      widgetId: "open-nodes",
      value: 34,
      subtitle: "4 urgent",
      updatedAt: new Date(),
    },
    "intercom-cx-score": {
      widgetId: "intercom-cx-score",
      value: 7.4,
      trend: { direction: "up", value: 8 },
      updatedAt: new Date(),
    },
    "intercom-response-time": {
      widgetId: "intercom-response-time",
      value: "12min",
      trend: { direction: "down", value: 15, label: "faster" },
      subtitle: "Avg first response",
      updatedAt: new Date(),
    },
    "intercom-conversations": {
      widgetId: "intercom-conversations",
      value: 28,
      subtitle: "Active today",
      updatedAt: new Date(),
    },
  }
  return mockData[widgetId] || null
}

function FocusPage() {
  const [dateRange, setDateRange] = useState<DateRange>(getDateRange("today"))
  const greeting = getGreeting()
  const widgets = getAvailableWidgets()

  // Top 4 widgets for the stats row
  const topWidgets = widgets.slice(0, 4)
  const isToday = dateRange.label === "Today"

  return (
    <div className="p-4 lg:p-6 max-w-5xl">
      {/* Compact Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold">{greeting}, Mathias</h1>
          <p className="text-xs text-muted-foreground">
            {isToday ? "Here's your focus for today" : `Showing ${dateRange.label?.toLowerCase()}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Dynamic Widgets Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
        {topWidgets.map((widget) => (
          <WidgetCard key={widget.declaration.id} widget={widget} />
        ))}
      </div>

      {/* Overnight Alerts (only for Today) */}
      {isToday && (
        <Card className="mb-4 border-yellow-500/50 bg-yellow-500/5">
          <CardContent className="p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-yellow-600 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium mb-1">2 alerts overnight</p>
                <div className="space-y-0.5 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">Enterprise customer Acme Corp opened 3 tickets</span>
                    <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0">High value</Badge>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">CX score dropped below 6.5 for billing tag</span>
                    <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0">Trigger</Badge>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Focus Items */}
      <div className="mb-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Focus Items</h2>
            <p className="text-xs text-muted-foreground">
              Ranked by impact/effort
            </p>
          </div>
          <PeriodPills
            value={
              dateRange.label === "Today" ? "today" :
              dateRange.label === "Yesterday" ? "yesterday" :
              dateRange.label === "Last 7 days" ? "7d" : "30d"
            }
            onChange={(period) => setDateRange(getDateRange(period))}
            className="hidden sm:flex"
          />
        </div>
      </div>

      <div className="space-y-2 mb-6">
        {mockFocusItems.map((item, index) => (
          <FocusCard key={item.id} item={item} rank={index + 1} />
        ))}
      </div>

      <Separator className="my-4" />

      {/* Compact Insights */}
      <div className="grid md:grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-green-600" />
              <span className="text-xs font-medium">What's Working</span>
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>• Response time improved 20% this week</p>
              <p>• Emma handled 3 escalations perfectly</p>
              <p>• Self-service articles reduced repeat tickets</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <TrendingDown className="h-3.5 w-3.5 text-red-600" />
              <span className="text-xs font-medium">Needs Attention</span>
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>• Billing questions up 35% this week</p>
              <p>• Alex's CX score dipped — may need support</p>
              <p>• API documentation getting stale</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}
