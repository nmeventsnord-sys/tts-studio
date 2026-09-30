import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Hero } from '../components/Hero'
import { useSession } from '../lib/session'

type Tab = 'login' | 'signup' | 'guest' | 'forgot'

export default function Auth() {
  const { identity, signIn, signUp, forgot, startGuest } = useSession()
  const nav = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/'
  const [tab, setTab] = useState<Tab>('login')
  const [f, setF] = useState({ prenom: '', nom: '', email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [sent, setSent] = useState(false)

  if (identity) return <Navigate to={from} replace />

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const switchTab = (t: Tab) => { setTab(t); setErr(''); setSent(false) }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      if (tab === 'login') await signIn(f.email, f.password)
      else if (tab === 'signup') await signUp(f)
      else if (tab === 'guest') startGuest(f)
      else { await forgot(f.email); setSent(true); return }
      nav(from, { replace: true })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const title = { login: 'Connecte-toi pour créer ton template', signup: 'Crée ton espace Studio', guest: 'Continuer sans compte', forgot: 'Mot de passe oublié' }[tab]

  return (
    <section>
      <Hero title={title} sub="Utilise l'email de ta réservation : c'est lui qui relie ton design à ton dossier." />
      <div className="wrap">
        <form className="auth" onSubmit={submit}>
          {tab !== 'forgot' && (
            <div className="tabs" role="tablist">
              <button type="button" className={tab === 'login' ? 'on' : ''} onClick={() => switchTab('login')}>Connexion</button>
              <button type="button" className={tab === 'signup' ? 'on' : ''} onClick={() => switchTab('signup')}>Créer un compte</button>
              <button type="button" className={tab === 'guest' ? 'on' : ''} onClick={() => switchTab('guest')}>Invité</button>
            </div>
          )}
          {err && <div className="err">{err}</div>}
          {tab === 'guest' && <div className="info">Sans compte, tes projets restent sur cet appareil. Crée un compte pour les retrouver partout.</div>}
          {tab === 'forgot' && !sent && <div className="info">Indique ton email : tu recevras un lien pour choisir un nouveau mot de passe.</div>}
          {sent && <div className="info">Si un compte existe pour <b>{f.email}</b>, un email vient de partir. Pense à regarder dans les indésirables.</div>}

          {(tab === 'signup' || tab === 'guest') && (
            <div className="two">
              <div className="field"><label htmlFor="prenom">Prénom</label><input id="prenom" required autoComplete="given-name" value={f.prenom} onChange={set('prenom')} /></div>
              <div className="field"><label htmlFor="nom">Nom</label><input id="nom" required={tab === 'guest'} autoComplete="family-name" value={f.nom} onChange={set('nom')} /></div>
            </div>
          )}
          {!sent && (
            <div className="field">
              <label htmlFor="email">Email de ta réservation</label>
              <input id="email" type="email" required autoComplete="email" value={f.email} onChange={set('email')} />
            </div>
          )}
          {(tab === 'login' || tab === 'signup') && (
            <div className="field">
              <label htmlFor="pw">Mot de passe</label>
              <input id="pw" type="password" required minLength={tab === 'signup' ? 8 : undefined} autoComplete={tab === 'signup' ? 'new-password' : 'current-password'} value={f.password} onChange={set('password')} />
              {tab === 'signup' && <small>8 caractères minimum.</small>}
            </div>
          )}

          {!sent && (
            <button className="btn" disabled={busy}>
              {busy ? 'Un instant…' : { login: 'Se connecter', signup: 'Créer mon compte', guest: 'Commencer en invité', forgot: 'Recevoir le lien' }[tab]}
            </button>
          )}
          <p className="note">
            {tab === 'login' && <button type="button" className="linkbtn" onClick={() => switchTab('forgot')}>Mot de passe oublié ?</button>}
            {tab === 'forgot' && <button type="button" className="linkbtn" onClick={() => switchTab('login')}>← Retour à la connexion</button>}
            {tab === 'signup' && 'Aucun email de confirmation : ton compte est prêt tout de suite.'}
          </p>
        </form>
      </div>
    </section>
  )
}
