import { api } from './api'
import type { Identity } from './session'

export type HelpMessage = { id: string; from: 'client' | 'team'; body: string; at: string; read: boolean }

const tokenKey = (email: string) => `tts-studio-aide:${email.toLowerCase()}`

/** Appel de api/help : un invité joint son email, son nom et le jeton qui lui donne accès à son fil. */
async function call<T>(identity: Identity, action: string, extra: Record<string, unknown> = {}) {
  const guest = identity.kind === 'guest'
    ? { email: identity.email, name: `${identity.prenom} ${identity.nom}`.trim(), token: localStorage.getItem(tokenKey(identity.email)) ?? undefined }
    : undefined
  return api<T>('help', { action, guest, ...extra })
}

export async function sendHelp(identity: Identity, body: string, project?: { id?: string; name?: string }) {
  const r = await call<{ ok: boolean; token?: string }>(identity, 'send', { body, project_id: project?.id, project_name: project?.name })
  if (r.token && identity.kind === 'guest') localStorage.setItem(tokenKey(identity.email), r.token)
  return r
}

export const listHelp = (identity: Identity) => call<{ messages: HelpMessage[]; unread: number }>(identity, 'list')
export const markHelpRead = (identity: Identity) => call<{ ok: boolean }>(identity, 'read')
/** Un invité sans jeton n'a pas encore de fil lisible sur cet appareil. */
export const canReadHelp = (identity: Identity) => identity.kind === 'user' || !!localStorage.getItem(tokenKey(identity.email))
