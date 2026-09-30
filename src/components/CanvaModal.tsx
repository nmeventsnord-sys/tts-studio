import { useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import type { Identity } from '../lib/session'

/** Parcours « Partager mon Canva » : encadré PEUT MODIFIER + lien envoyé à Zing (champ lien_canva). */
export function CanvaModal({ identity, onClose }: { identity: Identity; onClose: () => void }) {
  const [lien, setLien] = useState('')
  const [devis, setDevis] = useState('')
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      await api('send-template', { email: identity.email, prenom: identity.prenom, nom: identity.nom, lien_canva: lien.trim(), devis: devis.trim(), date_event: date })
      setDone(true)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="canva-t">
        <button className="x" onClick={onClose} aria-label="Fermer">✕</button>
        {done ? (
          <div style={{ textAlign: 'center' }}>
            <div className="done" style={{ margin: 0, padding: 0, border: 'none' }}><div className="ok">🎉</div></div>
            <h3 id="canva-t">Lien bien reçu !</h3>
            <p className="sub">Ton Canva est rattaché à ton dossier grâce à ton email <b>{identity.email}</b>. On prépare l'impression et on revient vers toi si besoin.</p>
            <button className="btn" onClick={onClose}>Fermer</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <h3 id="canva-t">Partager mon Canva</h3>
            <p className="sub">Ton design est déjà prêt ? Envoie-nous le lien, on s'occupe de la mise au format de la borne.</p>
            <div className="canva-box">
              Dans Canva, clique sur <b>Partager</b>, puis sous « Accès par lien » choisis <b>Tout le monde disposant du lien</b> et <span className="pill">PEUT MODIFIER</span>
              <ol>
                <li>Copie le lien (bouton « Copier le lien »)</li>
                <li>Colle-le ci-dessous</li>
              </ol>
            </div>
            {err && <div className="err">{err}</div>}
            <div className="field">
              <label htmlFor="lien">Lien Canva</label>
              <input id="lien" type="url" required placeholder="https://www.canva.com/design/…/edit" value={lien} onChange={(e) => setLien(e.target.value)} />
              <small>Envoyé au nom de {identity.prenom} {identity.nom} · {identity.email}</small>
            </div>
            <div className="two">
              <div className="field"><label htmlFor="devis">N° de devis <small>(facultatif)</small></label><input id="devis" value={devis} maxLength={40} onChange={(e) => setDevis(e.target.value)} /></div>
              <div className="field"><label htmlFor="devt">Date de l'événement</label><input id="devt" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            </div>
            <button className="btn" disabled={busy}>{busy ? 'Envoi…' : 'Envoyer mon lien'}</button>
          </form>
        )}
      </div>
    </div>
  )
}
