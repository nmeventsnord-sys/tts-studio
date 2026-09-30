import { handler, HttpError, isEmail, str, supabaseAdmin } from './_lib/http.js'

/** Création de compte déjà confirmé (pas d'email de confirmation) ; le client se connecte ensuite. */
export default handler(async (req) => {
  const { email, password, prenom, nom } = req.body ?? {}
  if (!isEmail(email)) throw new HttpError(400, 'Email invalide.')
  if (typeof password !== 'string' || password.length < 8) throw new HttpError(400, 'Le mot de passe doit faire au moins 8 caractères.')
  if (!str(prenom)) throw new HttpError(400, 'Indique ton prénom.')

  const { error } = await supabaseAdmin().auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: { prenom: str(prenom, 80), nom: str(nom, 80), source: 'tts-studio' },
  })
  if (error) {
    if (/already|registered|exists/i.test(error.message))
      throw new HttpError(409, 'Un compte existe déjà avec cet email : connecte-toi ou utilise « Mot de passe oublié ».')
    throw new HttpError(400, error.message)
  }
  return { ok: true }
})
