import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Hero } from '../components/Hero'
import { useSession } from '../lib/session'
import { useToast } from '../lib/toast'

/** Arrivée depuis le lien « mot de passe oublié » : Supabase ouvre la session, on fixe le nouveau mot de passe. */
export default function ResetPassword() {
  const { identity, ready, setPassword } = useSession()
  const nav = useNavigate()
  const toast = useToast()
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      await setPassword(pw)
      toast('Mot de passe enregistré, <b>te voilà connecté·e</b>')
      nav('/', { replace: true })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <Hero title="Choisis ton nouveau mot de passe" />
      <div className="wrap">
        {!ready ? <div className="spinner" /> : identity?.kind !== 'user' ? (
          <div className="auth"><div className="err">Ce lien a expiré ou a déjà servi. Redemande un email depuis « Mot de passe oublié ».</div>
            <button className="btn" onClick={() => nav('/connexion')}>Retour à la connexion</button></div>
        ) : (
          <form className="auth" onSubmit={submit}>
            {err && <div className="err">{err}</div>}
            <div className="field"><label>Compte</label><input value={identity.email} disabled /></div>
            <div className="field">
              <label htmlFor="pw">Nouveau mot de passe</label>
              <input id="pw" type="password" required minLength={8} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
              <small>8 caractères minimum.</small>
            </div>
            <button className="btn" disabled={busy}>{busy ? 'Un instant…' : 'Enregistrer'}</button>
          </form>
        )}
      </div>
    </section>
  )
}
