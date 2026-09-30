import { supabase } from './supabase'

/** Appelle une fonction serverless de api/ (JSON). Joint le jeton Supabase si connecté. */
export async function api<T = unknown>(name: string, body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`
  const res = await fetch(`/api/${name}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as { error?: string }).error || `Erreur ${res.status}`)
  return json as T
}
