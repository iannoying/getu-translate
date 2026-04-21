import { createAuthClient } from "better-auth/react"

// NOTE: API serves better-auth at /api/identity (set via `basePath` on server).
// The client's baseURL must include that mount path so it calls the right URL
// (default would be /api/auth, returning 404 without CORS headers).
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8788"

export const authClient = createAuthClient({
  baseURL: `${API_BASE}/api/identity`,
})
