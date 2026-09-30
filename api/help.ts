import { createHmac, timingSafeEqual } from 'node:crypto'
import { currentUser, env, handler, HttpError, isEmail, str, supabaseAdmin } from './_lib/http.js'
import { esc, layout, sendMail } from './_lib/brevo.js'

/**
 * « Besoin d'aide ? » : fil de messages client ↔ Time To Smile (table messages).
 * - compte : identifié par son jeton Supabase ;
 * - invité : identifié par son email + un jeton signé remis à son 1er message
 *   (corrige l'existant où connaître un email suffisait pour lire le fil).
 * Chaque message client déclenche un email Brevo vers l'équipe (réponse directe au client).
 *
 * actions : send { body, project_id?, project_name?, guest? } · list { guest? } · read { guest? }
 */

type Guest = { email: string; name?: string; token?: string }

const secret = () => process.env.STUDIO_SECRET?.trim() || env('SUPABASE_SERVICE_ROLE_KEY')
const sign = (email: string) => createHmac('sha256', secret()).update('guest:' + email.toLowerCase()).digest('base64url')
const valid = (email: string, token?: string) => {
  if (!token) return false
  const a = Buffer.from(sign(email))
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}
const UUID = /^[0-9a-f-]{36}$/i

export default handler(async (req) => {
  const b = req.body ?? {}
  const action = String(b.action ?? '')
  const user = await currentUser(req)
  const guest = (b.guest ?? null) as Guest | null
  const db = supabaseAdmin().from('messages')

  // Qui parle ?
  let who: { kind: 'user'; id: string; email: string; name: string } | { kind: 'guest'; email: string; name: string }
  if (user) {
    const m = user.user_metadata ?? {}
    who = { kind: 'user', id: user.id, email: user.email ?? '', name: `${m.prenom ?? ''} ${m.nom ?? ''}`.trim() }
  } else if (guest && isEmail(guest.email)) {
    who = { kind: 'guest', email: guest.email.trim().toLowerCase(), name: str(guest.name, 120) }
  } else throw new HttpError(401, 'Identifie-toi pour écrire à notre équipe.')

  // Filtre « fil de ce client » (compte : user_id ; invité : son email, sans compte).
  type Filterable = { eq: (c: string, v: string) => Filterable; is: (c: string, v: null) => Filterable }
  const scope = <T,>(q: T): T => {
    const f = q as unknown as Filterable
    return (who.kind === 'user' ? f.eq('user_id', who.id) : f.is('user_id', null).eq('guest_email', who.email)) as unknown as T
  }

  if (action === 'send') {
    const body = str(b.body, 4000)
    if (!body) throw new HttpError(400, 'Écris ton message.')
    // Invité : le jeton (qui donne la LECTURE du fil) n'est remis qu'au 1er message ou sur présentation
    // d'un jeton valide ; écrire reste toujours possible (réponse de l'équipe aussi par email).
    let giveToken = who.kind === 'guest' && valid(who.email, guest?.token)
    if (who.kind === 'guest' && !giveToken) {
      const { count } = await scope(db.select('id', { count: 'exact', head: true }))
      giveToken = !count
    }
    const projectId = typeof b.project_id === 'string' && UUID.test(b.project_id) ? b.project_id : null
    const { error } = await db.insert({
      user_id: who.kind === 'user' ? who.id : null,
      guest_email: who.kind === 'guest' ? who.email : null,
      guest_name: who.kind === 'guest' ? who.name : null,
      project_id: who.kind === 'user' ? projectId : null,
      sender: 'client',
      body,
      read: false,
    })
    if (error) throw new HttpError(500, "Le message n'a pas pu être enregistré.")

    const to = process.env.HELP_NOTIFY_EMAIL?.trim() || 'contact@timetosmile.fr'
    const project = str(b.project_name, 160)
    await sendMail({
      to: [{ email: to, name: 'Time To Smile' }],
      replyTo: { email: who.email, name: who.name || who.email },
      subject: `Studio · message de ${who.name || who.email}`,
      html: layout('Nouveau message du Studio', `<p><b>${esc(who.name || 'Client')}</b> · ${esc(who.email)}${who.kind === 'guest' ? ' (invité)' : ''}</p>
${project ? `<p style="color:#6b7478">Projet : ${esc(project)}</p>` : ''}
<div style="background:#F7F5F2;border-radius:10px;padding:14px 16px;white-space:pre-wrap">${esc(body)}</div>
<p style="color:#6b7478;font-size:12px">Réponds directement à cet email pour écrire au client.</p>`),
    }).catch((e) => console.error('Brevo aide', e)) // le message est enregistré même si l'email échoue
    return { ok: true, token: who.kind === 'guest' && giveToken ? sign(who.email) : undefined }
  }

  if (action === 'list' || action === 'read') {
    if (who.kind === 'guest' && !valid(who.email, guest?.token)) return { messages: [], unread: 0 }
    if (action === 'read') {
      await scope(supabaseAdmin().from('messages').update({ read: true })).neq('sender', 'client').eq('read', false)
      return { ok: true }
    }
    const { data, error } = await scope(db.select('id, sender, body, created_at, read')).order('created_at', { ascending: true }).limit(200)
    if (error) throw new HttpError(500, 'Messages indisponibles.')
    const messages = (data ?? []).map((m) => ({ id: m.id, from: m.sender === 'client' ? 'client' : 'team', body: m.body, at: m.created_at, read: m.read }))
    return { messages, unread: messages.filter((m) => m.from === 'team' && !m.read).length }
  }

  throw new HttpError(400, 'Action inconnue.')
})
