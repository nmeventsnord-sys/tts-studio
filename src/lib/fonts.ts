import type { ThemeFont } from './themes'

const loaded = new Map<string, Promise<void>>()

/**
 * Charge une police (fichier via FontFace, ou feuille Google Fonts) et attend qu'elle soit
 * réellement utilisable : sans ça, Fabric mesure le texte avec la police de repli.
 */
export function loadFont(f: ThemeFont): Promise<void> {
  const key = f.name
  let p = loaded.get(key)
  if (!p) {
    p = (async () => {
      const isCss = f.source === 'google' || /fonts\.googleapis\.com\/css/.test(f.url)
      if (isCss) {
        if (!document.querySelector(`link[data-font="${CSS.escape(f.name)}"]`)) {
          const link = document.createElement('link')
          link.rel = 'stylesheet'
          link.href = f.url
          link.dataset.font = f.name
          document.head.appendChild(link)
          await new Promise((ok) => { link.onload = ok; link.onerror = ok })
        }
        await Promise.all([document.fonts.load(`16px "${f.name}"`), document.fonts.load(`bold 16px "${f.name}"`)])
      } else {
        const face = new FontFace(f.name, `url("${f.url}")`, { display: 'swap' })
        document.fonts.add(await face.load())
      }
    })().catch((e) => {
      loaded.delete(key)
      console.warn('Police non chargée', f.name, e)
    })
    loaded.set(key, p)
  }
  return p
}

/** Charge en parallèle toutes les polices d'un thème. */
export const loadFonts = (fonts: ThemeFont[] | null | undefined) => Promise.all((fonts ?? []).map(loadFont))

/** Pile CSS : la police demandée puis les replis du Studio. */
export const fontStack = (name?: string | null) => (name ? `"${name}", Poppins, sans-serif` : 'Poppins, sans-serif')
