import { handler, HttpError, isEmail, supabaseAdmin } from './_lib/http.js'
import { esc, layout, sendMail } from './_lib/brevo.js'

/** Mot de passe oublié : lien de récupération Supabase, envoyé par Brevo aux couleurs du Studio. */
export default handler(async (req) => {
  const { email, redirectTo } = req.body ?? {}
  if (!isEmail(email)) throw new HttpError(400, 'Email invalide.')
  const allowed = [process.env.PUBLIC_URL, 'http://localhost:5173'].filter(Boolean) as string[]
  const target =
    typeof redirectTo === 'string' && allowed.some((o) => redirectTo.startsWith(o)) ? redirectTo : `${allowed[0]}/reinitialiser`

  const { data, error } = await supabaseAdmin().auth.admin.generateLink({
    type: 'recovery',
    email: email.trim().toLowerCase(),
    options: { redirectTo: target },
  })
  // Même réponse que le compte existe ou non : aucune fuite d'information.
  if (error || !data?.properties?.action_link) return { ok: true }

  await sendMail({
    to: [{ email: email.trim() }],
    subject: 'Ton nouveau mot de passe · Time To Smile Studio',
    html: layout(
      'Mot de passe oublié',
      `<p>Bonjour,</p><p>Clique sur le bouton ci-dessous pour choisir un nouveau mot de passe. Le lien est valable 1 heure.</p>
<p style="margin:24px 0"><a href="${esc(data.properties.action_link)}" style="background:#F2C12E;color:#0C2830;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px;display:inline-block">Choisir mon mot de passe</a></p>
<p style="color:#6b7478;font-size:12px">Tu n'as rien demandé ? Ignore simplement cet email.</p>`,
    ),
  })
  return { ok: true }
})
