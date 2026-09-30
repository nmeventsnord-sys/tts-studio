import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Hero } from '../components/Hero'
import { FREE_FORMATS, defText, readInfo, saveInfo, themeFormats, type EventInfo, type FreeFormatKey } from '../data/formats'
import { fontStack, loadFonts } from '../lib/fonts'
import { getTheme, type Theme, type ThemeFormat } from '../lib/themes'

const PV_H = 150

/** Aperçu réel d'un format : PNG du thème (trous visibles) + textes par défaut avec les prénoms saisis. */
function Preview({ fmt, font, info }: { fmt: ThemeFormat; font: string | null; info: EventInfo }) {
  const k = Math.min(PV_H / fmt.h, 190 / fmt.w)
  const w = fmt.w * k
  const h = fmt.h * k
  return (
    <div className="pvbox" style={{ width: w, height: h }}>
      <img src={fmt.src} alt="" loading="lazy" draggable={false} />
      {(fmt.def ?? []).map((d, i) => (
        <span
          key={i}
          style={{
            left: `${d.x * 100}%`, top: `${d.y * 100}%`, fontSize: d.sz * k, color: d.c,
            fontWeight: d.b ? 700 : 400, fontStyle: d.i ? 'italic' : 'normal', fontFamily: fontStack(d.f ?? font),
          }}
        >
          {defText(d.t, i, info)}
        </span>
      ))}
    </div>
  )
}

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
              <label>Tes prénoms<input value={info.names} maxLength={60} onChange={(e) => edit({ ...info, names: e.target.value })} /></label>
              <label>Date de l'événement<input value={info.date} maxLength={40} onChange={(e) => edit({ ...info, date: e.target.value })} /></label>
              <small>Ils s'affichent tout de suite dans chaque format, dans la police du thème.</small>
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
                    <div className="pv"><Preview fmt={f} font={theme!.font_name} info={info} /></div>
                    <h4>{meta.title}</h4><p>{meta.sub}</p>
                  </button>
                ))}
          </div>
        )}
      </div>
    </section>
  )
}
