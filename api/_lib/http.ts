import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type Req = VercelRequest
export type Res = VercelResponse

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export function env(name: string): string {
  const v = process.env[name]?.trim()
  if (!v) throw new HttpError(500, `Variable ${name} manquante côté serveur`)
  return v
}

let admin: SupabaseClient | null = null
/** Client Supabase avec la clé service_role : uniquement côté serveur. */
export function supabaseAdmin(): SupabaseClient {
  admin ??= createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'User-Agent': 'tts-studio-api' } },
  })
  return admin
}

/** Utilisateur Supabase derrière le jeton Bearer (ou null si invité). */
export async function currentUser(req: Req) {
  const h = req.headers.authorization
  if (!h?.startsWith('Bearer ')) return null
  const { data } = await supabaseAdmin().auth.getUser(h.slice(7))
  return data.user ?? null
}

export const isEmail = (s: unknown): s is string => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
export const str = (s: unknown, max = 200) => (typeof s === 'string' ? s.trim().slice(0, max) : '')

/** Enveloppe commune : POST uniquement, erreurs JSON lisibles en français. */
export function handler(fn: (req: Req, res: Res) => Promise<unknown>) {
  return async (req: Req, res: Res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })
    try {
      const out = await fn(req, res)
      if (!res.headersSent) res.status(200).json(out ?? { ok: true })
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500
      if (status >= 500) console.error(e)
      res.status(status).json({ error: e instanceof Error ? e.message : 'Erreur inattendue' })
    }
  }
}
