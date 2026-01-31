/**
 * Widget Card Components
 *
 * Renders different widget types based on declaration.
 * Inspired by MCP UI's declarative approach.
 */

import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import type { Widget, WidgetDeclaration, WidgetData, WidgetSize } from "@/lib/widgets/types"
import {
  TrendingUp,
  TrendingDown,
  Target,
  MessageSquare,
  Clock,
  Smile,
  Inbox,
  Star,
  CircleDot,
  GitPullRequest,
  RefreshCw,
  Ban,
  PieChart,
  type LucideIcon,
} from "lucide-react"

// Icon mapping
const iconMap: Record<string, LucideIcon> = {
  Target,
  MessageSquare,
  Clock,
  Smile,
  Inbox,
  Star,
  CircleDot,
  GitPullRequest,
  RefreshCw,
  Ban,
  PieChart,
  TrendingUp,
  TrendingDown,
}

// Size classes (compact)
const sizeClasses: Record<WidgetSize, string> = {
  xs: "min-w-[80px]",
  sm: "min-w-[100px]",
  md: "min-w-[140px]",
  lg: "min-w-[200px]",
  xl: "min-w-[280px]",
}

interface WidgetCardProps {
  widget: Widget
  className?: string
  compact?: boolean
}

export function WidgetCard({ widget, className, compact }: WidgetCardProps) {
  const { declaration, data, loading, error } = widget

  if (loading) {
    return (
      <Card className={cn(sizeClasses[declaration.size || "sm"], "animate-pulse", className)}>
        <CardContent className="p-3">
          <div className="h-3 w-12 bg-muted rounded mb-1" />
          <div className="h-5 w-10 bg-muted rounded" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className={cn(sizeClasses[declaration.size || "sm"], "border-destructive/50", className)}>
        <CardContent className="p-3">
          <p className="text-[10px] text-destructive">{error}</p>
        </CardContent>
      </Card>
    )
  }

  // Render based on widget type
  switch (declaration.type) {
    case "stat":
      return <StatWidget declaration={declaration} data={data} compact={compact} className={className} />
    case "gauge":
      return <GaugeWidget declaration={declaration} data={data} compact={compact} className={className} />
    case "trend":
      return <TrendWidget declaration={declaration} data={data} compact={compact} className={className} />
    default:
      return <StatWidget declaration={declaration} data={data} compact={compact} className={className} />
  }
}

// ─────────────────────────────────────────────────────────────
// STAT WIDGET
// ─────────────────────────────────────────────────────────────

function StatWidget({
  declaration,
  data,
  compact,
  className,
}: {
  declaration: WidgetDeclaration
  data: WidgetData | null
  compact?: boolean
  className?: string
}) {
  const Icon = declaration.icon ? iconMap[declaration.icon] : null

  if (compact) {
    return (
      <div className={cn("flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-muted/50", className)}>
        {Icon && <Icon className="h-3 w-3 text-muted-foreground" />}
        <span className="text-[10px] text-muted-foreground">{declaration.label}</span>
        <span className="font-semibold text-xs">{formatValue(data?.value)}</span>
      </div>
    )
  }

  return (
    <Card className={cn(sizeClasses[declaration.size || "sm"], className)}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[10px] text-muted-foreground">{declaration.label}</span>
          {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
        <div className="text-xl font-bold">{formatValue(data?.value)}</div>
        {data?.subtitle && (
          <p className="text-[10px] text-muted-foreground">{data.subtitle}</p>
        )}
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────
// GAUGE WIDGET (for scores 0-10 or 0-100)
// ─────────────────────────────────────────────────────────────

function GaugeWidget({
  declaration,
  data,
  compact,
  className,
}: {
  declaration: WidgetDeclaration
  data: WidgetData | null
  compact?: boolean
  className?: string
}) {
  const Icon = declaration.icon ? iconMap[declaration.icon] : null
  const value = typeof data?.value === "number" ? data.value : 0
  const isScore10 = value <= 10
  const percentage = isScore10 ? (value / 10) * 100 : value

  const getScoreColor = (pct: number) => {
    if (pct >= 80) return "text-green-600"
    if (pct >= 60) return "text-yellow-600"
    return "text-red-600"
  }

  const getBgColor = (pct: number) => {
    if (pct >= 80) return "bg-green-500"
    if (pct >= 60) return "bg-yellow-500"
    return "bg-red-500"
  }

  if (compact) {
    return (
      <div className={cn("flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-muted/50", className)}>
        {Icon && <Icon className="h-3 w-3 text-muted-foreground" />}
        <span className="text-[10px] text-muted-foreground">{declaration.label}</span>
        <span className={cn("font-semibold text-xs", getScoreColor(percentage))}>
          {isScore10 ? value.toFixed(1) : `${Math.round(value)}%`}
        </span>
      </div>
    )
  }

  return (
    <Card className={cn(sizeClasses[declaration.size || "sm"], className)}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[10px] text-muted-foreground">{declaration.label}</span>
          {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
        <div className="flex items-baseline gap-1">
          <span className={cn("text-xl font-bold", getScoreColor(percentage))}>
            {isScore10 ? value.toFixed(1) : `${Math.round(value)}%`}
          </span>
          {data?.trend && (
            <span className={cn(
              "text-[10px] flex items-center",
              data.trend.direction === "up" ? "text-green-600" :
              data.trend.direction === "down" ? "text-red-600" : "text-muted-foreground"
            )}>
              {data.trend.direction === "up" ? "↑" : data.trend.direction === "down" ? "↓" : "→"}
              {data.trend.value}%
            </span>
          )}
        </div>
        {/* Progress bar */}
        <div className="h-1 bg-muted rounded-full mt-1.5 overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", getBgColor(percentage))}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────
// TREND WIDGET
// ─────────────────────────────────────────────────────────────

function TrendWidget({
  declaration,
  data,
  compact,
  className,
}: {
  declaration: WidgetDeclaration
  data: WidgetData | null
  compact?: boolean
  className?: string
}) {
  const Icon = declaration.icon ? iconMap[declaration.icon] : null
  const trend = data?.trend

  if (compact) {
    return (
      <div className={cn("flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-muted/50", className)}>
        {Icon && <Icon className="h-3 w-3 text-muted-foreground" />}
        <span className="text-[10px] text-muted-foreground">{declaration.label}</span>
        <span className="font-semibold text-xs">{formatValue(data?.value)}</span>
        {trend && (
          <span className={cn(
            "text-[10px]",
            trend.direction === "up" ? "text-green-600" : trend.direction === "down" ? "text-red-600" : "text-muted-foreground"
          )}>
            {trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "→"}
          </span>
        )}
      </div>
    )
  }

  return (
    <Card className={cn(sizeClasses[declaration.size || "sm"], className)}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[10px] text-muted-foreground">{declaration.label}</span>
          {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-bold">{formatValue(data?.value)}</span>
          {trend && (
            <span className={cn(
              "text-[10px] flex items-center",
              trend.direction === "up" ? "text-green-600" : trend.direction === "down" ? "text-red-600" : "text-muted-foreground"
            )}>
              {trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "→"}
              {trend.value}%
            </span>
          )}
        </div>
        {data?.subtitle && (
          <p className="text-[10px] text-muted-foreground">{data.subtitle}</p>
        )}
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—"
  if (typeof value === "number") {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`
    if (Number.isInteger(value)) return value.toString()
    return value.toFixed(1)
  }
  return String(value)
}

// ─────────────────────────────────────────────────────────────
// WIDGET GRID
// ─────────────────────────────────────────────────────────────

interface WidgetGridProps {
  widgets: Widget[]
  compact?: boolean
  className?: string
}

export function WidgetGrid({ widgets, compact, className }: WidgetGridProps) {
  if (compact) {
    return (
      <div className={cn("flex flex-wrap gap-2", className)}>
        {widgets.map((widget) => (
          <WidgetCard key={widget.declaration.id} widget={widget} compact />
        ))}
      </div>
    )
  }

  return (
    <div className={cn("grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4", className)}>
      {widgets.map((widget) => (
        <WidgetCard key={widget.declaration.id} widget={widget} />
      ))}
    </div>
  )
}
