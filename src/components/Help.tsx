import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useSession } from '../lib/session'
import { canReadHelp, listHelp, markHelpRead, sendHelp, type HelpMessage } from '../lib/help'

const POLL_MS = 120_000

/**
 * « ? Besoin d'aide » : bouton + panneau de discussion avec notre équipe.
 * variant 'stage' = bouton en bas à gauche du canvas (éditeur) ; 'floating' = bulle fixe sur les autres écrans.
 */
export function Help({ variant = 'floating', project }: { variant?: 'stage' | 'floating'; project?: { id?: string; name?: string } }) {
  const { identity } = useSession()
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<HelpMessage[]>([])
  const [unread, setUnread] = useState(0)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [sentNow, setSentNow] = useState(false)
  const end = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    if (!identity || !canReadHelp(identity)) return
    try {
      const r = await listHelp(identity)
      setMsgs(r.messages)
      setUnread(r.unread)
    } catch { /* hors ligne : on réessaie au prochain passage */ }
  }, [identity])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, POLL_MS)
    return () => clearInterval(id)
  }, [refresh])

  useEffect(() => {
    if (!open || !identity) return
    refresh().then(() => { if (canReadHelp(identity)) markHelpRead(identity).then(() => setUnread(0), () => {}) })
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [msgs, open])

  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open])

  if (!identity) return null

  async function submit(e: FormEvent) {
    e.preventDefault()
    const body = text.trim()
    if (!body || !identity) return
    setBusy(true); setErr('')
    try {
      await sendHelp(identity, body, project)
      setText('')
      setSentNow(true)
      if (canReadHelp(identity)) await refresh()
      else setMsgs((m) => [...m, { id: crypto.randomUUID(), from: 'client', body, at: new Date().toISOString(), read: true }])
    } catch (e) {
      setErr((e as Error).message + ' Tu peux aussi écrire à contact@timetosmile.fr.')
    } finally {
      setBusy(false)
    }
  }

  const time = (s: string) => new Date(s).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <>
      <button className={variant === 'stage' ? 'help' : 'help floating'} onClick={() => setOpen(true)} aria-haspopup="dialog">
        ? Besoin d'aide{unread > 0 && <span className="dot" aria-label={`${unread} réponse(s) non lue(s)`}>{unread}</span>}
      </button>
      {open && (
        <div className="drawer-bg" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="help-t">
            <header>
              <div>
                <div className="brand">TIME TO SMILE · STUDIO</div>
                <h3 id="help-t">Besoin d'aide ?</h3>
                <p>Écris-nous : notre équipe te répond ici et par email ({identity.email}).</p>
              </div>
              <button className="x" onClick={() => setOpen(false)} aria-label="Fermer">✕</button>
            </header>
            <div className="thread">
              {!msgs.length && (
                <p className="hint">Une question sur ton template, une police, un format, tes photos ? Pose-la ici, on s'en occupe.</p>
              )}
              {msgs.map((m) => (
                <div key={m.id} className={'bubble ' + m.from}>
                  {m.from === 'team' && <b>Time To Smile</b>}
                  <p>{m.body}</p>
                  <small>{time(m.at)}</small>
                </div>
              ))}
              {sentNow && <p className="hint" style={{ textAlign: 'center' }}>Message envoyé ✓ On te répond au plus vite.</p>}
              <div ref={end} />
            </div>
            <form onSubmit={submit}>
              {err && <div className="err">{err}</div>}
              {project?.name && <small className="hint">À propos de : {project.name}</small>}
              <textarea
                value={text}
                maxLength={4000}
                placeholder="Ton message…"
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(e as unknown as FormEvent) }}
              />
              <button className="btn" disabled={busy || !text.trim()}>{busy ? 'Envoi…' : 'Envoyer'}</button>
            </form>
          </aside>
        </div>
      )}
    </>
  )
}
