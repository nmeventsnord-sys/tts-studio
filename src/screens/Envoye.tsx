import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Hero } from '../components/Hero'
import { downloadPdf, type PdfInfo } from '../editor/export'

export type LastSend = PdfInfo & { email: string; back: string }
export const LAST_SEND_KEY = 'tts-studio-dernier-envoi'

/** Écran 5 : confirmation d'envoi + PDF récapitulatif. */
export default function Envoye() {
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)
  const last: LastSend | null = (() => { try { return JSON.parse(sessionStorage.getItem(LAST_SEND_KEY) || 'null') } catch { return null } })()

  if (!last) {
    return (
      <section>
        <Hero title="Time To Smile Studio" />
        <div className="wrap"><div className="soon">Aucun envoi récent sur cet appareil. <button className="linkbtn" onClick={() => nav('/')}>Retour à l'accueil</button></div></div>
      </section>
    )
  }

  return (
    <section>
      <Hero title="C'est envoyé !" />
      <div className="wrap">
        <div className="done">
          <div className="ok">🎉</div>
          <h2>Ton template est arrivé chez Nicolas</h2>
          <p>
            Il est rattaché à ton dossier grâce à ton email <b>{last.email}</b>.{' '}
            {last.zones > 0
              ? <>Le PDF ci-dessous te montre où seront tes photos (zone{last.zones > 1 ? `s 1 à ${last.zones}` : ' 1'}).</>
              : <>Le PDF ci-dessous te montre ton template tel qu'il sera imprimé.</>}{' '}
            Tu peux encore modifier et renvoyer jusqu'à 7 jours avant l'événement.
          </p>
          <button className="dl" disabled={busy} onClick={async () => { setBusy(true); try { await downloadPdf(last) } finally { setBusy(false) } }}>
            ⬇ {busy ? 'Préparation…' : 'Télécharger mon PDF'}
          </button>
          <p style={{ marginTop: 22 }}>
            <button className="back" style={{ color: 'var(--teal)', textDecoration: 'underline' }} onClick={() => nav('/')}>Retour à l'accueil</button>
            {' · '}
            <button className="back" style={{ color: 'var(--teal)', textDecoration: 'underline' }} onClick={() => nav(last.back)}>Continuer à modifier</button>
          </p>
        </div>
      </div>
    </section>
  )
}
