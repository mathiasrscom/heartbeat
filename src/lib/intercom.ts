/**
 * Intercom API Client
 *
 * Handles authentication and API calls to Intercom.
 * Docs: https://developers.intercom.com/docs/references/rest-api/api.intercom.io/
 */

const DEFAULT_INTERCOM_API_BASE = "https://api.intercom.io"
const INTERCOM_API_VERSION = "2.14"

interface IntercomConfig {
  accessToken: string
  appUrl?: string | null
  apiBaseUrl?: string | null
  apiVersion?: string
}

const EUROPE_APP_HOST = "app.eu.intercom.com"
const AUSTRALIA_APP_HOST = "app.au.intercom.com"
const EUROPE_API_BASE = "https://api.eu.intercom.io"
const AUSTRALIA_API_BASE = "https://api.au.intercom.io"

function normalizeBaseUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    const parsed = new URL(trimmed)
    return parsed.origin.replace(/\/$/, "")
  } catch {
    return null
  }
}

function resolveBaseUrlFromAppUrl(appUrl?: string | null) {
  if (!appUrl) return null

  try {
    const parsed = new URL(appUrl)
    if (parsed.hostname === EUROPE_APP_HOST) return EUROPE_API_BASE
    if (parsed.hostname === AUSTRALIA_APP_HOST) return AUSTRALIA_API_BASE
    return DEFAULT_INTERCOM_API_BASE
  } catch {
    return null
  }
}

export function resolveIntercomApiBaseUrl(config: {
  appUrl?: string | null
  apiBaseUrl?: string | null
}) {
  const explicit = config.apiBaseUrl ? normalizeBaseUrl(config.apiBaseUrl) : null
  if (explicit) return explicit

  const fromAppUrl = resolveBaseUrlFromAppUrl(config.appUrl)
  if (fromAppUrl) return fromAppUrl

  return DEFAULT_INTERCOM_API_BASE
}

export class IntercomApiError extends Error {
  status: number
  endpoint: string
  responseBody: string

  constructor(input: {
    status: number
    endpoint: string
    responseBody: string
  }) {
    super(`Intercom API error (${input.status}): ${input.responseBody}`)
    this.name = "IntercomApiError"
    this.status = input.status
    this.endpoint = input.endpoint
    this.responseBody = input.responseBody
  }
}

export function isIntercomApiError(error: unknown): error is IntercomApiError {
  return error instanceof IntercomApiError
}

// Types for Intercom API responses
export interface IntercomConversation {
  id: string
  type: "conversation"
  created_at: number
  updated_at: number
  waiting_since?: number | null
  snoozed_until?: number | null
  state: "open" | "closed" | "snoozed"
  priority: "priority" | "not_priority" | null
  source: {
    type: string
    id?: string
    subject?: string
    body?: string
    author: {
      type: string
      id: string
      name?: string
      email?: string
    }
  }
  contacts: {
    contacts: Array<{
      id: string
      external_id?: string
    }>
  }
  assignee?: {
    type?: string
    id?: string
    name?: string
    email?: string
  }
  team?: {
    id: string
    name?: string
  }
  admin_assignee_id?: string | null
  team_assignee_id?: string
  tags: {
    tags: Array<{
      id: string
      name: string
    }>
  }
  statistics?: {
    first_contact_reply_at?: number
    first_admin_reply_at?: number
    last_contact_reply_at?: number
    last_admin_reply_at?: number
    time_to_first_reply?: number
    time_to_admin_reply?: number
    time_to_last_close?: number
    time_to_first_close?: number
  }
  sla_applied?: {
    sla_name?: string
    sla_status?: string | null
    first_response?: {
      due_at?: number | null
    }
  }
  conversation_rating?: {
    rating: number
    remark?: string
    created_at: number
  }
  custom_attributes?: Record<string, unknown>
  ai_agent?: {
    rating?: number | string | null
    rating_remark?: string | null
  }
}

export interface IntercomTicket {
  id: string
  type: "ticket"
  ticket_id?: string
  category?: string
  open?: boolean
  created_at: number
  updated_at: number
  ticket_attributes?: Record<string, unknown>
  ticket_state?:
    | string
    | {
        id?: string
        name?: string
        state?: string
      }
    | null
  ticket_state_internal_label?: string
  ticket_state_external_label?: string
  ticket_type?: {
    id: string
    name?: string
  } | null
  contacts?: {
    contacts: Array<{
      id: string
      external_id?: string
    }>
  }
  admin_assignee_id?: string | null
  team_assignee_id?: string | null
  tags?: {
    tags: Array<{
      id: string
      name: string
    }>
  }
}

export interface IntercomContact {
  id: string
  type: "contact"
  external_id?: string
  email?: string
  name?: string
  phone?: string
  companies?: {
    companies: Array<{
      id: string
      name?: string
    }>
  }
  custom_attributes?: Record<string, unknown>
  created_at: number
  updated_at: number
}

export interface IntercomAdmin {
  id: string
  type: "admin"
  name: string
  email: string
  team_ids?: string[]
  avatar?: {
    image_url?: string | null
  } | null
  avatar_url?: string | null
  profile_image_url?: string | null
}

export interface IntercomTeam {
  id: string
  type: "team"
  name: string
}

export interface IntercomListResponse<T> {
  type: "list" | "conversation.list" | "admin.list" | "team.list"
  data?: T[]
  conversations?: T[]
  tickets?: T[]
  admins?: T[]
  teams?: T[]
  pages?: {
    next?:
      | string
      | {
          starting_after?: string
          page?: number
        }
    page: number
    per_page: number
    total_pages: number
  }
}

// Create the client
export function createIntercomClient(config: IntercomConfig) {
  const { accessToken } = config
  const apiBaseUrl = resolveIntercomApiBaseUrl({
    appUrl: config.appUrl,
    apiBaseUrl: config.apiBaseUrl,
  })
  const apiVersion = config.apiVersion ?? INTERCOM_API_VERSION

  async function request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${apiBaseUrl}${endpoint}`

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "Intercom-Version": apiVersion,
        ...options.headers,
      },
    })

    if (!response.ok) {
      const error = await response.text()
      throw new IntercomApiError({
        status: response.status,
        endpoint,
        responseBody: error,
      })
    }

    return response.json()
  }

  return {
    // List conversations with pagination
    async listConversations(params?: {
      per_page?: number
      starting_after?: string
    }): Promise<IntercomListResponse<IntercomConversation>> {
      const searchParams = new URLSearchParams()
      if (params?.per_page) searchParams.set("per_page", String(params.per_page))
      if (params?.starting_after) searchParams.set("starting_after", params.starting_after)

      const query = searchParams.toString()
      return request(`/conversations${query ? `?${query}` : ""}`)
    },

    // Get a single conversation
    async getConversation(id: string): Promise<IntercomConversation> {
      return request(`/conversations/${id}`)
    },

    // Search conversations (more flexible)
    async searchConversations(
      query: {
        field: string
        operator: string
        value: string | number | boolean
      }[],
      params?: {
        per_page?: number
        starting_after?: string
      }
    ): Promise<IntercomListResponse<IntercomConversation>> {
      return request("/conversations/search", {
        method: "POST",
        body: JSON.stringify({
          query: {
            operator: "AND",
            value: query,
          },
          pagination: {
            per_page: params?.per_page ?? 50,
            ...(params?.starting_after
              ? { starting_after: params.starting_after }
              : {}),
          },
        }),
      })
    },

    // List contacts
    async listContacts(params?: {
      per_page?: number
      starting_after?: string
    }): Promise<IntercomListResponse<IntercomContact>> {
      const searchParams = new URLSearchParams()
      if (params?.per_page) searchParams.set("per_page", String(params.per_page))
      if (params?.starting_after) searchParams.set("starting_after", params.starting_after)

      const query = searchParams.toString()
      return request(`/contacts${query ? `?${query}` : ""}`)
    },

    // Get a single contact
    async getContact(id: string): Promise<IntercomContact> {
      return request(`/contacts/${id}`)
    },

    async searchTickets(
      query: {
        field: string
        operator: string
        value: string | number | boolean
      }[],
      params?: {
        per_page?: number
        starting_after?: string
      }
    ): Promise<IntercomListResponse<IntercomTicket>> {
      return request("/tickets/search", {
        method: "POST",
        body: JSON.stringify({
          query: {
            operator: "AND",
            value: query,
          },
          pagination: {
            per_page: params?.per_page ?? 50,
            ...(params?.starting_after
              ? { starting_after: params.starting_after }
              : {}),
          },
        }),
      })
    },

    async listTickets(params?: {
      per_page?: number
      starting_after?: string
    }): Promise<IntercomListResponse<IntercomTicket>> {
      return this.searchTickets(
        [
          {
            field: "created_at",
            operator: ">",
            value: 0,
          },
        ],
        params
      )
    },

    async getTicket(id: string): Promise<IntercomTicket> {
      return request(`/tickets/${id}`)
    },

    // List admins (team members)
    async listAdmins(params?: {
      per_page?: number
      starting_after?: string
    }): Promise<IntercomListResponse<IntercomAdmin>> {
      const searchParams = new URLSearchParams()
      if (params?.per_page) searchParams.set("per_page", String(params.per_page))
      if (params?.starting_after) searchParams.set("starting_after", params.starting_after)

      const query = searchParams.toString()
      return request(`/admins${query ? `?${query}` : ""}`)
    },

    async getAdmin(id: string): Promise<IntercomAdmin> {
      return request(`/admins/${id}`)
    },

    async listTeams(params?: {
      per_page?: number
      starting_after?: string
    }): Promise<IntercomListResponse<IntercomTeam>> {
      const searchParams = new URLSearchParams()
      if (params?.per_page) searchParams.set("per_page", String(params.per_page))
      if (params?.starting_after) searchParams.set("starting_after", params.starting_after)

      const query = searchParams.toString()
      return request(`/teams${query ? `?${query}` : ""}`)
    },

    // Get current admin (for testing auth)
    async me(): Promise<{ type: string; id: string; name: string; email: string }> {
      return request("/me")
    },

    // Test connection
    async testConnection(): Promise<boolean> {
      try {
        await this.me()
        return true
      } catch {
        return false
      }
    },
  }
}

export type IntercomClient = ReturnType<typeof createIntercomClient>
