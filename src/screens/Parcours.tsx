import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Hero } from '../components/Hero'
import { CanvaModal } from '../components/CanvaModal'
import { useSession } from '../lib/session'
import { MAX_PROJECTS, projectStore } from '../lib/projects'

/** Écran 1 : choix du parcours. */
export default function Parcours() {
  const { identity, signOut } = useSession()
  const nav = useNavigate()
  const [canva, setCanva] = useState(false)
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    if (!identity) return
    projectStore(identity).list().then((l) => setCount(l.length), () => setCount(null))
  }, [identity])

  if (!identity) return null
  const who = identity.prenom || identity.email.split('@')[0]

  return (
    <section>
      <Hero
        title={`Bonjour ${who}, comment veux-tu créer ton template ?`}
        sub="Ton design partira directement dans ton dossier — l'email de ta commande fait le lien."
        right={
          <div className="hero-id">
            <span>{identity.kind === 'user' ? 'Connecté·e' : 'Invité·e'} · {identity.email}</span>·
            <button className="lnk" onClick={() => nav('/projets')}>Mes projets{count !== null ? ` (${count}/${MAX_PROJECTS})` : ''}</button>·
            <button className="lnk" onClick={() => signOut().then(() => nav('/connexion'))}>Déconnexion</button>
          </div>
        }
      />
      <div className="wrap">
        <div className="choices">
          <button className="choice" onClick={() => nav('/themes')}>
            <span className="tag">LE PLUS SIMPLE</span>
            <div className="ic">🎨</div>
            <h3>Personnaliser un template</h3>
            <p>Choisis un design, tes prénoms et ta date sont déjà placés dans la bonne police. Tu modifies, c'est prêt.</p>
            <div className="cta">Voir les thèmes →</div>
          </button>
          <button className="choice" onClick={() => nav('/formats/libre')}>
            <div className="ic">✏️</div>
            <h3>Créer de A à Z</h3>
            <p>Fond, textes, photos, logo : compose librement sur un canvas vierge avec nos fonds et polices.</p>
            <div className="cta">Commencer →</div>
          </button>
          <button className="choice" onClick={() => setCanva(true)}>
            <div className="ic">🔗</div>
            <h3>Partager mon Canva</h3>
            <p>Tu as déjà ton design ? Envoie-nous le lien en accès <b>modification</b>, on prépare l'impression.</p>
            <div className="cta">Envoyer un lien →</div>
          </button>
        </div>
      </div>
      {canva && <CanvaModal identity={identity} onClose={() => setCanva(false)} />}
    </section>
  )
}
