import { supabase } from './supabase'

/** Texte par défaut d'un format (x, y en fraction de la largeur/hauteur, sz en px du fichier natif). */
export type DefText = { t: string; x: number; y: number; sz: number; c: string; b?: boolean; i?: boolean; f?: string; ls?: number; al?: 'left' | 'center' | 'right'; up?: boolean; r?: 'names' | 'date' | 'other' }
export type FormatKey = 's4p' | 's6p' | 'port1' | 'port2' | 'land3' | 'land1'
export type ThemeFormat = { w: number; h: number; src: string; lbl?: string; dim?: string; def?: DefText[]; holes?: [number, number, number, number][]; thumb?: string }
export type ThemeFont = { name: string; url: string; source?: 'google' | 'file' }
export type Theme = {
  id: string
  slug: string | null
  name: string
  category: string
  style: string | null
  font_name: string | null
  preview_url: string | null
  fmts: Partial<Record<FormatKey, ThemeFormat>> | null
  fonts: ThemeFont[] | null
  digits: unknown
  sort_order: number | null
}

/** Catégories de la galerie, dans l'ordre et avec les libellés du prototype. */
export const CATEGORIES = [
  { key: 'mariage', label: 'Mariage', emoji: '💍' },
  { key: 'anniversaire', label: 'Anniversaire', emoji: '🎂' },
  { key: 'remise-diplomes', label: 'Diplômes', emoji: '🎓' },
  { key: 'saisonnalites', label: 'Saisons', emoji: '🎄' },
  { key: 'autre', label: 'Autre', emoji: '✨' },
] as const

/** Styles proposés en filtre (le script d'ingestion déduit l'un d'eux pour chaque thème). */
export const STYLES = ['Bohème', 'Élégant', 'Minimaliste', 'Festif', 'Rustique', 'Moderne', 'Vintage', 'Coloré'] as const

/** Chiffres PNG du thème (« 0 »…« 9 » → URL), ou null s'il n'y en a pas. */
export function themeDigits(t: { digits?: unknown } | null | undefined): Record<string, string> | null {
  const d = (t?.digits ?? null) as Record<string, string> | null
  return d && Object.keys(d).some((k) => /^\d$/.test(k) && d[k]) ? d : null
}

/** Un texte composé uniquement de chiffres (« 30 », « 2035 ») se dessine avec les chiffres PNG du thème. */
export const digitUrls = (text: string, digits: Record<string, string> | null): string[] | null =>
  digits && /^\d{1,4}$/.test(text.trim()) && [...text.trim()].every((c) => digits[c]) ? [...text.trim()].map((c) => digits[c]) : null

/** Anciens noms Google Fonts renommés. */
const ALIAS: Record<string, string> = { 'Fredoka One': 'Fredoka' }

/**
 * Ajoute à un thème les polices utilisées par ses textes mais absentes de sa liste (Google Fonts),
 * sinon elles s'afficheraient dans la police de repli.
 */
function completeFonts(t: Theme): Theme {
  const fonts = [...(t.fonts ?? [])]
  const have = new Set(fonts.map((f) => f.name.toLowerCase()))
  const fmts = t.fmts ? { ...t.fmts } : t.fmts
  for (const [k, f] of Object.entries(fmts ?? {}) as [FormatKey, ThemeFormat][]) {
    const def = (f.def ?? []).map((d) => (d.f && ALIAS[d.f] ? { ...d, f: ALIAS[d.f] } : d))
    fmts![k] = { ...f, def }
    for (const d of def) {
      if (!d.f || have.has(d.f.toLowerCase())) continue
      have.add(d.f.toLowerCase())
      fonts.push({ name: d.f, source: 'google', url: `https://fonts.googleapis.com/css2?family=${d.f.replace(/ /g, '+')}:ital,wght@0,400;0,700;1,400&display=swap` })
    }
  }
  return { ...t, fonts, fmts }
}

let cache: Promise<Theme[]> | null = null

/** Thèmes actifs (la RLS anon ne renvoie déjà que active = true). Chargés une fois par session. */
export function loadThemes(): Promise<Theme[]> {
  cache ??= (async () => {
    const { data, error } = await supabase
      .from('themes')
      .select('id, slug, name, category, style, font_name, preview_url, fmts, fonts, digits, sort_order')
      .eq('active', true)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name')
    if (error) { cache = null; throw new Error('Impossible de charger les thèmes : ' + error.message) }
    return ((data ?? []) as Theme[]).map(completeFonts)
  })()
  return cache
}

export async function getTheme(idOrSlug: string): Promise<Theme | undefined> {
  const all = await loadThemes()
  return all.find((t) => t.id === idOrSlug || t.slug === idOrSlug)
}

export const formatCount = (t: Theme) => Object.keys(t.fmts ?? {}).length

/** Minuscules sans accents, pour la recherche. */
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
