# Heartbeat - CX Intelligence Platform

## Architecture Overview

Heartbeat is a **standalone CX intelligence app** that helps teams know exactly what to focus on. Users configure actions via natural language, and the system analyzes data to surface 80/20 opportunities.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         HEARTBEAT (Main Application)                         │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Action Builder (Natural Language)                                   │   │
│  │  "Alert me when enterprise CSAT drops below 8"                      │   │
│  │                           ↓                                          │   │
│  │  AI Parser → Parses intent, creates structured Action               │   │
│  │                           ↓                                          │   │
│  │  Action stored in DB, executed by background jobs                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │   TanStack   │  │   Drizzle    │  │   Pluggable  │  │    Widget    │   │
│  │    Start     │  │     ORM      │  │   Adapters   │  │    System    │   │
│  │  (Full-stack)│  │ (PostgreSQL) │  │  (Data Src)  │  │  (Dynamic)   │   │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │
│         │                  │                 │                 │           │
│         └──────────────────┴─────────────────┴─────────────────┘           │
│                                    │                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Data Sources (Adapters - Input)                                    │   │
│  │  ├── Intercom (conversations, tickets, CSAT)                        │   │
│  │  └── Future: GitHub, Linear, Slack, Zendesk, Calendar              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Outputs (Integrations - Output)                                    │   │
│  │  ├── Dashboard UI (dynamic widgets, focus items)                    │   │
│  │  ├── Notifications (Slack, email, push)                             │   │
│  │  └── Neuphlo (push insights → create nodes)                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Project Structure (Current)

```
heartbeat/
├── src/
│   ├── routes/                      # TanStack Start file-based routing
│   │   ├── __root.tsx               # Root layout with sidebar
│   │   ├── index.tsx                # Focus page (dashboard home)
│   │   ├── actions.tsx              # Action Builder UI
│   │   ├── settings.tsx             # Settings & integrations
│   │   └── api/
│   │       └── auth/$.ts            # Auth API routes
│   │
│   ├── components/
│   │   ├── ui/                      # shadcn/ui components
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── input.tsx
│   │   │   ├── badge.tsx
│   │   │   └── ...
│   │   ├── widgets/
│   │   │   └── widget-card.tsx      # Dynamic widget renderer
│   │   ├── app-top-nav.tsx          # Main top navigation
│   │   ├── focus-card.tsx           # Focus item card component
│   │   ├── date-range-picker.tsx    # Date selection components
│   │   └── period-selector.tsx      # Period dropdown
│   │
│   ├── lib/
│   │   ├── adapters/                # Pluggable data source adapters
│   │   │   ├── types.ts             # Adapter & Node type definitions
│   │   │   ├── index.ts             # Adapter registry
│   │   │   ├── intercom.ts          # Intercom adapter implementation
│   │   │   └── _template.ts         # Template for new adapters
│   │   │
│   │   ├── actions/                 # Action Builder system
│   │   │   ├── types.ts             # Condition, Output, Action schemas
│   │   │   ├── parser.ts            # NL → structured action parser
│   │   │   ├── executor.ts          # Action execution engine
│   │   │   └── index.ts             # Exports
│   │   │
│   │   ├── widgets/                 # Dynamic widget system
│   │   │   └── types.ts             # Widget declarations & registry
│   │   │
│   │   ├── utils.ts                 # Utility functions (cn, etc.)
│   │   ├── auth.ts                  # Better Auth server config
│   │   ├── auth-client.ts           # Better Auth client
│   │   ├── intercom.ts              # Intercom API client
│   │   └── intercom-sync.ts         # Intercom data sync
│   │
│   ├── db/
│   │   ├── schema.ts                # Drizzle ORM schema definitions
│   │   └── index.ts                 # Database connection
│   │
│   ├── router.tsx                   # TanStack Router config
│   ├── routeTree.gen.ts             # Auto-generated route tree
│   └── styles.css                   # Global styles (Tailwind)
│
├── drizzle/                         # Database migrations
├── public/                          # Static assets
├── ARCHITECTURE.md                  # This file
├── CLAUDE.md                        # Claude assistant context
├── README.md                        # Project readme
├── package.json
├── tsconfig.json
└── app.config.ts                    # TanStack Start config
```

## Core Systems

### 1. Pluggable Adapter Architecture

Adapters are the data source abstraction. Each adapter:
- Connects to an external service (Intercom, GitHub, etc.)
- Normalizes data into **Nodes** (unified data model)
- Declares what **Widgets** it supports

```typescript
// src/lib/adapters/types.ts

interface Adapter {
  id: string                              // 'intercom', 'github', etc.
  name: string                            // Display name
  icon: string                            // Lucide icon name

  // Configuration
  configSchema: z.ZodSchema               // What credentials needed

  // Data operations
  testConnection: (config) => Promise<boolean>
  sync: (config) => Promise<SyncResult>
  normalizeNode: (raw: unknown) => Node   // Transform to unified format

  // Widget declarations
  widgets: WidgetDeclaration[]            // What UI cards this adapter provides
}

// Unified data model (formerly "Item")
interface Node {
  id: string
  externalId: string
  adapterId: string
  type: 'conversation' | 'ticket' | 'issue' | 'message' | 'event'
  title: string
  description?: string
  status: 'open' | 'pending' | 'resolved' | 'closed'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  sentiment?: 'positive' | 'neutral' | 'negative'
  tags: string[]
  entityId?: string                       // Link to customer/entity
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}
```

### 2. Widget System

Widgets are dynamic UI components that appear on the Focus page. They're driven by connected adapters.

```typescript
// src/lib/widgets/types.ts

interface WidgetDeclaration {
  id: string                              // 'intercom-cx-score'
  adapterId: string                       // 'intercom' (or 'universal')
  type: 'stat' | 'gauge' | 'trend' | 'list'
  title: string
  icon: string
  priority: number                        // Sort order
}

interface WidgetData {
  widgetId: string
  value: string | number
  subtitle?: string
  trend?: { direction: 'up' | 'down'; value: number }
  updatedAt: Date
}
```

Available widgets:
- **Universal**: Focus Count, Impact Score, Open Nodes
- **Intercom**: CX Score, Response Time, Active Conversations
- **GitHub** (planned): Open PRs, Issue Velocity
- **Linear** (planned): Backlog Size, Sprint Progress

### 3. Action Builder

Actions are user-configurable rules created via natural language. The AI parser converts natural language into structured conditions and outputs.

```typescript
// src/lib/actions/types.ts

interface Action {
  id: string
  name: string
  description: string
  originalInput: string                   // The natural language input
  category: 'alert' | 'focus_rule' | 'automation' | 'metric' | 'filter'
  enabled: boolean

  conditions: ConditionGroup              // When to trigger
  outputs: Output[]                       // What to do

  fireCount: number
  lastFiredAt?: Date
}

interface Condition {
  field: string                           // 'node.sentiment', 'entity.value.mrr'
  operator: 'equals' | 'contains' | 'greaterThan' | 'lessThan' | ...
  value: unknown
}

interface Output {
  type: 'notify' | 'tag' | 'assign' | 'focus' | 'create_node' | 'webhook'
  config: Record<string, unknown>
}
```

Action lifecycle:
1. User types: "Alert me when enterprise customers have negative sentiment"
2. AI parser extracts conditions and outputs
3. Action saved to database
4. Executor evaluates action on each sync cycle
5. When triggered → outputs executed (notification, tag, etc.)

### 4. Database Schema (Drizzle ORM)

```typescript
// src/db/schema.ts

// Core tables
nodes                    // Unified data from all adapters
entities                 // Customers/companies
adapterConfigs           // Encrypted adapter credentials
actions                  // User-defined rules
reports                  // Generated reports

// Enums
nodeTypeEnum             // conversation, ticket, issue, message, event
nodeStatusEnum           // open, pending, resolved, closed
priorityEnum             // low, medium, high, urgent
sentimentEnum            // positive, neutral, negative
actionCategoryEnum       // alert, focus_rule, automation, metric, filter
```

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | TanStack Start | Full-stack React framework |
| Routing | TanStack Router | Type-safe file-based routing |
| Styling | Tailwind CSS + shadcn/ui | Utility-first CSS + components |
| Database | Drizzle ORM + PostgreSQL | Type-safe ORM |
| Auth | Better Auth | Authentication |
| AI | Configurable (OpenAI, Anthropic, Ollama) | NL parsing, analysis |

## Design Principles

### UI/UX
- **Compact by default**: Minimal padding, small text sizes
- **Consistent rounding**: `rounded-lg` for cards, `rounded-md` for interactive elements
- **Dynamic content**: Widgets adapt based on connected adapters
- **Focus-first**: 80/20 prioritization surfaces what matters most

### Architecture
- **Adapter pattern**: New data sources are just new adapters
- **Schema-driven**: Zod schemas for all configuration
- **Type-safe**: End-to-end TypeScript
- **Separation of concerns**: Adapters, Widgets, Actions are independent systems

## Adding a New Adapter

1. Create `src/lib/adapters/[name].ts` (copy from `_template.ts`)
2. Implement the `Adapter` interface
3. Define widget declarations
4. Register in `src/lib/adapters/index.ts`
5. Add credentials UI in Settings

```typescript
// Example: GitHub adapter
export const githubAdapter: Adapter = {
  id: 'github',
  name: 'GitHub',
  icon: 'Github',

  configSchema: z.object({
    accessToken: z.string(),
    org: z.string().optional(),
  }),

  widgets: [
    { id: 'github-open-prs', type: 'stat', title: 'Open PRs', ... },
    { id: 'github-issue-velocity', type: 'trend', title: 'Issue Velocity', ... },
  ],

  async sync(config) { /* ... */ },
  normalizeNode(issue) { /* ... */ },
}
```

## Next Steps

1. [ ] Wire up real Intercom data sync
2. [ ] Implement action executor background job
3. [ ] Add GitHub and Linear adapters
4. [ ] Build report generation system
5. [ ] Create MCP server for Claude integration
6. [ ] Add notification outputs (Slack, email)
