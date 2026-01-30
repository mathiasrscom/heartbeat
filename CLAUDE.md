# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TanStack Start application - a full-stack framework for building next-generation React applications with server functions, streaming, and type safety.

## Core Commands

```bash
# Development
pnpm dev                    # Start dev server on port 3000

# Build
pnpm build                  # Build for production

# Testing
pnpm test                   # Run tests with Vitest

# Database (Drizzle ORM)
pnpm db:generate            # Generate migration files from schema
pnpm db:migrate             # Run migrations
pnpm db:push                # Push schema changes directly to DB
pnpm db:studio              # Open Drizzle Studio for database management

# Linting & Formatting
pnpm lint                   # Run Biome linter
pnpm format                 # Format code with Biome
pnpm check                  # Run Biome check (lint + format)
```

## Architecture

### Routing

File-based routing via TanStack Router. Routes are defined in `src/routes/`:

- `src/routes/__root.tsx` - Root layout component (appears in all routes via `<Outlet />`)
- `src/routes/index.tsx` - Home page route
- `src/routes/api/$.ts` - API endpoint for Better Auth (handles all auth requests)

Routes use `createFileRoute` from `@tanstack/react-router`. API routes are file-based under `src/routes/api/`.

### Server Functions

Server functions are defined using the `server` key in route configuration. They execute on the server:

```tsx
export const Route = createFileRoute('/api/example')({
  server: {
    handlers: {
      GET: () => { /* server code */ }
    }
  }
})
```

### Database Layer

- Schema defined in `src/db/schema.ts`
- Drizzle client in `src/db/index.ts` (connects to PostgreSQL via `DATABASE_URL`)
- Use `db` export for queries throughout the app

### Authentication

Better Auth integration:

- Server config: `src/lib/auth.ts` - Auth instance with email/password and TanStack Start cookies plugin
- Client config: `src/lib/auth-client.ts` - React client for authentication hooks

To add authentication to a route, use the auth client from `@/lib/auth-client`.

### Styling & UI

- Tailwind CSS (configured via `@tailwindcss/vite`)
- Shadcn UI components (via `components.json` configuration)
- Utility functions in `src/lib/utils.ts` (cn helper for class merging)

### Path Aliases

The project uses `@/*` alias for `./src/*`. This is configured in `tsconfig.json` and `vite.config.ts`.

## Common Patterns

### Adding a new route

Create a new file in `src/routes/` with `createFileRoute`. TanStack will auto-generate the route tree.

### Adding an API route

Create a file under `src/routes/api/`. Use the `server.handlers` pattern for server functions.

### Database operations

Import and use the `db` instance from `@/db`:

```tsx
import { db } from '@/db'

// Example query
const todos = await db.select().from(todos)
```