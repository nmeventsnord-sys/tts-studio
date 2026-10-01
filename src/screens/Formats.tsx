import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Hero } from '../components/Hero'
import { Help } from '../components/Help'
import { FREE_FORMATS, readInfo, saveInfo, themeFormats, type EventInfo, type FreeFormatKey } from '../data/formats'
import { loadFonts } from '../lib/fonts'
import { TemplatePreview } from '../components/TemplatePreview'
import { getTheme, type Theme } from '../lib/themes'

const PV_H = 150

/** Écran 3 : choix du format (thème ou création libre). */
export default function Formats() {
  const { themeId = '' } = useParams()
  const nav = useNavigate()
  const libre = themeId === 'libre'
  const [theme, setTheme] = useState<Theme | null | undefined>(libre ? null : undefined)
  const [info, setInfo] = useState<EventInfo>(readInfo)

  useEffect(() => {
    if (libre) return
    getTheme(themeId).then((t) => { setTheme(t ?? null); if (t) loadFonts(t.fonts) })
  }, [themeId, libre])

  const edit = (i: EventInfo) => { setInfo(i); saveInfo(i) }
  const open = (format: string) => nav(libre ? `/editeur?libre=${format}` : `/editeur?theme=${theme!.slug ?? theme!.id}&format=${format}`)

  if (!libre && theme === null) {
    return (
      <section>
        <Hero title="Thème introuvable" right={<button className="back" onClick={() => nav('/themes')}>← Autre thème</button>} />
        <div className="wrap"><div className="soon">Ce thème n'existe plus ou n'est plus disponible.</div></div>
      </section>
    )
  }

  const formats = theme ? themeFormats(theme) : []

  return (
    <section>
      <Hero
        title={libre ? 'Création libre — choisis ton format' : theme ? `${theme.name} — choisis ton format` : 'Choisis ton format'}
        sub="Selon ce que ta borne imprimera. Tu pourras revenir ici sans perdre ton travail."
        right={<button className="back" onClick={() => nav(libre ? '/' : '/themes')}>{libre ? '← Retour au choix du parcours' : '← Autre thème'}</button>}
      />
      {!libre && (
        <div className="toolbar">
          <div className="toolbar-in">
            <div className="row infos">
              <label>Tes prénoms<input value={info.names} maxLength={60} placeholder="Ex. Sophie & Marc" onChange={(e) => edit({ ...info, names: e.target.value })} /></label>
              <label>Date de l'événement<input value={info.date} maxLength={40} placeholder="Ex. 14 juin 2026" onChange={(e) => edit({ ...info, date: e.target.value })} /></label>
              <small>Ils remplacent ceux de l'exemple dans chaque format, dans la police du thème.</small>
            </div>
          </div>
        </div>
      )}
      <div className="wrap">
        {theme === undefined ? <div className="spinner" /> : (
          <div className="fmts">
            {libre
              ? (Object.entries(FREE_FORMATS) as [FreeFormatKey, (typeof FREE_FORMATS)[FreeFormatKey]][]).map(([k, f]) => {
                  const s = Math.min(PV_H / f.h, 190 / f.w) * 0.72
                  return (
                    <button className="fmt" key={k} onClick={() => open(k)}>
                      <div className="pv"><div style={{ width: f.w * s, height: f.h * s, position: 'relative' }}>{'bookmark' in f && <i className="cut" />}</div></div>
                      <h4>{f.title}</h4><p>{f.sub}</p>
                    </button>
                  )
                })
              : formats.map(([k, f, meta]) => (
                  <button className="fmt" key={k} onClick={() => open(k)}>
                    <div className="pv"><TemplatePreview fmt={f} font={theme!.font_name} info={info} category={theme!.category} bookmark={meta.bookmark} width={f.w * Math.min(PV_H / f.h, 190 / f.w)} className="pvbox" /></div>
                    <h4>{meta.title}</h4><p>{meta.sub}</p>
                  </button>
                ))}
          </div>
        )}
      </div>
      <Help />
    </section>
  )
}
