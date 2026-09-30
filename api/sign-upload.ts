import { currentUser, handler, HttpError, supabaseAdmin } from './_lib/http.js'

export const BUCKET = 'template'
const TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * URL de dépôt signées (bucket « template », dossier studio/<compte ou invites>/).
 * Le navigateur envoie ensuite le fichier directement à Storage : aucune limite de taille Vercel,
 * aucun droit d'écriture anonyme nécessaire, noms non devinables (UUID).
 */
export default handler(async (req) => {
  const files = (req.body?.files ?? []) as { key?: string; type?: string; kind?: string }[]
  if (!Array.isArray(files) || !files.length || files.length > 40) throw new HttpError(400, 'Liste de fichiers invalide.')
  const user = await currentUser(req)
  const owner = user?.id ?? 'invites'
  const store = supabaseAdmin().storage.from(BUCKET)

  const out = []
  for (const f of files) {
    if (!f.key || !UUID.test(f.key)) throw new HttpError(400, 'Identifiant de fichier invalide.')
    const ext = TYPES[f.type ?? '']
    if (!ext) throw new HttpError(400, 'Type de fichier non accepté.')
    const folder = f.kind === 'export' ? 'envois' : f.kind === 'thumb' ? 'miniatures' : 'images'
    const path = `studio/${owner}/${folder}/${f.key}.${ext}`
    const { data, error } = await store.createSignedUploadUrl(path, { upsert: true })
    if (error || !data) throw new HttpError(502, 'Dépôt de fichier indisponible, réessaie.')
    out.push({ key: f.key, path, token: data.token, publicUrl: store.getPublicUrl(path).data.publicUrl })
  }
  return { files: out }
})
