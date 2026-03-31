import { config } from "dotenv"
import { drizzle } from 'drizzle-orm/node-postgres'

import * as schema from './schema.ts'

config({ path: [".env.local", ".env"] })

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is not configured. Add it to your shell or create a .env.local file."
  )
}

export const db = drizzle(databaseUrl, { schema })
