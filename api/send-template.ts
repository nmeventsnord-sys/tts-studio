import { env, handler, HttpError, isEmail, str } from './_lib/http.js'

/**
 * Relais vers Zing : POST {ZING_API_URL}/api/send-template (même contrat que l'ancien Studio).
 * - template terminé : png_url (PNG natif, trous transparents) + annotated_url (plan JPEG annoté),
 *   déposés au préalable dans Storage par URL signées ;
 * - parcours Canva : lien_canva (+ devis, date_event).
 * Contrairement à l'existant, la réponse de Zing est attendue et vérifiée avant d'annoncer « reçu ».
 */
export default handler(async (req) => {
  const b = req.body ?? {}
  if (!isEmail(b.email)) throw new HttpError(400, 'Email invalide.')
  const payload: Record<string, unknown> = {
    email: b.email.trim().toLowerCase(),
    prenom: str(b.prenom, 80),
    nom: str(b.nom, 80),
    template: str(b.template, 160),
    format: str(b.format, 120),
  }

  if (b.lien_canva) {
    const lien = str(b.lien_canva, 500)
    if (!/^https:\/\/(www\.)?canva\.(com|link)\//i.test(lien)) throw new HttpError(400, 'Le lien doit être un lien Canva (https://www.canva.com/design/…).')
    Object.assign(payload, { lien_canva: lien, devis: str(b.devis, 40), date_event: str(b.date_event, 40), template: 'Design Canva', format: 'Canva' })
  } else {
    // Seules nos propres URL de Storage sont relayées (pas d'URL arbitraire vers Zing).
    const base = `${env('SUPABASE_URL').replace(/\/$/, '')}/storage/v1/object/public/template/studio/`
    const ok = (u: unknown) => typeof u === 'string' && u.startsWith(base) && u.length < 400
    if (!ok(b.png_url) || !ok(b.annotated_url)) throw new HttpError(400, 'Fichiers du template manquants ou invalides.')
    Object.assign(payload, { png_url: b.png_url, annotated_url: b.annotated_url })
  }

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
