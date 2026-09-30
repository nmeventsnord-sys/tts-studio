import { useEffect, useMemo, useState } from 'react'
import { IText } from 'fabric'
import type { StudioEditor } from './engine'
import { renderPlan } from './export'
import type { Identity } from '../lib/session'
import { DEFAULT_INFO } from '../data/formats'

type Props = {
  ed: StudioEditor
  identity: Identity
  hasThemeHoles: boolean
  onCancel: () => void
  onConfirm: () => Promise<void>
}

/** Récapitulatif avant envoi : aperçu, identité, points à vérifier. */
export function SendModal({ ed, identity, hasThemeHoles, onCancel, onConfirm }: Props) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const preview = useMemo(() => renderPlan(ed, 700).toDataURL('image/jpeg', 0.8), [ed])

  const warnings = useMemo(() => {
    const w: string[] = []
    const texts = ed.objects.filter((o) => o instanceof IText).map((o) => (o as IText).text ?? '')
    if (texts.some((t) => t.trim() === DEFAULT_INFO.names || t.trim() === DEFAULT_INFO.date || /^Votre (titre|sous-titre|texte)$/.test(t.trim())))
      w.push("Il reste un texte d'exemple (« Sophie & Marc », « 14 juin 2025 » ou « Votre texte »).")
    if (!ed.zones.length && !hasThemeHoles) w.push("Aucune prise de vue : ajoute au moins une zone 📷 pour indiquer où iront les photos.")
    return w
  }, [ed, hasThemeHoles])

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [busy, onCancel])

  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div className="modal send" role="dialog" aria-modal="true" aria-labelledby="send-t">
        <button className="x" onClick={onCancel} disabled={busy} aria-label="Fermer">✕</button>
        <h3 id="send-t">Envoyer mon template</h3>
        <p className="sub">Il part directement dans ton dossier Time To Smile, rattaché à l'email <b>{identity.email}</b>.</p>
        <div className="send-pv"><img src={preview} alt="Aperçu du template avec les zones photo numérotées" /></div>
        {warnings.map((w) => <div className="info" key={w}>⚠️ {w}</div>)}
        {err && <div className="err">{err}</div>}
        <div className="two">
          <button className="btn ghost" onClick={onCancel} disabled={busy}>Continuer à modifier</button>
          <button className="btn" disabled={busy} onClick={async () => {
            setBusy(true); setErr('')
            try { await onConfirm() } catch (e) { setErr((e as Error).message); setBusy(false) }
          }}>{busy ? 'Envoi en cours…' : 'Envoyer à Time To Smile →'}</button>
        </div>
        <p className="note">Tu recevras un PDF récapitulatif. Tu pourras encore modifier et renvoyer jusqu'à 7 jours avant l'événement.</p>
      </div>
    </div>
  )
}
