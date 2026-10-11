import { useEffect, useState } from 'react'
import { defText, type EventInfo } from '../data/formats'
import { fontStack } from '../lib/fonts'
import { assignPhotos, findHoles, samplePhotos, type Box } from '../lib/samples'
import { digitUrls, type ThemeFormat } from '../lib/themes'

type Props = {
  fmt: ThemeFormat & { holes?: Box[]; thumb?: string }
  font: string | null
  info: EventInfo
  category?: string | null
  /** Varie la photo d'exemple d'un thème à l'autre (slug du thème). */
  seed?: string | null
  /** Chiffres PNG du thème : les textes numériques (« 30 ») s'affichent avec. */
  digits?: Record<string, string> | null
  bookmark?: boolean
  width: number
  className?: string
  style?: React.CSSProperties
}

/**
 * Aperçu fidèle d'un format : photos d'exemple dans les emplacements, PNG du thème par-dessus,
 * textes par défaut dans leurs polices (avec les prénoms et la date saisis).
 */
export function TemplatePreview({ fmt, font, info, category, seed, digits, bookmark, width, className, style }: Props) {
  const k = width / fmt.w
  const height = fmt.h * k
  const [boxes, setBoxes] = useState<Box[] | null>(fmt.holes ?? null)

  useEffect(() => {
    if (fmt.holes) { setBoxes(fmt.holes); return }
    let ok = true
    findHoles(fmt.src).then((b) => ok && setBoxes(b), () => ok && setBoxes([]))
    return () => { ok = false }
  }, [fmt.src, fmt.thumb, fmt.holes])

  const photos = boxes ? assignPhotos(boxes, samplePhotos(category, seed), bookmark) : []

  return (
    <div className={'tplpv ' + (className ?? '')} style={{ width, height, ...style }}>
      {boxes?.map((b, i) => (
        <img
          key={i}
          className="ph"
          src={photos[i]}
          alt=""
          draggable={false}
          style={{ left: `${b[0] * 100}%`, top: `${b[1] * 100}%`, width: `${(b[2] - b[0]) * 100}%`, height: `${(b[3] - b[1]) * 100}%` }}
        />
      ))}
      <img
        className="tpl"
        src={fmt.thumb ?? fmt.src}
        alt=""
        loading="lazy"
        draggable={false}
        onError={(e) => { const i = e.currentTarget; if (fmt.thumb && i.src !== fmt.src) i.src = fmt.src }}
      />
      {(fmt.def ?? []).map((d, i) => {
        const nums = digitUrls(d.t, digits ?? null)
        if (nums) return (
          <span key={i} style={{ left: `${d.x * 100}%`, top: `${d.y * 100}%`, display: 'flex' }}>
            {nums.map((u, j) => <img key={j} src={u} alt="" draggable={false} style={{ height: d.sz * k * 0.8, width: 'auto', position: 'static' }} />)}
          </span>
        )
        return (
        <span
          key={i}
          style={{
            left: `${d.x * 100}%`, top: `${d.y * 100}%`, fontSize: d.sz * k, color: d.c,
            fontWeight: d.b ? 700 : 400, fontStyle: d.i ? 'italic' : 'normal', fontFamily: fontStack(d.f ?? font),
            letterSpacing: d.ls ? `${(d.ls / 1000) * d.sz * k}px` : undefined,
          }}
        >
          {defText(d.t, i, info, d.r)}
        </span>
        )
      })}
    </div>
  )
}
