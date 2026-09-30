import { useNavigate } from 'react-router-dom'
import { Hero } from '../components/Hero'

/** Écran pas encore construit (étapes suivantes). */
export default function Soon({ title, step }: { title: string; step: string }) {
  const nav = useNavigate()
  return (
    <section>
      <Hero title={title} right={<button className="back" onClick={() => nav('/')}>← Retour au choix du parcours</button>} />
      <div className="wrap"><div className="soon">Cet écran arrive à l'<b>{step}</b> de la construction.</div></div>
    </section>
  )
}
