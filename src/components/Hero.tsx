import type { ReactNode } from 'react'

/** Bandeau teal du prototype : marque, titre, sous-titre et zone d'action à droite. */
export function Hero({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <header className="hero">
      <div className="hero-in">
        <div>
          <div className="brand">TIME TO SMILE · STUDIO</div>
          <h1>{title}</h1>
          {sub && <p>{sub}</p>}
        </div>
        {right}
      </div>
    </header>
  )
}
