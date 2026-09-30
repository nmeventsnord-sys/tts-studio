import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Hero } from '../components/Hero'
import { useSession } from '../lib/session'
import { useToast } from '../lib/toast'
import { LimitError, MAX_PROJECTS, projectStore, type ProjectRow } from '../lib/projects'
import { FREE_FORMATS, THEME_FORMATS } from '../data/formats'
import { ago } from '../editor/useProject'

const fmtLabel = (p: ProjectRow) =>
  (p.parcours === 'libre' ? FREE_FORMATS[p.format_key as keyof typeof FREE_FORMATS]?.title : THEME_FORMATS[p.format_key as keyof typeof THEME_FORMATS]?.title) ?? p.format_key ?? ''

/** Mes projets : 3 maximum, ouvrir, renommer, dupliquer, supprimer. */
export default function Projets() {
  const { identity } = useSession()
  const nav = useNavigate()
  const toast = useToast()
  const store = useMemo(() => projectStore(identity!), [identity])
  const [list, setList] = useState<ProjectRow[] | null>(null)
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [confirm, setConfirm] = useState<ProjectRow | null>(null)

  const refresh = useCallback(() => store.list().then(setList, (e) => setErr((e as Error).message)), [store])
  useEffect(() => { refresh() }, [refresh])

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    try { await fn(); if (ok) toast(ok); await refresh() } catch (e) {
      toast(e instanceof LimitError ? `${MAX_PROJECTS} projets maximum : supprimes-en un d'abord` : (e as Error).message, 4000)
    }
  }

  return (
    <section>
      <Hero
        title={`Mes projets${list ? ` (${list.length}/${MAX_PROJECTS})` : ''}`}
        sub={store.remote ? 'Tes designs sauvegardés, retrouvables depuis n’importe quel appareil.' : 'Tes designs sont gardés sur cet appareil. Crée un compte pour les retrouver partout.'}
        right={<button className="back" onClick={() => nav('/')}>← Retour au choix du parcours</button>}
      />
      <div className="wrap">
        {err && <div className="err">{err}</div>}
        {!list && !err && <div className="spinner" />}
        {list && list.length === 0 && (
          <div className="soon">
            Aucun projet pour l'instant. Dans l'éditeur, clique sur <b>💾 Sauvegarder</b> pour retrouver ton design ici.
            <p style={{ marginTop: 14 }}><button className="btn" style={{ width: 'auto', padding: '0 20px' }} onClick={() => nav('/themes')}>Voir les thèmes →</button></p>
          </div>
        )}
        <div className="grid">
          {list?.map((p) => (
            <article className="card" key={p.id}>
              <div className="thumb" onClick={() => nav(`/editeur?projet=${p.id}`)}>
                {p.preview_url ? <img src={p.preview_url} alt="" loading="lazy" /> : <span className="meta">Pas d'aperçu</span>}
                {p.status === 'sent' && <span className="badge">✓ Envoyé</span>}
                {p.master_edited && <span className="badge" style={{ top: 'auto', bottom: 10 }}>✦ Modifié par Time To Smile</span>}
              </div>
              <div className="body">
                {editing?.id === p.id ? (
                  <form className="pr" onSubmit={(e) => { e.preventDefault(); const n = editing.name.trim(); setEditing(null); if (n) act(() => store.rename(p.id, n), 'Projet renommé') }}>
                    <input className="fsearch" style={{ margin: 0, flex: 1 }} autoFocus maxLength={120} value={editing.name} onChange={(e) => setEditing({ id: p.id, name: e.target.value })} />
                    <button className="pb">OK</button>
                  </form>
                ) : (
                  <div className="name">{p.name ?? 'Sans nom'}</div>
                )}
                <div className="meta">{fmtLabel(p)} · modifié {ago(Date.parse(p.updated_at))}</div>
                <button className="go" onClick={() => nav(`/editeur?projet=${p.id}`)}>OUVRIR →</button>
                <div className="pr" style={{ marginTop: 8 }}>
                  <button className="pb" onClick={() => setEditing({ id: p.id, name: p.name ?? '' })}>✎ Renommer</button>
                  <button className="pb" disabled={list.length >= MAX_PROJECTS} title={list.length >= MAX_PROJECTS ? `${MAX_PROJECTS} projets maximum` : ''} onClick={() => act(() => store.duplicate(p.id), 'Projet dupliqué')}>⧉ Dupliquer</button>
                  <button className="pb" onClick={() => setConfirm(p)}>🗑</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
      {confirm && (
        <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && setConfirm(null)}>
          <div className="modal" role="alertdialog" aria-modal="true">
            <h3>Supprimer « {confirm.name ?? 'Sans nom'} » ?</h3>
            <p className="sub">Le projet sera définitivement supprimé{confirm.status === 'sent' ? '. Le template déjà envoyé à Time To Smile reste dans ton dossier.' : '.'}</p>
            <div className="two">
              <button className="btn ghost" onClick={() => setConfirm(null)}>Annuler</button>
              <button className="btn dark" onClick={() => { const id = confirm.id; setConfirm(null); act(() => store.remove(id), 'Projet supprimé') }}>Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
