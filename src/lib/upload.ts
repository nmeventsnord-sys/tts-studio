import { api } from './api'
import { supabase } from './supabase'
import { getAssetBlob } from '../editor/assets'

type Signed = { key: string; path: string; token: string; publicUrl: string }
export type UploadKind = 'image' | 'thumb' | 'export'

const REMOTE_KEY = 'tts-studio-remote-assets'
const remote: Record<string, string> = (() => {
  try { return JSON.parse(localStorage.getItem(REMOTE_KEY) || '{}') } catch { return {} }
})()
const remember = (key: string, url: string) => {
  remote[key] = url
  try { localStorage.setItem(REMOTE_KEY, JSON.stringify(remote)) } catch { /* stockage plein : sans gravité */ }
}

/** Dépose des fichiers dans Storage via des URL signées par api/sign-upload. Renvoie clé → URL publique. */
export async function uploadBlobs(items: { key: string; blob: Blob; kind?: UploadKind }[]): Promise<Record<string, string>> {
  if (!items.length) return {}
  const { files } = await api<{ files: Signed[] }>('sign-upload', {
    files: items.map((i) => ({ key: i.key, type: i.blob.type || 'image/png', kind: i.kind ?? 'image' })),
  })
  const out: Record<string, string> = {}
  await Promise.all(items.map(async (it, n) => {
    const s = files[n]
    const { error } = await supabase.storage.from('template').uploadToSignedUrl(s.path, s.token, it.blob, { contentType: it.blob.type, upsert: true })
    if (error) throw new Error("Un fichier n'a pas pu être envoyé : " + error.message)
    out[it.key] = s.publicUrl
  }))
  return out
}

/**
 * URL publiques des images du client (clés srcKey) : envoie celles qui ne sont pas encore en ligne.
 * Une image déjà envoyée n'est jamais renvoyée.
 */
export async function ensureRemote(keys: string[]): Promise<Record<string, string>> {
  const todo: { key: string; blob: Blob }[] = []
  const out: Record<string, string> = {}
  for (const k of new Set(keys)) {
    if (remote[k]) { out[k] = remote[k]; continue }
    const blob = await getAssetBlob(k)
    if (blob) todo.push({ key: k, blob })
  }
  const up = await uploadBlobs(todo)
  for (const [k, url] of Object.entries(up)) { remember(k, url); out[k] = url }
  return out
}
