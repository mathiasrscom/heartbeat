import { createFileRoute } from "@tanstack/react-router"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Zap,
  Plus,
  Bell,
  Filter,
  Target,
  ToggleLeft,
  ToggleRight,
  Sparkles,
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Lightbulb,
  Trash2,
  Settings2,
} from "lucide-react"
import { useState } from "react"
import { exampleActions } from "@/lib/actions/types"
import type { ActionCategory } from "@/lib/actions/types"

export const Route = createFileRoute("/actions")({ component: ActionsPage })

// Mock actions - will come from database
const mockActions = [
  {
    id: "1",
    name: "Enterprise CX Alert",
    description: "Alert when high-value customers are unhappy",
    originalInput: "Alert me when enterprise customers have negative sentiment",
    category: "alert" as ActionCategory,
    enabled: true,
    fireCount: 3,
    lastFiredAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    conditions: {
      logic: "and" as const,
      conditions: [
        { field: "entity.value.tier", operator: "equals" as const, value: "enterprise" },
        { field: "node.sentiment", operator: "equals" as const, value: "negative" },
      ],
    },
    outputs: [{ type: "notify" as const, config: { channel: "push" } }],
  },
  {
    id: "2",
    name: "High-Value Focus",
    description: "Prioritize issues from customers with high MRR",
    originalInput: "Focus on tickets from customers with MRR over $1000",
    category: "focus_rule" as ActionCategory,
    enabled: true,
    fireCount: 0,
    lastFiredAt: null,
    conditions: {
      logic: "and" as const,
      conditions: [
        { field: "entity.value.mrr", operator: "greaterThan" as const, value: 1000 },
      ],
    },
    outputs: [{ type: "focus" as const, config: { priority: 9 } }],
  },
  {
    id: "3",
    name: "Auto-Tag Bugs",
    description: "Automatically tag tickets mentioning bugs",
    originalInput: "Auto-tag tickets mentioning 'bug' or 'broken' as potential-bug",
    category: "automation" as ActionCategory,
    enabled: false,
    fireCount: 12,
    lastFiredAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    conditions: {
      logic: "or" as const,
      conditions: [
        { field: "node.title", operator: "contains" as const, value: "bug" },
        { field: "node.description", operator: "contains" as const, value: "broken" },
      ],
    },
    outputs: [{ type: "tag" as const, config: { tag: "potential-bug" } }],
  },
]

const categoryConfig = {
  alert: { icon: Bell, color: "bg-yellow-500/10 text-yellow-700", label: "Alert" },
  focus_rule: { icon: Target, color: "bg-blue-500/10 text-blue-700", label: "Focus Rule" },
  automation: { icon: Zap, color: "bg-purple-500/10 text-purple-700", label: "Automation" },
  metric: { icon: Target, color: "bg-green-500/10 text-green-700", label: "Metric" },
  filter: { icon: Filter, color: "bg-gray-500/10 text-gray-700", label: "Filter" },
}

function ActionsPage() {
  const [newAction, setNewAction] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [parseResult, setParseResult] = useState<{
    success: boolean
    name?: string
    description?: string
    confidence?: number
    error?: string
  } | null>(null)

  const handleCreateAction = async () => {
    if (!newAction.trim()) return

    setIsProcessing(true)
    setParseResult(null)

    // Simulate AI parsing (in real app, would call the parser)
    await new Promise((r) => setTimeout(r, 1500))

    // Mock parse result
    setParseResult({
      success: true,
      name: "New Action",
      description: `Parsed from: "${newAction.slice(0, 50)}..."`,
      confidence: 0.85,
    })

    setIsProcessing(false)
  }

  const handleUseExample = (input: string) => {
    setNewAction(input)
    setParseResult(null)
  }

  return (
    <div className="p-4 lg:p-6 max-w-4xl">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Action Builder</h1>
        <p className="text-xs text-muted-foreground">
          Create rules using natural language
        </p>
      </div>

      {/* New Action Input */}
      <Card className="mb-4 border-dashed">
        <CardContent className="p-3 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium">Create New Action</span>
          </div>
          <Textarea
            placeholder='Try: "Alert me when enterprise customers have more than 3 open tickets"'
            value={newAction}
            onChange={(e) => {
              setNewAction(e.target.value)
              setParseResult(null)
            }}
            className="min-h-[60px] text-sm"
          />

          {/* Parse Result */}
          {parseResult && (
            <div
              className={`p-2 rounded-md border text-xs ${
                parseResult.success
                  ? "bg-green-50 border-green-200"
                  : "bg-red-50 border-red-200"
              }`}
            >
              {parseResult.success ? (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                  <span className="flex-1 text-green-900">{parseResult.name}</span>
                  <Button size="sm" className="h-6 text-xs px-2">Save</Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-3.5 w-3.5 text-red-600" />
                  <span className="text-red-900">{parseResult.error}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-between items-center">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Lightbulb className="h-2.5 w-2.5" />
              AI will parse into a rule
            </span>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleCreateAction}
              disabled={!newAction.trim() || isProcessing}
            >
              {isProcessing ? (
                <>
                  <div className="h-3 w-3 mr-1 animate-spin rounded-full border border-current border-t-transparent" />
                  Parsing
                </>
              ) : (
                <>
                  <Sparkles className="h-3 w-3 mr-1" />
                  Create
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Example Actions */}
      <div className="mb-4">
        <div className="flex items-center gap-1.5 mb-2">
          <Lightbulb className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">Examples</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {exampleActions.slice(0, 4).map((example, i) => (
            <button
              key={i}
              onClick={() => handleUseExample(example.input)}
              className="text-left p-2 rounded-md border bg-muted/30 hover:bg-muted/50 transition-colors text-xs truncate"
            >
              {example.input}
            </button>
          ))}
        </div>
      </div>

      {/* Existing Actions */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Your Actions</h2>
          <p className="text-[10px] text-muted-foreground">
            {mockActions.filter((a) => a.enabled).length} active,{" "}
            {mockActions.filter((a) => !a.enabled).length} paused
          </p>
        </div>
        <Button variant="ghost" size="sm" className="h-6 text-xs px-2">
          <Settings2 className="h-3 w-3 mr-1" />
          Manage
        </Button>
      </div>

      <div className="space-y-2">
        {mockActions.map((action) => {
          const config = categoryConfig[action.category]
          const Icon = config.icon
          return (
            <Card
              key={action.id}
              className={action.enabled ? "" : "opacity-50"}
            >
              <CardContent className="p-2.5">
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-md ${config.color}`}>
                    <Icon className="h-3 w-3" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium truncate">{action.name}</span>
                      <span className="text-[10px] text-muted-foreground px-1 py-0.5 bg-muted rounded-md">
                        {config.label}
                      </span>
                      {action.fireCount > 0 && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5" />
                          {action.fireCount}×
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      {action.conditions.conditions.slice(0, 2).map((cond, i) => (
                        <span key={i} className="text-[10px] text-muted-foreground px-1 py-0.5 bg-muted/50 rounded-md">
                          {"field" in cond ? `${cond.field.split(".").pop()} ${cond.operator} ${cond.value}` : "..."}
                        </span>
                      ))}
                      <ChevronRight className="h-2.5 w-2.5 text-muted-foreground" />
                      {action.outputs.slice(0, 1).map((out, i) => (
                        <span key={i} className="text-[10px] text-muted-foreground px-1 py-0.5 bg-muted/50 rounded-md">
                          {out.type}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button className="text-muted-foreground hover:text-destructive p-1" title="Delete">
                      <Trash2 className="h-3 w-3" />
                    </button>
                    <button className="text-muted-foreground hover:text-foreground" title={action.enabled ? "Disable" : "Enable"}>
                      {action.enabled ? (
                        <ToggleRight className="h-5 w-5 text-primary" />
                      ) : (
                        <ToggleLeft className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Empty state */}
      {mockActions.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-4 text-center">
            <Plus className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No actions yet</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
