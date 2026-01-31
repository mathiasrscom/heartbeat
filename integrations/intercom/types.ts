/**
 * Intercom Integration - Data Types
 *
 * Defines what we sync from Intercom and how we store it in TanStack DB.
 * We normalize Intercom's data model into our own schema for:
 * - Consistent querying across integrations
 * - AI analysis
 * - Historical tracking
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// INTERCOM API RESPONSE TYPES (what we receive)
// ─────────────────────────────────────────────────────────────

// Intercom Conversation (support ticket/chat)
export const IntercomConversationSchema = z.object({
  id: z.string(),
  type: z.literal("conversation"),
  created_at: z.number(), // Unix timestamp
  updated_at: z.number(),
  waiting_since: z.number().nullable(),
  snoozed_until: z.number().nullable(),

  state: z.enum(["open", "closed", "snoozed"]),
  priority: z.enum(["priority", "not_priority"]).optional(),

  // Source info
  source: z.object({
    type: z.string(),
    id: z.string().optional(),
    delivered_as: z.string().optional(),
    subject: z.string().optional(),
    body: z.string().optional(),
    author: z.object({
      type: z.string(),
      id: z.string(),
      name: z.string().optional(),
      email: z.string().optional(),
    }),
  }),

  // Contacts (customers)
  contacts: z.object({
    contacts: z.array(z.object({
      id: z.string(),
      external_id: z.string().optional(),
    })),
  }),

  // Assignee (team member)
  assignee: z.object({
    type: z.string().optional(),
    id: z.string().optional(),
    name: z.string().optional(),
    email: z.string().optional(),
  }).optional(),

  // Team
  team: z.object({
    id: z.string(),
    name: z.string().optional(),
  }).optional(),

  // Tags
  tags: z.object({
    tags: z.array(z.object({
      id: z.string(),
      name: z.string(),
    })),
  }),

  // Statistics
  statistics: z.object({
    first_contact_reply_at: z.number().optional(),
    first_admin_reply_at: z.number().optional(),
    last_contact_reply_at: z.number().optional(),
    last_admin_reply_at: z.number().optional(),
    time_to_first_reply: z.number().optional(),
    time_to_last_close: z.number().optional(),
  }).optional(),

  // Conversation rating (CSAT)
  conversation_rating: z.object({
    rating: z.number(), // 1-5
    remark: z.string().optional(),
    contact: z.object({ id: z.string() }),
    teammate: z.object({ id: z.string() }).optional(),
    created_at: z.number(),
  }).optional(),
});

export type IntercomConversation = z.infer<typeof IntercomConversationSchema>;

// Intercom Contact (customer)
export const IntercomContactSchema = z.object({
  id: z.string(),
  type: z.enum(["contact", "user", "lead"]),
  external_id: z.string().optional(),

  email: z.string().optional(),
  name: z.string().optional(),
  phone: z.string().optional(),

  // Company association
  companies: z.object({
    companies: z.array(z.object({
      id: z.string(),
      name: z.string().optional(),
    })),
  }).optional(),

  // Custom attributes (where plan/MRR often lives)
  custom_attributes: z.record(z.unknown()).optional(),

  // Timestamps
  created_at: z.number(),
  updated_at: z.number(),
  signed_up_at: z.number().optional(),
  last_seen_at: z.number().optional(),
});

export type IntercomContact = z.infer<typeof IntercomContactSchema>;

// Intercom Company
export const IntercomCompanySchema = z.object({
  id: z.string(),
  type: z.literal("company"),
  name: z.string(),

  company_id: z.string().optional(), // External ID
  plan: z.string().optional(),
  monthly_spend: z.number().optional(),

  custom_attributes: z.record(z.unknown()).optional(),

  created_at: z.number(),
  updated_at: z.number(),
});

export type IntercomCompany = z.infer<typeof IntercomCompanySchema>;

// Intercom Admin (team member)
export const IntercomAdminSchema = z.object({
  id: z.string(),
  type: z.literal("admin"),
  name: z.string(),
  email: z.string(),

  team_ids: z.array(z.string()).optional(),

  away_mode_enabled: z.boolean().optional(),
  away_mode_reassign: z.boolean().optional(),
});

export type IntercomAdmin = z.infer<typeof IntercomAdminSchema>;

// ─────────────────────────────────────────────────────────────
// HEARTBEAT NORMALIZED TYPES (what we store)
// ─────────────────────────────────────────────────────────────

/**
 * We normalize Intercom data into our own schema so that:
 * 1. We can query consistently across different integrations
 * 2. AI prompts work the same regardless of data source
 * 3. We can track historical changes
 */

// Normalized Ticket (from Intercom Conversation)
export const TicketSchema = z.object({
  id: z.string().uuid(),
  externalId: z.string(), // Intercom conversation ID
  source: z.literal("intercom"), // Could be "zendesk", "freshdesk", etc.

  // Basic info
  subject: z.string().optional(),
  body: z.string().optional(),
  bodyPreview: z.string(), // First 500 chars for quick display

  // Status
  status: z.enum(["open", "pending", "resolved", "closed"]),
  priority: z.enum(["low", "normal", "high", "urgent"]),

  // Categorization
  tags: z.array(z.string()),
  category: z.string().optional(), // AI-inferred category

  // People
  customerId: z.string(),
  assigneeId: z.string().optional(),
  teamId: z.string().optional(),

  // Timestamps
  createdAt: z.date(),
  updatedAt: z.date(),
  firstResponseAt: z.date().optional(),
  resolvedAt: z.date().optional(),

  // Metrics
  responseTimeMinutes: z.number().optional(),
  resolutionTimeHours: z.number().optional(),
  messageCount: z.number(),

  // CSAT
  csatScore: z.number().optional(), // 1-5, normalized to 1-10
  csatComment: z.string().optional(),

  // AI enrichment
  sentiment: z.enum(["positive", "neutral", "negative"]).optional(),
  topics: z.array(z.string()).optional(), // AI-extracted topics
  urgencySignals: z.array(z.string()).optional(), // "frustrated", "threatening churn", etc.
});

export type Ticket = z.infer<typeof TicketSchema>;

// Normalized Customer
export const CustomerSchema = z.object({
  id: z.string().uuid(),
  externalId: z.string(), // Intercom contact ID
  source: z.literal("intercom"),

  // Basic info
  email: z.string().optional(),
  name: z.string().optional(),
  companyName: z.string().optional(),
  companyId: z.string().optional(),

  // Value metrics
  plan: z.string().optional(), // "free", "starter", "pro", "enterprise"
  planTier: z.enum(["free", "starter", "pro", "enterprise", "unknown"]),
  mrr: z.number().optional(), // Monthly recurring revenue
  lifetimeValue: z.number().optional(),

  // Engagement
  tenureDays: z.number(),
  lastSeenAt: z.date().optional(),
  ticketCount: z.number(),
  avgCsatScore: z.number().optional(),

  // Risk signals
  churnRisk: z.enum(["low", "medium", "high"]).optional(),

  // Timestamps
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Customer = z.infer<typeof CustomerSchema>;

// Normalized Team Member
export const TeamMemberSchema = z.object({
  id: z.string().uuid(),
  externalId: z.string(), // Intercom admin ID
  source: z.literal("intercom"),

  name: z.string(),
  email: z.string(),

  // Team
  teamId: z.string().optional(),
  teamName: z.string().optional(),
  role: z.string().optional(),

  // Availability
  isAvailable: z.boolean(),

  // Performance (calculated from tickets)
  metrics: z.object({
    ticketsHandled: z.number(),
    avgResponseTime: z.number().optional(),
    avgResolutionTime: z.number().optional(),
    avgCsatScore: z.number().optional(),
    csatCount: z.number(),
  }),

  // Timestamps
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type TeamMember = z.infer<typeof TeamMemberSchema>;

// ─────────────────────────────────────────────────────────────
// SYNC STATE
// ─────────────────────────────────────────────────────────────

export const IntercomSyncStateSchema = z.object({
  id: z.string().uuid(),

  // What we last synced
  lastSyncAt: z.date(),
  lastConversationSyncAt: z.date().optional(),
  lastContactSyncAt: z.date().optional(),
  lastCompanySyncAt: z.date().optional(),

  // Pagination cursors (Intercom uses cursor-based pagination)
  conversationCursor: z.string().optional(),
  contactCursor: z.string().optional(),

  // Sync stats
  totalConversationsSynced: z.number(),
  totalContactsSynced: z.number(),
  totalCompaniesSynced: z.number(),

  // Errors
  lastError: z.string().optional(),
  lastErrorAt: z.date().optional(),
  consecutiveErrors: z.number().default(0),
});

export type IntercomSyncState = z.infer<typeof IntercomSyncStateSchema>;

// ─────────────────────────────────────────────────────────────
// WEBHOOK EVENTS
// ─────────────────────────────────────────────────────────────

export const IntercomWebhookEventSchema = z.object({
  type: z.string(), // "notification_event"
  topic: z.enum([
    "conversation.created",
    "conversation.assigned",
    "conversation.closed",
    "conversation.opened",
    "conversation.snoozed",
    "conversation.unsnoozed",
    "conversation.rating.added",
    "conversation.admin.replied",
    "conversation.user.replied",
    "contact.created",
    "contact.updated",
    "company.created",
  ]),
  data: z.object({
    item: z.record(z.unknown()), // The actual entity
  }),
  created_at: z.number(),
});

export type IntercomWebhookEvent = z.infer<typeof IntercomWebhookEventSchema>;
