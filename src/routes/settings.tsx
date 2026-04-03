import { useEffect, useState, type FormEvent } from "react"
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
  ShieldAlert,
  XCircle,
} from "lucide-react"
import {
  getIntercomConnectionState,
  removeIntercomConnection,
  saveIntercomConnection,
  saveIntercomWorkspaceLink,
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
  const refreshIntercomState = useServerFn(getIntercomConnectionState)
  const connectIntercom = useServerFn(saveIntercomConnection)
  const saveWorkspaceLink = useServerFn(saveIntercomWorkspaceLink)
  const removeIntercom = useServerFn(removeIntercomConnection)
  const syncIntercom = useServerFn(triggerIntercomSync)

  const [state, setState] = useState(initialState)
  const [accessToken, setAccessToken] = useState("")
  const [appUrl, setAppUrl] = useState(initialState.appUrl ?? "")
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(
    null
  )
  const [isSaving, setIsSaving] = useState(false)
  const [isSavingAppUrl, setIsSavingAppUrl] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const [isStartingSync, setIsStartingSync] = useState(false)

  useEffect(() => {
    if (!state.isSyncRunning) {
      return
    }

    const intervalId = window.setInterval(() => {
      void refreshIntercomState().then((nextState) => {
        setState(nextState)
      })
    }, 2000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [refreshIntercomState, state.isSyncRunning])

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
      setAppUrl(result.state.appUrl ?? "")
      setFeedback({ tone: "success", text: result.message })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to connect to Intercom."
      setFeedback({ tone: "error", text: message })
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSaveWorkspaceLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    setIsSavingAppUrl(true)

    try {
      const result = await saveWorkspaceLink({
        data: {
          appUrl,
        },
      })
      setState(result.state)
      setAppUrl(result.state.appUrl ?? "")
      setFeedback({ tone: "success", text: result.message })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to save the Intercom workspace link."
      setFeedback({ tone: "error", text: message })
    } finally {
      setIsSavingAppUrl(false)
    }
  }

  async function handleSync() {
    setFeedback(null)
    setIsStartingSync(true)

    try {
      const result = await syncIntercom()
      setState(result.state)
      setFeedback({ tone: "success", text: result.message })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to run Intercom sync."
      setFeedback({ tone: "error", text: message })
    } finally {
      setIsStartingSync(false)
    }
  }

  async function handleRemoveToken() {
    setFeedback(null)
    setIsRemoving(true)

    try {
      const result = await removeIntercom()
      setState(result.state)
      setAccessToken("")
      setFeedback({ tone: "success", text: result.message })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to remove the stored Intercom token."
      setFeedback({ tone: "error", text: message })
    } finally {
      setIsRemoving(false)
    }
  }

  const tokenPlaceholder = state.hasStoredToken
    ? "Paste a new token to replace the stored one"
    : state.tokenSource === "environment"
      ? "Store a database fallback token"
      : "Access token"
  const saveLabel = state.hasStoredToken ? "Replace and verify" : "Save and verify"
  const syncButtonLabel = state.isSyncRunning
    ? state.syncStageLabel || "Syncing"
    : "Sync now"

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

            {state.isSyncRunning ? (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <div className="flex items-center gap-2 font-medium">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  {state.syncStageLabel || "Intercom sync is running"}
                </div>
                {state.syncStartedAt ? (
                  <div className="mt-1 text-[10px] text-amber-800/80">
                    Started {formatTimestamp(state.syncStartedAt, "Unknown")}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mb-3 rounded-lg border bg-muted/20 px-3 py-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1 text-xs">
                  <div className="font-medium text-foreground">Token storage</div>
                  <div className="text-muted-foreground">
                    {state.hasStoredToken
                      ? `${state.storedTokenHint} is stored in the database for background sync.`
                      : "No Intercom token is stored in the database yet."}
                  </div>
                  {state.tokenSource === "environment" ? (
                    <div className="text-muted-foreground">
                      The active sync is using `INTERCOM_ACCESS_TOKEN` from the environment.
                    </div>
                  ) : state.hasStoredToken ? (
                    <div className="text-muted-foreground">
                      The active sync is using the stored database token.
                    </div>
                  ) : null}
                </div>

                {state.hasStoredToken ? (
                  <Button
                    size="sm"
                    type="button"
                    variant="outline"
                    className="h-8 text-xs px-3"
                    onClick={handleRemoveToken}
                    disabled={isRemoving}
                  >
                    {isRemoving ? (
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Remove stored token
                  </Button>
                ) : null}
              </div>
            </div>

            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleConnect}>
              <Input
                type="password"
                placeholder={tokenPlaceholder}
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
                {saveLabel}
              </Button>
              <Button
                size="sm"
                type="button"
                variant="outline"
                className="h-7 text-xs px-3"
                onClick={handleSync}
                disabled={isStartingSync || state.isSyncRunning || !state.hasAccessToken}
              >
                {isStartingSync || state.isSyncRunning ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCcw className="h-3.5 w-3.5" />
                )}
                {syncButtonLabel}
              </Button>
            </form>
            <p className="text-[10px] text-muted-foreground mt-1">
              Get from Intercom → Settings → Developers → Access Token
            </p>

            <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={handleSaveWorkspaceLink}>
              <Input
                type="url"
                placeholder="Intercom workspace link"
                className="flex-1 h-7 text-xs"
                value={appUrl}
                onChange={(event) => setAppUrl(event.target.value)}
              />
              <Button
                size="sm"
                className="h-7 text-xs px-3"
                type="submit"
                disabled={isSavingAppUrl || appUrl.trim().length === 0}
              >
                {isSavingAppUrl ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
                Save workspace link
              </Button>
            </form>
            <p className="text-[10px] text-muted-foreground mt-1">
              Example: https://app.eu.intercom.com/a/inbox/zah460bv/inbox/conversation/215560824562362
            </p>

            <div className="mt-3 rounded-lg border bg-muted/20 px-3 py-2 text-xs">
              <div className="font-medium text-foreground">CX source</div>
              <div className="mt-1 text-muted-foreground">
                Primary: <code>conversation_rating.rating</code>. Fallbacks:{" "}
                <code>custom_attributes[&quot;CX Score rating&quot;]</code> and{" "}
                <code>ai_agent.rating</code>.
              </div>
              <div className="mt-1 text-muted-foreground">
                CX period metrics use resolved conversations only.
              </div>
            </div>

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
