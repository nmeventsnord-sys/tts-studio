import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

const ToastCtx = createContext<(html: string, ms?: number) => void>(() => {})

/** Toast du prototype : message court, peut contenir <b>. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null)
  const t = useRef<number>(0)
  const show = useCallback((html: string, ms = 2600) => {
    setMsg(html); clearTimeout(t.current); t.current = window.setTimeout(() => setMsg(null), ms)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && <div className="gtoast" role="status" dangerouslySetInnerHTML={{ __html: msg }} />}
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)
