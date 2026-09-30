import { useState } from 'react'
import type { ProjectModal } from './useProject'
import { MAX_PROJECTS, type ProjectStore } from '../lib/projects'

type Props = {
  modal: ProjectModal
  store: ProjectStore
  defaultName: string
  onClose: () => void
  onSave: (o: { name?: string; replace?: string; force?: boolean; asCopy?: boolean }) => void
  onReload: () => void
}

const date = (s?: string | null) => (s ? new Date(s).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '')

/** Fenêtres de la sauvegarde : nom du projet, limite de 3 projets, conflit de versions. */
export function ProjectModals({ modal, store, defaultName, onClose, onSave, onReload }: Props) {
  const [name, setName] = useState(defaultName)
  const [list, setList] = useState(modal.kind === 'limit' ? modal.projects : [])
  const [busy, setBusy] = useState('')

  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <button className="x" onClick={onClose} aria-label="Fermer">✕</button>

        {modal.kind === 'name' && (
          <form onSubmit={(e) => { e.preventDefault(); onSave({ name: name.trim() || defaultName }) }}>
            <h3>Sauvegarder mon projet</h3>
            <p className="sub">
              Tu peux garder jusqu'à {MAX_PROJECTS} projets{store.remote ? ', retrouvables depuis n’importe quel appareil' : ' sur cet appareil (crée un compte pour les retrouver partout)'}.
              Ensuite, ton travail est sauvegardé automatiquement toutes les minutes.
            </p>
            <div className="field">
              <label htmlFor="pname">Nom du projet</label>
              <input id="pname" autoFocus maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <button className="btn">💾 Sauvegarder</button>
          </form>
        )}

        {modal.kind === 'limit' && (
          <>
            <h3>Tu as déjà {MAX_PROJECTS} projets</h3>
            <p className="sub">Remplace un projet par celui-ci, ou supprimes-en un pour faire de la place.</p>
            {list.map((p) => (
              <div key={p.id} className="plimit">
                {p.preview_url ? <img src={p.preview_url} alt="" /> : <span className="ph" />}
                <div><b>{p.name ?? 'Sans nom'}</b><small>modifié le {date(p.updated_at)}</small></div>
                <button className="pb" disabled={!!busy} onClick={() => onSave({ replace: p.id, name: modal.name })}>Remplacer</button>
                <button className="pb" disabled={!!busy} aria-label={`Supprimer ${p.name ?? ''}`} onClick={async () => {
                  setBusy(p.id)
                  try { await store.remove(p.id); setList(list.filter((x) => x.id !== p.id)) } finally { setBusy('') }
                }}>🗑</button>
              </div>
            ))}
            {list.length < MAX_PROJECTS && <button className="btn" style={{ marginTop: 12 }} onClick={() => onSave({ name: modal.name })}>💾 Sauvegarder maintenant</button>}
          </>
        )}

        {modal.kind === 'conflict' && (
          <>
            <h3>{modal.current ? 'Ce projet a été modifié ailleurs' : 'Ce projet a été supprimé'}</h3>
            <p className="sub">
              {modal.current
                ? <>Une autre version a été enregistrée le <b>{date(modal.current.updated_at)}</b>{modal.current.master_edited ? ' par Time To Smile' : ' (autre onglet ou autre appareil)'}. Que veux-tu faire ?</>
                : 'Il a été supprimé depuis un autre onglet ou appareil. Tu peux enregistrer ta version comme nouveau projet.'}
            </p>
            <div className="stack">
              {modal.current && <button className="btn ghost" onClick={onReload}>↺ Ouvrir l'autre version (je perds mes changements)</button>}
              <button className="btn ghost" onClick={() => onSave({ asCopy: true, name: modal.current?.name ?? defaultName })}>⧉ Garder les deux : enregistrer ma version comme copie</button>
              {modal.current && <button className="btn" onClick={() => onSave({ force: true })}>Écraser avec ma version</button>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
