import { useState, type FormEvent } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  CheckCircle2,
  Clock3,
  LoaderCircle,
  Plug,
  RefreshCcw,
  ScreenShare,
  ShieldAlert,
  XCircle,
} from "lucide-react"
import {
  getIntercomConnectionState,
  saveIntercomConnection,
  triggerIntercomSync,
  type IntercomConnectionState,
} from "@/lib/intercom-admin"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/settings")({
  loader: async () => getIntercomConnectionState(),
  component: SettingsPage,
})

function SettingsPage() {
  const initialState = Route.useLoaderData()
  const connectIntercom = useServerFn(saveIntercomConnection)
  const syncIntercom = useServerFn(triggerIntercomSync)

  const [state, setState] = useState(initialState)
  const [accessToken, setAccessToken] = useState("")
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(
    null
  )
  const [isSaving, setIsSaving] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)

  async function handleConnect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    setIsSaving(true)

    try {
      const result = await connectIntercom({
        data: {
          accessToken,
        },
      })

      setState(result.state)
      setAccessToken("")
      setFeedback({ tone: "success", text: result.message })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to connect to Intercom."
      setFeedback({ tone: "error", text: message })
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSync() {
    setFeedback(null)
    setIsSyncing(true)

    try {
      const result = await syncIntercom()
      setState(result.state)
      setFeedback({
        tone: result.sync?.success ? "success" : "error",
        text:
          result.sync?.success || !result.sync?.errors.length
            ? result.message
            : `${result.message} ${result.sync.errors[0]}`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to run Intercom sync."
      setFeedback({ tone: "error", text: message })
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div className="p-4 lg:p-6 max-w-3xl">
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-xs text-muted-foreground">
          Configure the Intercom connection and wallboard defaults
        </p>
      </div>

      <div className="space-y-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-md bg-sky-500/10">
                <Plug className="h-3.5 w-3.5 text-blue-600" />
              </div>
              <div className="flex-1">
                <span className="text-xs font-medium">Intercom</span>
                <span className="text-[10px] text-muted-foreground ml-2">
                  Conversations, tickets, SLA, and CX data
                </span>
              </div>
              <StatusBadge state={state} />
            </div>

            <div className="grid gap-2 sm:grid-cols-3 text-xs mb-3">
              <StatCard label="Last sync" value={formatTimestamp(state.lastSyncAt, "Never")} />
              <StatCard
                label="Connection"
                value={state.verifiedAdminEmail || state.tokenHint || "No token configured"}
              />
              <StatCard
                label="Latest import"
                value={
                  state.lastSyncAt
                    ? `${state.nodesSynced} cases • ${state.entitiesSynced} contacts`
                    : "Run first sync"
                }
              />
            </div>

            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleConnect}>
              <Input
                type="password"
                placeholder="Access token"
                className="flex-1 h-7 text-xs"
                value={accessToken}
                onChange={(event) => setAccessToken(event.target.value)}
              />
              <Button
                size="sm"
                className="h-7 text-xs px-3"
                type="submit"
                disabled={isSaving || accessToken.trim().length === 0}
              >
                {isSaving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
                Save and verify
              </Button>
              <Button
                size="sm"
                type="button"
                variant="outline"
                className="h-7 text-xs px-3"
                onClick={handleSync}
                disabled={isSyncing || !state.hasAccessToken}
              >
                {isSyncing ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
                Sync now
              </Button>
            </form>
            <p className="text-[10px] text-muted-foreground mt-1">
              Get from Intercom → Settings → Developers → Access Token
            </p>

            {state.tokenSource === "environment" ? (
              <p className="mt-1 text-[10px] text-muted-foreground">
                The app is currently using `INTERCOM_ACCESS_TOKEN` from the environment. Saving
                a token here will store a database fallback for the worker.
              </p>
            ) : null}

            {feedback ? (
              <div
                className={cn(
                  "mt-3 rounded-lg border px-3 py-2 text-xs",
                  feedback.tone === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-red-200 bg-red-50 text-red-800"
                )}
              >
                {feedback.text}
              </div>
            ) : null}

            {state.lastError ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                <div className="flex items-center gap-2 font-medium">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Latest sync issue
                </div>
                <div className="mt-1">{state.lastError}</div>
                {state.lastErrorAt ? (
                  <div className="mt-1 text-[10px] text-red-700/80">
                    {formatTimestamp(state.lastErrorAt, "Unknown")}
                  </div>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-md bg-amber-500/10">
                <Clock3 className="h-3.5 w-3.5 text-amber-600" />
              </div>
              <span className="text-xs font-medium">Sync cadence</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md border p-3">
                <div className="text-muted-foreground mb-1">Refresh interval</div>
                <div className="font-medium">Every {state.syncIntervalMinutes} minutes</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-muted-foreground mb-1">Stale warning</div>
                <div className="font-medium">After {state.staleAfterMinutes} minutes</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-md bg-green-500/10">
                <ScreenShare className="h-3.5 w-3.5 text-green-600" />
              </div>
              <span className="text-xs font-medium">Wallboard behavior</span>
            </div>
            <div className="space-y-2 text-xs text-muted-foreground">
              <p>The live wallboard is the operational entrypoint for the app.</p>
              <p>The trends wallboard shows month, quarter, and year CX context.</p>
              <p>Customer names stay off the monitors so the display is safe for the office.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatusBadge({ state }: { state: IntercomConnectionState }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] px-1.5 py-0 gap-1",
        state.status === "connected" && "border-emerald-200 bg-emerald-50 text-emerald-700",
        state.status === "configured" && "border-amber-200 bg-amber-50 text-amber-700",
        state.status === "error" && "border-red-200 bg-red-50 text-red-700"
      )}
    >
      {state.status === "connected" ? (
        <CheckCircle2 className="h-2.5 w-2.5" />
      ) : state.status === "configured" ? (
        <Clock3 className="h-2.5 w-2.5" />
      ) : state.status === "error" ? (
        <ShieldAlert className="h-2.5 w-2.5" />
      ) : (
        <XCircle className="h-2.5 w-2.5" />
      )}
      {state.statusLabel}
    </Badge>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium leading-snug">{value}</div>
    </div>
  )
}

function formatTimestamp(value: string | null, fallback: string) {
  if (!value) return fallback

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback

  return date.toLocaleString()
}
