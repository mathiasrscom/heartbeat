import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  real,
  uuid,
  pgEnum,
} from 'drizzle-orm/pg-core'

// ─────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────

export const nodeStatusEnum = pgEnum('node_status', [
  'open',
  'pending',
  'resolved',
  'closed',
])

export const nodePriorityEnum = pgEnum('node_priority', [
  'low',
  'normal',
  'high',
  'urgent',
])

export const actionTypeEnum = pgEnum('action_type', [
  'focus_rule',
  'trigger',
  'automation',
  'metric',
  'filter',
])

export const reportTypeEnum = pgEnum('report_type', [
  'daily',
  'weekly',
  'monthly',
  'quarterly',
])

// ─────────────────────────────────────────────────────────────
// ENTITIES (generic: customers, orgs, repos, projects, etc.)
// ─────────────────────────────────────────────────────────────

export const entityTypeEnum = pgEnum('entity_type', [
  'person',
  'company',
  'organization',
  'repository',
  'project',
  'team',
])

export const entities = pgTable('entities', {
  id: uuid('id').primaryKey().defaultRandom(),
  externalId: text('external_id').notNull(), // Source-specific ID
  source: text('source').notNull(), // 'intercom', 'github', 'linear', etc.

  type: entityTypeEnum('type').notNull().default('person'),

  // Core fields
  name: text('name'),
  email: text('email'),
  avatarUrl: text('avatar_url'),

  // Value indicators (for scoring)
  value: jsonb('value').$type<Record<string, unknown>>().default({}),
  // e.g., { plan: 'enterprise', mrr: 5000, tier: 'gold' } for Intercom
  // e.g., { stars: 1000, forks: 200, isSponsored: true } for GitHub

  // Computed metrics
  nodeCount: integer('node_count').default(0),
  avgCxScore: real('avg_cx_score'),
  totalValue: real('total_value'), // Computed from value signals

  // Source-specific raw data
  rawData: jsonb('raw_data'),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// ─────────────────────────────────────────────────────────────
// TEAM MEMBERS (from any source)
// ─────────────────────────────────────────────────────────────

export const teamMembers = pgTable('team_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  externalId: text('external_id').notNull(), // Source-specific ID
  source: text('source').notNull(), // 'intercom', 'github', 'linear', etc.

  name: text('name').notNull(),
  email: text('email'),
  teamName: text('team_name'),
  avatarUrl: text('avatar_url'),

  isAvailable: boolean('is_available').default(true),

  // Performance metrics (calculated across all sources)
  metrics: jsonb('metrics').$type<Record<string, unknown>>().default({}),
  // e.g., { itemsHandled: 50, avgResponseTime: 30, avgCxScore: 8.5 }

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// ─────────────────────────────────────────────────────────────
// NODES (generic work items from any source - aligned with Neuphlo)
// ─────────────────────────────────────────────────────────────

export const nodes = pgTable('nodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  externalId: text('external_id').notNull(), // Source-specific ID
  source: text('source').notNull(), // 'intercom', 'github', 'linear', etc.

  // Core fields (all sources)
  title: text('title'),
  description: text('description'),

  status: nodeStatusEnum('status').notNull().default('open'),
  priority: nodePriorityEnum('priority').notNull().default('normal'),

  type: text('type'), // 'conversation', 'issue', 'ticket', 'task', etc.
  tags: jsonb('tags').$type<string[]>().default([]),

  // Relationships
  entityId: uuid('entity_id').references(() => entities.id), // Customer/org/repo
  assigneeId: uuid('assignee_id').references(() => teamMembers.id),

  // Value signals (for 80/20 scoring)
  valueSignals: jsonb('value_signals').$type<Record<string, unknown>>().default({}),
  // e.g., { customerTier: 'enterprise', mrr: 5000, affectedUsers: 100 }

  // Effort signals (for 80/20 scoring)
  effortSignals: jsonb('effort_signals').$type<Record<string, unknown>>().default({}),
  // e.g., { storyPoints: 3, complexity: 'medium', estimatedHours: 4 }

  // Computed scores
  impactScore: real('impact_score'),
  effortScore: real('effort_score'),
  priorityScore: real('priority_score'), // impact / effort

  // CX-specific (optional)
  cxScore: integer('cx_score'), // 1-10
  cxComment: text('cx_comment'),
  responseTimeMinutes: integer('response_time_minutes'),
  resolutionTimeHours: real('resolution_time_hours'),

  // AI enrichment
  sentiment: text('sentiment'), // positive, neutral, negative
  topics: jsonb('topics').$type<string[]>().default([]),

  // Source-specific raw data (for reference)
  rawData: jsonb('raw_data'),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  resolvedAt: timestamp('resolved_at'),
})

// ─────────────────────────────────────────────────────────────
// ACTIONS (user-defined rules)
// ─────────────────────────────────────────────────────────────

export const actions = pgTable('actions', {
  id: uuid('id').primaryKey().defaultRandom(),

  originalInput: text('original_input').notNull(), // User's NL input
  name: text('name').notNull(),
  description: text('description'),

  type: actionTypeEnum('type').notNull(),

  conditions: jsonb('conditions').notNull(), // Parsed condition tree
  outputs: jsonb('outputs').notNull(), // Array of outputs

  enabled: boolean('enabled').default(true),
  schedule: text('schedule').default('realtime'),

  cooldownMinutes: integer('cooldown_minutes').default(60),
  maxFiresPerDay: integer('max_fires_per_day'),

  lastFiredAt: timestamp('last_fired_at'),
  fireCount: integer('fire_count').default(0),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// ─────────────────────────────────────────────────────────────
// FOCUS ITEMS (80/20 priorities)
// ─────────────────────────────────────────────────────────────

export const focusItems = pgTable('focus_items', {
  id: uuid('id').primaryKey().defaultRandom(),

  title: text('title').notNull(),
  description: text('description'),
  category: text('category'), // bug, feature_request, documentation, etc.

  impactScore: real('impact_score').notNull(),
  effortEstimate: text('effort_estimate'), // quick, medium, large
  impactEffortRatio: real('impact_effort_ratio'),

  relatedNodeCount: integer('related_node_count').default(0),
  affectedEntityCount: integer('affected_entity_count').default(0),
  affectedValue: real('affected_value'), // Total value at risk (MRR, stars, etc.)

  relatedNodeIds: jsonb('related_node_ids').$type<string[]>().default([]),
  sources: jsonb('sources').$type<string[]>().default([]), // Which adapters contributed

  suggestedAssigneeId: uuid('suggested_assignee_id').references(() => teamMembers.id),
  suggestedAssigneeReason: text('suggested_assignee_reason'),

  suggestedAction: text('suggested_action'),
  estimatedImpact: text('estimated_impact'),

  isResolved: boolean('is_resolved').default(false),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// ─────────────────────────────────────────────────────────────
// REPORTS (daily/weekly/monthly/quarterly)
// ─────────────────────────────────────────────────────────────

export const reports = pgTable('reports', {
  id: uuid('id').primaryKey().defaultRandom(),

  type: reportTypeEnum('type').notNull(),
  periodStart: timestamp('period_start').notNull(),
  periodEnd: timestamp('period_end').notNull(),

  // Metrics snapshot
  metrics: jsonb('metrics').notNull(),

  // Team performance
  teamMetrics: jsonb('team_metrics'),

  // AI-generated content
  summary: text('summary'),
  insights: jsonb('insights'),
  focusItems: jsonb('focus_items'),

  // Type-specific data
  reportData: jsonb('report_data'),

  generatedAt: timestamp('generated_at').defaultNow(),
})

// ─────────────────────────────────────────────────────────────
// ADAPTER CONFIGS (store adapter credentials and settings)
// ─────────────────────────────────────────────────────────────

export const adapterConfigs = pgTable('adapter_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  adapterId: text('adapter_id').notNull().unique(), // 'intercom', 'github', etc.

  name: text('name').notNull(), // Display name
  enabled: boolean('enabled').default(false),

  // Encrypted credentials
  credentials: jsonb('credentials').$type<Record<string, unknown>>().default({}),

  // Adapter-specific settings
  settings: jsonb('settings').$type<Record<string, unknown>>().default({}),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// ─────────────────────────────────────────────────────────────
// SYNC STATE (track sync progress for each adapter)
// ─────────────────────────────────────────────────────────────

export const syncState = pgTable('sync_state', {
  id: uuid('id').primaryKey().defaultRandom(),
  adapterId: text('adapter_id').notNull().unique(), // 'intercom', 'github', etc.

  lastSyncAt: timestamp('last_sync_at'),
  cursor: text('cursor'), // For pagination

  nodesSynced: integer('nodes_synced').default(0),
  entitiesSynced: integer('entities_synced').default(0),
  teamMembersSynced: integer('team_members_synced').default(0),

  lastError: text('last_error'),
  lastErrorAt: timestamp('last_error_at'),

  updatedAt: timestamp('updated_at').defaultNow(),
})

// ─────────────────────────────────────────────────────────────
// SETTINGS (user/org settings)
// ─────────────────────────────────────────────────────────────

export const settings = pgTable('settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  value: jsonb('value'),
  updatedAt: timestamp('updated_at').defaultNow(),
})
