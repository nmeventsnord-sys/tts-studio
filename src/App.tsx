import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useSession } from './lib/session'
import Auth from './screens/Auth'
import ResetPassword from './screens/ResetPassword'
import Parcours from './screens/Parcours'
import Soon from './screens/Soon'
import Galerie from './screens/Galerie'

/** Toutes les pages du Studio demandent une identité (compte ou invité). */
function RequireIdentity({ children }: { children: ReactNode }) {
  const { ready, identity, recovery } = useSession()
  const loc = useLocation()
  if (!ready) return <div className="spinner" />
  if (recovery) return <Navigate to="/reinitialiser" replace />
  if (!identity) return <Navigate to="/connexion" replace state={{ from: loc.pathname + loc.search }} />
  return <>{children}</>
}

export default function App() {
  const guard = (el: ReactNode) => <RequireIdentity>{el}</RequireIdentity>
  return (
    <Routes>
      <Route path="/connexion" element={<Auth />} />
      <Route path="/reinitialiser" element={<ResetPassword />} />
      <Route path="/" element={guard(<Parcours />)} />
      <Route path="/themes" element={guard(<Galerie />)} />
      <Route path="/formats/:themeId" element={guard(<Soon title="Choisis ton format" step="étape 3" />)} />
      <Route path="/projets" element={guard(<Soon title="Mes projets" step="étape 7" />)} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
