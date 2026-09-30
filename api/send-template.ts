import { env, handler, HttpError, isEmail, str } from './_lib/http.js'

/**
 * Relais vers Zing : POST {ZING_API_URL}/api/send-template.
 * - template terminé : png_base64 (PNG natif, trous transparents) + annotated_base64 (plan JPEG annoté)
 * - parcours Canva : lien_canva
 */
export default handler(async (req) => {
  const b = req.body ?? {}
  if (!isEmail(b.email)) throw new HttpError(400, 'Email invalide.')
  const payload: Record<string, unknown> = { email: b.email.trim().toLowerCase(), prenom: str(b.prenom, 80), nom: str(b.nom, 80) }

  if (b.lien_canva) {
    const lien = str(b.lien_canva, 500)
    if (!/^https:\/\/(www\.)?canva\.(com|link)\//i.test(lien))
      throw new HttpError(400, 'Le lien doit être un lien Canva (https://www.canva.com/design/…).')
    payload.lien_canva = lien
  } else {
    if (typeof b.png_base64 !== 'string' || typeof b.annotated_base64 !== 'string') throw new HttpError(400, 'Fichiers du template manquants.')
    payload.png_base64 = b.png_base64
    payload.annotated_base64 = b.annotated_base64
  }
  for (const k of ['theme', 'format', 'projet'] as const) if (b[k]) payload[k] = str(b[k], 200)

  const res = await fetch(`${env('ZING_API_URL').replace(/\/$/, '')}/api/send-template`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  if (!res.ok) {
    console.error('Zing send-template', res.status, text.slice(0, 500))
    throw new HttpError(502, "Zing n'a pas accepté l'envoi. Réessaie ou écris-nous via « Besoin d'aide ? ».")
  }
  try { return { ok: true, zing: JSON.parse(text) } } catch { return { ok: true } }
})
