import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { api } from './api'

export type Guest = { prenom: string; nom: string; email: string }
/** Personne qui crée le template : compte connecté ou invité. L'email fait le lien avec le dossier Zing. */
export type Identity = Guest & { kind: 'user' | 'guest'; userId?: string }

type Ctx = {
  ready: boolean
  identity: Identity | null
  recovery: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (g: Guest & { password: string }) => Promise<void>
  forgot: (email: string) => Promise<void>
  setPassword: (password: string) => Promise<void>
  startGuest: (g: Guest) => void
  signOut: () => Promise<void>
}

const GUEST_KEY = 'tts-studio-guest'
const SessionCtx = createContext<Ctx | null>(null)

const readGuest = (): Guest | null => {
  try { return JSON.parse(localStorage.getItem(GUEST_KEY) || 'null') } catch { return null }
}
const fromUser = (u: User): Identity => ({
  kind: 'user',
  userId: u.id,
  email: u.email ?? '',
  prenom: (u.user_metadata?.prenom as string) ?? '',
  nom: (u.user_metadata?.nom as string) ?? '',
})
export const normEmail = (e: string) => e.trim().toLowerCase()

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [guest, setGuest] = useState<Guest | null>(readGuest)
  const [recovery, setRecovery] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setUser(data.session?.user ?? null); setReady(true) })
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: normEmail(email), password })
    if (error) throw new Error(error.message.includes('Invalid login') ? 'Email ou mot de passe incorrect.' : error.message)
    localStorage.removeItem(GUEST_KEY); setGuest(null)
  }, [])

  const signUp = useCallback(async (g: Guest & { password: string }) => {
    // Compte créé côté serveur (clé service_role) déjà confirmé : pas d'email de confirmation.
    await api('signup', { ...g, email: normEmail(g.email) })
    await signIn(g.email, g.password)
  }, [signIn])

  const forgot = useCallback(async (email: string) => {
    await api('reset-password', { email: normEmail(email), redirectTo: `${location.origin}/reinitialiser` })
  }, [])

  const setPassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw new Error(error.message)
    setRecovery(false)
  }, [])

  const startGuest = useCallback((g: Guest) => {
    const clean = { prenom: g.prenom.trim(), nom: g.nom.trim(), email: normEmail(g.email) }
    localStorage.setItem(GUEST_KEY, JSON.stringify(clean)); setGuest(clean)
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    localStorage.removeItem(GUEST_KEY); setGuest(null)
  }, [])

  const identity = useMemo<Identity | null>(
    () => (user ? fromUser(user) : guest ? { ...guest, kind: 'guest' } : null),
    [user, guest],
  )

  const value = useMemo(
    () => ({ ready, identity, recovery, signIn, signUp, forgot, setPassword, startGuest, signOut }),
    [ready, identity, recovery, signIn, signUp, forgot, setPassword, startGuest, signOut],
  )
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>
}

export function useSession() {
  const c = useContext(SessionCtx)
  if (!c) throw new Error('useSession hors SessionProvider')
  return c
}
