import { currentUser, handler, HttpError, supabaseAdmin } from './_lib/http.js'

/**
 * Mode master : l'équipe Time To Smile rouvre et retouche le projet d'un client
 * (/editeur?master=<id>). Accès réservé aux comptes Zing « admin » ou « collaborateur »
 * (table user_roles) — contrairement à l'existant, qui lisait le jeton de l'ERP dans le navigateur.
 *
 * actions : get { id } · save { id, since?, name?, canvas_json, preview_url? }
 */
const UUID = /^[0-9a-f-]{36}$/i
const COLS = 'id,user_id,name,parcours,theme_id,format_key,preview_url,status,master_edited,master_edited_at,updated_at,created_at,sent_at'

export default handler(async (req) => {
  const user = await currentUser(req)
  if (!user) throw new HttpError(401, 'Connecte-toi avec ton compte Time To Smile.')
  const admin = supabaseAdmin()
  const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', user.id)
  if (!roles?.some((r) => r.role === 'admin' || r.role === 'collaborateur')) throw new HttpError(403, "Ce compte n'a pas accès au mode Time To Smile.")

  const b = req.body ?? {}
  if (typeof b.id !== 'string' || !UUID.test(b.id)) throw new HttpError(400, 'Projet invalide.')

  if (b.action === 'get') {
    const { data, error } = await admin.from('client_projects').select(COLS + ',canvas_json').eq('id', b.id).maybeSingle()
    if (error) throw new HttpError(500, error.message)
    if (!data) throw new HttpError(404, 'Projet introuvable.')
    const { data: owner } = await admin.auth.admin.getUserById((data as unknown as { user_id: string }).user_id)
    const m = owner?.user?.user_metadata ?? {}
    return { project: data, client: { email: owner?.user?.email ?? '', prenom: m.prenom ?? '', nom: m.nom ?? '' } }
  }

  if (b.action === 'save') {
    if (!b.canvas_json || typeof b.canvas_json !== 'object') throw new HttpError(400, 'Contenu manquant.')
    const patch: Record<string, unknown> = { canvas_json: b.canvas_json, master_edited: true, master_edited_at: new Date().toISOString() }
    if (typeof b.name === 'string' && b.name.trim()) patch.name = b.name.trim().slice(0, 120)
    if (typeof b.preview_url === 'string' && b.preview_url.includes('/storage/v1/object/public/template/')) patch.preview_url = b.preview_url
    let q = admin.from('client_projects').update(patch).eq('id', b.id)
    if (typeof b.since === 'string') q = q.eq('updated_at', b.since)
    const { data, error } = await q.select(COLS).maybeSingle()
    if (error) throw new HttpError(500, error.message)
    if (!data) {
      const { data: current } = await admin.from('client_projects').select(COLS).eq('id', b.id).maybeSingle()
      return { conflict: true, current }
    }
    return { project: data }
  }

  throw new HttpError(400, 'Action inconnue.')
})
