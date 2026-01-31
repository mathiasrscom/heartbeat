import { Card, CardContent } from "@/components/ui/card"
import {
  Target,
  Zap,
  Users,
  DollarSign,
  ChevronRight,
  Clock,
  User,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface FocusItem {
  id: string
  title: string
  description: string
  category: "bug" | "feature_request" | "documentation" | "process" | "other"
  impactScore: number
  effortEstimate: "quick" | "medium" | "large"
  relatedTicketCount: number
  affectedCustomerCount: number
  affectedMrr?: number
  suggestedAssignee?: {
    name: string
    avatarUrl?: string
    reason: string
  }
  suggestedAction: string
  estimatedImpact: string
}

const categoryConfig = {
  bug: { label: "Bug", class: "bg-red-100 text-red-700 border-red-200" },
  feature_request: { label: "Feature", class: "bg-blue-100 text-blue-700 border-blue-200" },
  documentation: { label: "Docs", class: "bg-gray-100 text-gray-700 border-gray-200" },
  process: { label: "Process", class: "bg-purple-100 text-purple-700 border-purple-200" },
  other: { label: "Other", class: "bg-gray-100 text-gray-700 border-gray-200" },
}

const effortConfig = {
  quick: { label: "Quick", class: "text-green-600" },
  medium: { label: "Medium", class: "text-yellow-600" },
  large: { label: "Large", class: "text-orange-600" },
}

export function FocusCard({
  item,
  rank,
}: {
  item: FocusItem
  rank: number
}) {
  const category = categoryConfig[item.category]
  const effort = effortConfig[item.effortEstimate]

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-3">
        <div className="flex gap-3">
          {/* Rank */}
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
            {rank}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Header row */}
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded-md border font-medium", category.class)}>
                  {category.label}
                </span>
                <span className={cn("text-xs flex items-center gap-0.5", effort.class)}>
                  <Clock className="h-3 w-3" />
                  {effort.label}
                </span>
              </div>
              <div className="flex items-baseline gap-1 shrink-0">
                <span className="text-lg font-bold text-primary">{item.impactScore}</span>
                <span className="text-[10px] text-muted-foreground">impact</span>
              </div>
            </div>

            {/* Title */}
            <h3 className="font-medium text-sm mb-1 leading-snug">{item.title}</h3>

            {/* Stats row */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
              <span className="flex items-center gap-1">
                <Target className="h-3 w-3" />
                {item.relatedTicketCount} tickets
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {item.affectedCustomerCount}
              </span>
              {item.affectedMrr && (
                <span className="flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  ${(item.affectedMrr / 1000).toFixed(0)}k MRR
                </span>
              )}
            </div>

            {/* Action row */}
            <div className="flex items-center gap-2 text-xs bg-muted/50 rounded-md px-2 py-1.5">
              <Zap className="h-3 w-3 text-primary shrink-0" />
              <span className="flex-1 truncate">{item.suggestedAction}</span>
              {item.suggestedAssignee && (
                <span className="flex items-center gap-1 text-muted-foreground shrink-0">
                  <User className="h-3 w-3" />
                  {item.suggestedAssignee.name.split(" ")[0]}
                </span>
              )}
              <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Compact stats card (kept for backwards compatibility)
export function StatsCard({
  title,
  value,
  subtitle,
  icon: Icon,
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">{title}</span>
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="text-xl font-bold">{value}</div>
        {subtitle && (
          <p className="text-[10px] text-muted-foreground">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  )
}

// CX Score Card (compact version)
export function CXScoreCard({
  score,
  trend,
  changePercent,
}: {
  score: number
  trend: "up" | "down" | "stable"
  changePercent: number
}) {
  const trendColor =
    trend === "up" ? "text-green-600" : trend === "down" ? "text-red-600" : "text-muted-foreground"
  const trendIcon = trend === "up" ? "↑" : trend === "down" ? "↓" : "→"

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">CX Score</span>
          <span className={cn("text-xs", trendColor)}>
            {trendIcon} {Math.abs(changePercent)}%
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-bold">{score.toFixed(1)}</span>
          <span className="text-xs text-muted-foreground">/10</span>
        </div>
        {/* Mini progress bar */}
        <div className="h-1 bg-muted rounded-full mt-2 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full",
              score >= 8 ? "bg-green-500" : score >= 6 ? "bg-yellow-500" : "bg-red-500"
            )}
            style={{ width: `${score * 10}%` }}
          />
        </div>
      </CardContent>
    </Card>
  )
}
