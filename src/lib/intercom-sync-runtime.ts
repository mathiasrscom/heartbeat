import { eq } from "drizzle-orm"
import { db } from "@/db"
import { settings } from "@/db/schema"

const INTERCOM_SYNC_RUNTIME_KEY = "intercom_sync_runtime"
const STALE_RUNTIME_MS = 30 * 60 * 1000

export type IntercomSyncStage =
  | "idle"
  | "preparing"
  | "teams"
  | "team-members"
  | "contacts"
  | "conversations"
  | "tickets"
  | "finalizing"

export interface IntercomSyncRuntime {
  isRunning: boolean
  currentStage: IntercomSyncStage
  currentStageLabel: string | null
  startedAt: string | null
  heartbeatAt: string | null
}

const DEFAULT_RUNTIME: IntercomSyncRuntime = {
  isRunning: false,
  currentStage: "idle",
  currentStageLabel: null,
  startedAt: null,
  heartbeatAt: null,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export async function readIntercomSyncRuntime(): Promise<IntercomSyncRuntime> {
  const rows = await db.select().from(settings).where(eq(settings.key, INTERCOM_SYNC_RUNTIME_KEY)).limit(1)
  const value = rows[0]?.value

  if (!isRecord(value)) {
    return DEFAULT_RUNTIME
  }

  const currentStage = value.currentStage
  const runtime: IntercomSyncRuntime = {
    isRunning: value.isRunning === true,
    currentStage:
      currentStage === "preparing" ||
      currentStage === "teams" ||
      currentStage === "team-members" ||
      currentStage === "contacts" ||
      currentStage === "conversations" ||
      currentStage === "tickets" ||
      currentStage === "finalizing"
        ? currentStage
        : "idle",
    currentStageLabel:
      typeof value.currentStageLabel === "string" ? value.currentStageLabel : null,
    startedAt: typeof value.startedAt === "string" ? value.startedAt : null,
    heartbeatAt: typeof value.heartbeatAt === "string" ? value.heartbeatAt : null,
  }

  if (!runtime.isRunning || !runtime.heartbeatAt) {
    return runtime
  }

  const heartbeatAt = new Date(runtime.heartbeatAt)
  if (Number.isNaN(heartbeatAt.getTime())) {
    return runtime
  }

  if (Date.now() - heartbeatAt.getTime() <= STALE_RUNTIME_MS) {
    return runtime
  }

  await writeIntercomSyncRuntime(DEFAULT_RUNTIME)
  return DEFAULT_RUNTIME
}

async function writeIntercomSyncRuntime(runtime: IntercomSyncRuntime) {
  const existing = await db
    .select()
    .from(settings)
    .where(eq(settings.key, INTERCOM_SYNC_RUNTIME_KEY))
    .limit(1)

  if (existing.length > 0) {
    await db
      .update(settings)
      .set({
        value: runtime,
        updatedAt: new Date(),
      })
      .where(eq(settings.key, INTERCOM_SYNC_RUNTIME_KEY))
    return
  }

  await db.insert(settings).values({
    key: INTERCOM_SYNC_RUNTIME_KEY,
    value: runtime,
    updatedAt: new Date(),
  })
}

export async function claimIntercomSyncRuntime() {
  const runtime = await readIntercomSyncRuntime()
  if (runtime.isRunning) {
    return false
  }

  const now = new Date().toISOString()
  await writeIntercomSyncRuntime({
    isRunning: true,
    currentStage: "preparing",
    currentStageLabel: "Preparing sync",
    startedAt: now,
    heartbeatAt: now,
  })

  return true
}

export async function updateIntercomSyncRuntime(
  currentStage: IntercomSyncStage,
  currentStageLabel: string
) {
  const runtime = await readIntercomSyncRuntime()
  const now = new Date().toISOString()

  await writeIntercomSyncRuntime({
    isRunning: true,
    currentStage,
    currentStageLabel,
    startedAt: runtime.startedAt ?? now,
    heartbeatAt: now,
  })
}

export async function finishIntercomSyncRuntime() {
  await writeIntercomSyncRuntime(DEFAULT_RUNTIME)
}
