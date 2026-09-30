import { supabase } from '../lib/supabase'
import type { ThemeFont } from '../lib/themes'

export type FontCat = 'mariage' | 'elegantes' | 'modernes' | 'fun'
export const FONT_CATS: { key: FontCat; label: string; emoji: string }[] = [
  { key: 'mariage', label: 'Mariage & attachées', emoji: '💍' },
  { key: 'elegantes', label: 'Élégantes', emoji: '👑' },
  { key: 'modernes', label: 'Modernes', emoji: '◻' },
  { key: 'fun', label: 'Fun & Fête', emoji: '🎉' },
]

const google = (name: string): ThemeFont => ({
  name,
  source: 'google',
  url: `https://fonts.googleapis.com/css2?family=${name.replace(/ /g, '+')}&display=swap`,
})

/** Sélection Google Fonts (famille régulière : aucune URL qui renverrait une erreur 400). */
const GOOGLE: Record<FontCat, string[]> = {
  mariage: ['Great Vibes', 'Dancing Script', 'Parisienne', 'Allura', 'Alex Brush', 'Pinyon Script', 'Sacramento', 'Tangerine', 'Italianno', 'Mrs Saint Delafield', 'Herr Von Muellerhoff', 'Petit Formal Script', 'Rouge Script', 'Ballet', 'Arizonia'],
  elegantes: ['Playfair Display', 'Cormorant Garamond', 'Cinzel', 'Forum', 'Marcellus', 'Lora', 'Libre Baskerville', 'Bodoni Moda', 'Prata', 'Italiana', 'Gilda Display', 'Tenor Sans', 'Cormorant'],
  modernes: ['Poppins', 'Montserrat', 'Raleway', 'Josefin Sans', 'Lato', 'Inter', 'Quicksand', 'Nunito', 'Work Sans', 'Jost', 'DM Sans', 'Outfit'],
  fun: ['Pacifico', 'Lobster', 'Bebas Neue', 'Anton', 'Fredoka', 'Righteous', 'Bungee', 'Satisfy', 'Amatic SC', 'Caveat', 'Shadows Into Light', 'Permanent Marker', 'Kaushan Script', 'Chewy', 'Luckiest Guy'],
}

/** Catégorie devinée d'après le nom (polices des thèmes sans catégorie en base). */
export function guessCategory(name: string): FontCat {
  const n = name.toLowerCase()
  if (/script|vibes|brush|signature|hand|callig|love|wedding|swash|monoline|belle|allura|parisienne|ballet|signat|romance/.test(n)) return 'mariage'
  if (/serif|garamond|didot|bodoni|playfair|cinzel|forum|lora|baskerville|marcellus|cormorant|prata|italiana|gilda|display|classic|roman|elegan/.test(n)) return 'elegantes'
  if (/bold|black|fun|party|pop|comic|bubble|marker|retro|bebas|anton|lobster|pacifico|cartoon|groovy/.test(n)) return 'fun'
  return 'modernes'
}

export type LibraryFont = ThemeFont & { category: FontCat }

const WEIGHT = /[\s_-]*(thin|extralight|ultralight|light|regular|book|medium|semibold|demibold|bold|extrabold|ultrabold|black|heavy)?[\s_-]*(italic|oblique)?$/i

/**
 * Nom de famille lisible à partir d'un fichier de police (« PlayfairDisplay Regular » → « Playfair Display »),
 * ou null pour les variantes (gras, italique…) et les noms parasites (« Royalty Free », variable).
 */
export function familyName(raw: string): string | null {
  if (/royalty|variable|license|readme/i.test(raw)) return null
  const m = raw.trim().match(WEIGHT)
  const weight = (m?.[1] ?? '').toLowerCase()
  if (m?.[2] || (weight && weight !== 'regular' && weight !== 'book')) return null
  const base = raw.trim().slice(0, raw.trim().length - (m?.[0].length ?? 0)).trim() || raw.trim()
  return base.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ')
}

let cache: Promise<LibraryFont[]> | null = null

/** Bibliothèque : fonts_library (fichiers issus des thèmes) + sélection Google, dédoublonnées. */
export function loadLibrary(): Promise<LibraryFont[]> {
  cache ??= (async () => {
    const { data } = await supabase.from('fonts_library').select('name, url, category').order('name')
    const out = new Map<string, LibraryFont>()
    for (const [cat, names] of Object.entries(GOOGLE) as [FontCat, string[]][])
      for (const n of names) out.set(n.toLowerCase(), { ...google(n), category: cat })
    for (const f of (data ?? []) as { name: string; url: string; category: string | null }[]) {
      const name = f.url ? familyName(f.name) : null
      if (!name || out.has(name.toLowerCase())) continue
      const cat = (FONT_CATS.some((c) => c.key === f.category) ? f.category : guessCategory(name)) as FontCat
      out.set(name.toLowerCase(), { name, url: f.url, source: 'file', category: cat })
    }
    return [...out.values()]
  })()
  return cache
}
