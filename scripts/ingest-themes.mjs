#!/usr/bin/env node
/**
 * Ingestion des thèmes photobooth → Supabase (table themes, fonts_library, bucket « template »).
 *
 *   pnpm ingest:themes                   tout le dossier TEMPLATES_PATH
 *   pnpm ingest:themes -- --only=champagne --dry-run
 *
 * Options :
 *   --dry-run        analyse et rapport seulement (aucun envoi, aucune écriture, pas d'IA sauf --ai)
 *   --only=<texte>   ne traite que les thèmes dont le nom contient ce texte (plusieurs : séparés par des virgules)
 *   --limit=<n>      s'arrête après n thèmes
 *   --no-ai          pas d'analyse IA : garde les textes par défaut déjà en base (ou des valeurs neutres)
 *   --reanalyze      ignore le cache IA local (scripts/.ingest-cache.json)
 *   --keep-def       garde les textes par défaut (def) déjà en base quand ils existent
 *   --apercu         planche de contrôle par thème (textes posés sur les vrais PNG) dans scripts/.ingest-apercu/
 *
 * Variables (.env.local) : TEMPLATES_PATH, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY,
 * ANTHROPIC_WORKSPACE_ID (si la clé n'est pas rattachée à un workspace).
 *
 * Organisation acceptée dans TEMPLATES_PATH (dossier local, ex. Google Drive pour ordinateur) :
 *   - un sous-dossier par catégorie, puis un sous-dossier ou un ZIP par thème ;
 *   - ou des ZIP / dossiers de thèmes à plat, la catégorie étant déduite du nom (« Mariage … »).
 * Chaque thème : PNG des formats (2x6, 4x6, 6x4…), JPG d'aperçu, polices (fichiers ou ZIP imbriqués),
 * Documentation.txt (polices requises), écran d'accueil (ZIP imbriqué, dossier PNG), chiffres 0-9.
 *
 * Idempotent : upsert par slug, fichiers réécrits au même chemin, analyse IA mise en cache.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import JSZip from 'jszip'
import sharp from 'sharp'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.join(HERE, '..', '.env.local'), quiet: true })

// ───────────── options ─────────────
const argv = process.argv.slice(2)
const flag = (n) => argv.includes(`--${n}`)
const opt = (n) => argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=')
const DRY = flag('dry-run')
const USE_AI = !flag('no-ai') && (!DRY || flag('ai'))
const REANALYZE = flag('reanalyze')
const KEEP_DEF = flag('keep-def')
const PREVIEW = flag('apercu')
const PREVIEW_DIR = path.join(HERE, '.ingest-apercu')
const ONLY = opt('only')?.toLowerCase().split(',').map((x) => x.trim()).filter(Boolean)
const LIMIT = Number(opt('limit') ?? Infinity)

const ROOT = process.env.TEMPLATES_PATH?.trim()
const BUCKET = 'template'
const MODEL = 'claude-opus-5-5'
const PROMPT_VERSION = 'v2-trous'
const CACHE_FILE = path.join(HERE, '.ingest-cache.json')

if (!ROOT || !fs.existsSync(ROOT)) fail(`TEMPLATES_PATH introuvable : « ${ROOT ?? ''} » (dossier local attendu, voir .env.example)`)
for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) if (!process.env[k]) fail(`${k} manquant dans .env.local`)
if (USE_AI && !process.env.ANTHROPIC_API_KEY) fail('ANTHROPIC_API_KEY manquant (ou lance avec --no-ai)')

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  global: { headers: { 'User-Agent': 'tts-studio-ingest' } },
})
// Clé non rattachée à un workspace : l'API exige l'en-tête anthropic-workspace-id.
const WORKSPACE = process.env.ANTHROPIC_WORKSPACE_ID?.trim()
const anthropic = USE_AI ? new Anthropic(WORKSPACE ? { defaultHeaders: { 'anthropic-workspace-id': WORKSPACE } } : {}) : null
const cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) : {}

/** Lecture tolérante : Google Drive (mode diffusion) échoue parfois sur les gros fichiers pas encore rapatriés. */
function readFileRetry(file, tries = 4) {
  for (let i = 1; ; i++) {
    try { return fs.readFileSync(file) } catch (e) {
      if (i >= tries) throw new Error(`lecture impossible (${e.code ?? e.message}) — rends le dossier « Disponible hors connexion » dans Google Drive puis relance`)
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 4000 * i) // pause, le temps que Drive rapatrie le fichier
    }
  }
}

function fail(msg) { console.error(`\n✖ ${msg}\n`); process.exit(1) }

// ───────────── utilitaires ─────────────
const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const cleanName = (s) => s.replace(/\.(zip)$/i, '').replace(/\s*\(\d+\)\s*$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim()
/** « 4×6 » « 4 x 6 » « 4X6 » → « 4x6 » */
const normalize = (s) => s.toLowerCase().replace(/[×✕]/g, 'x').replace(/(\d)\s*x\s*(\d)/g, '$1x$2')
const sha = (buf) => crypto.createHash('sha1').update(buf).digest('hex')
const IMG = /\.(png|jpe?g|webp)$/i
const FONT = /\.(ttf|otf|woff2?)$/i
const IGNORE = /(^|\/)(__macosx|\.ds_store|thumbs\.db)|(^|\/)\._/i

const CATEGORY_RULES = [
  ['mariage', /mariage|wedding|fian[cç]ailles|pacs|bapt[eê]me|communion/i],
  ['anniversaire', /anniv|birthday|\bans\b|baby ?shower|gender/i],
  ['remise-diplomes', /dipl[oô]me|remise|graduation|promo|[eé]cole/i],
  ['saisonnalites', /no[eë]l|christmas|halloween|p[aâ]ques|easter|saint[- ]?valentin|valentine|nouvel an|new year|hiver|[eé]t[eé]|automne|printemps|saison/i],
]
const categoryOf = (...names) => {
  for (const n of names) for (const [key, re] of CATEGORY_RULES) if (re.test(n ?? '')) return key
  return 'autre'
}
const STYLES = ['Bohème', 'Élégant', 'Minimaliste', 'Festif', 'Rustique', 'Moderne', 'Vintage', 'Coloré']

/** Nom de police lisible depuis un nom de fichier (« MavenPro-Black.ttf » → « MavenPro Black »). */
const fontNameFromFile = (file) => path.basename(file).replace(FONT, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
/** Variante d'une famille (« Lato Black », « Poppins SemiBoldItalic ») : pas d'entrée dans la bibliothèque. */
const isVariant = (name) => /(thin|extra ?light|ultra ?light|light|medium|semi ?bold|demi ?bold|bold|extra ?bold|ultra ?bold|black|heavy|italic|oblique)$/i.test(name.replace(/\s*regular$/i, '').trim()) && !/regular$/i.test(name)
const guessFontCategory = (n) => {
  n = n.toLowerCase()
  if (/script|vibes|brush|signature|hand|callig|love|wedding|swash|monoline|belle|allura|parisienne|ballet|romance/.test(n)) return 'mariage'
  if (/serif|garamond|didot|bodoni|playfair|cinzel|forum|lora|baskerville|marcellus|cormorant|prata|italiana|gilda|classic|roman|elegan/.test(n)) return 'elegantes'
  if (/fun|party|pop|comic|bubble|marker|retro|bebas|anton|lobster|pacifico|cartoon|groovy/.test(n)) return 'fun'
  return 'modernes'
}

// ───────────── lecture d'un thème (dossier ou ZIP, ZIP imbriqués compris) ─────────────
/** Liste plate { path, name, read() } ; les ZIP imbriqués sont développés sous « <zip>/ ». */
async function entriesFromZip(buf, prefix = '') {
  const zip = await JSZip.loadAsync(buf)
  const out = []
  for (const f of Object.values(zip.files)) {
    if (f.dir || IGNORE.test(f.name)) continue
    const p = prefix + f.name
    if (/\.zip$/i.test(f.name)) {
      // ZIP imbriqué : polices, écran d'accueil… (on ne garde que ce qui sert)
      try { out.push(...(await entriesFromZip(await f.async('nodebuffer'), p.replace(/\.zip$/i, '') + '/'))) } catch { /* ZIP illisible : ignoré */ }
      continue
    }
    if (!IMG.test(p) && !FONT.test(p) && !/documentation\.txt$/i.test(p)) continue
    out.push({ path: p, name: path.posix.basename(p), read: () => f.async('nodebuffer') })
  }
  return out
}

async function entriesFromDir(dir, base = dir) {
  const out = []
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, d.name)
    const rel = path.relative(base, full).split(path.sep).join('/')
    if (IGNORE.test(rel)) continue
    if (d.isDirectory()) out.push(...(await entriesFromDir(full, base)))
    else if (/\.zip$/i.test(d.name)) out.push(...(await entriesFromZip(readFileRetry(full), rel.replace(/\.zip$/i, '') + '/')))
    else if (IMG.test(d.name) || FONT.test(d.name) || /documentation\.txt$/i.test(d.name)) out.push({ path: rel, name: d.name, read: async () => fs.readFileSync(full) })
  }
  return out
}

/** Repère les thèmes : catégories en sous-dossiers, ou ZIP/dossiers de thèmes à plat. */
function discover() {
  const themes = []
  const looksLikeTheme = (dir) => fs.readdirSync(dir).some((n) => IMG.test(n) || /png|welcome/i.test(n))
  for (const d of fs.readdirSync(ROOT, { withFileTypes: true })) {
    const full = path.join(ROOT, d.name)
    if (IGNORE.test(d.name) || d.name === 'desktop.ini') continue
    if (d.isFile() && /\.zip$/i.test(d.name)) themes.push({ name: cleanName(d.name), source: full, zip: true, folder: null })
    else if (d.isDirectory()) {
      if (looksLikeTheme(full)) { themes.push({ name: cleanName(d.name), source: full, zip: false, folder: null }); continue }
      for (const t of fs.readdirSync(full, { withFileTypes: true })) {
        if (IGNORE.test(t.name) || t.name === 'desktop.ini') continue
        const tf = path.join(full, t.name)
        if (t.isDirectory() || /\.zip$/i.test(t.name)) themes.push({ name: cleanName(t.name), source: tf, zip: !t.isDirectory(), folder: d.name })
      }
    }
  }
  return themes.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

// ───────────── analyse d'image ─────────────
/** Trous (zones transparentes) d'un PNG : nombre de photos et part de surface. */
async function holes(buf) {
  const W = 240
  const { data, info } = await sharp(buf).ensureAlpha().resize({ width: W }).raw().toBuffer({ resolveWithObject: true })
  const w = info.width
  const h = info.height
  const seen = new Uint8Array(w * h)
  const comps = []
  for (let p = 0; p < w * h; p++) {
    if (seen[p] || data[p * 4 + 3] > 24) continue
    let n = 0
    let minX = w, maxX = 0, minY = h, maxY = 0
    const stack = [p]
    seen[p] = 1
    while (stack.length) {
      const q = stack.pop()
      n++
      const x = q % w
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      const y = (q - x) / w
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      for (const r of [x > 0 ? q - 1 : -1, x < w - 1 ? q + 1 : -1, y > 0 ? q - w : -1, y < h - 1 ? q + w : -1])
        if (r >= 0 && !seen[r] && data[r * 4 + 3] <= 24) { seen[r] = 1; stack.push(r) }
    }
    if (n > w * h * 0.006) comps.push({ n, cx: (minX + maxX) / 2 / w, box: [minX / w, minY / h, (maxX + 1) / w, (maxY + 1) / h] })
  }
  return { count: comps.length, share: comps.reduce((s, c) => s + c.n, 0) / (w * h), left: comps.filter((c) => c.cx < 0.5).length, boxes: comps.map((c) => c.box) }
}

/**
 * Format d'un PNG : d'après le nom (2x6, 4x6, 6x4 — × normalisé), sinon d'après les dimensions,
 * puis le nombre de trous. Marque-pages : doubles uniquement (les bandes simples sont ignorées).
 */
function kindOf(name, meta) {
  const n = normalize(name)
  const ratio = meta.width / meta.height
  if (/single strip/i.test(n)) return null
  if (/2x6/.test(n)) return ratio > 0.55 ? 'bookmark' : null // 600×1800 = bande simple
  if (/4x6/.test(n)) return 'portrait'
  if (/6x4/.test(n)) return 'landscape'
  if (/5x5|welcome|button|landscape-|portrait-/.test(n)) return null
  if (Math.abs(ratio - 2 / 3) < 0.03) return 'portrait' // secours par dimensions
  if (Math.abs(ratio - 3 / 2) < 0.03) return 'landscape'
  return null
}

/**
 * Attribution des formats à partir des PNG analysés (le premier qui convient, dans l'ordre des noms) :
 *  - marque-page double : « 4 photos » = 4 trous au total (2 par bande), « 6 photos » = 6 (3 par bande) ;
 *  - paysage : 3 trous → land3, 1 trou → land1 ;
 *  - portrait à 1 trou : le plus grand trou = pleine page (port2), l'autre = photo + texte (port1).
 */
function assignFormats(cands) {
  const out = new Map()
  const pick = (key, test) => { const c = cands.find((x) => !x.used && test(x)); if (c) { c.used = true; out.set(key, c) } }
  pick('s4p', (x) => x.kind === 'bookmark' && x.h.count === 4)
  pick('s6p', (x) => x.kind === 'bookmark' && x.h.count === 6)
  pick('land3', (x) => x.kind === 'landscape' && x.h.count === 3)
  pick('land1', (x) => x.kind === 'landscape' && x.h.count === 1)
  const singles = cands.filter((x) => x.kind === 'portrait' && x.h.count === 1).sort((x, y) => y.h.share - x.h.share)
  if (singles.length >= 2) { singles[0].used = singles[1].used = true; out.set('port2', singles[0]); out.set('port1', singles[1]) }
  else if (singles.length === 1) { singles[0].used = true; out.set(singles[0].h.share >= 0.62 ? 'port2' : 'port1', singles[0]) }
  return out
}

const FORMAT_META = {
  s4p: { lbl: 'Bande 2×6 — 4 photos', dim: '4″ × 6″ · coupé en 2 bandes' },
  s6p: { lbl: 'Bande 2×6 — 6 photos', dim: '4″ × 6″ · coupé en 2 bandes' },
  port1: { lbl: 'Portrait 4×6 — 1 photo', dim: '4″ × 6″ · 1 photo + texte' },
  port2: { lbl: 'Portrait 4×6 — pleine page', dim: '4″ × 6″ · 1 grande photo' },
  land3: { lbl: 'Paysage 6×4 — 3 photos', dim: '6″ × 4″ · 3 vignettes' },
  land1: { lbl: 'Paysage 6×4 — 1 photo', dim: '6″ × 4″ · 1 grande photo' },
}

/** Textes par défaut neutres quand l'IA n'est pas utilisée. */
const neutralDef = (key) => {
  const land = key.startsWith('land')
  const book = key.startsWith('s')
  return [
    { t: 'Sophie & Marc', x: book ? 0.25 : land ? 0.5 : 0.5, y: book ? 0.86 : 0.86, sz: book ? 56 : 80, c: '#1a1410', b: true },
    { t: '14 juin 2025', x: book ? 0.25 : 0.5, y: book ? 0.92 : 0.93, sz: book ? 36 : 48, c: '#C9A84C', b: false },
  ]
}

// ───────────── analyse IA (vision) ─────────────
const TEXT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['x', 'y', 'size', 'color', 'bold'],
  properties: {
    x: { type: 'number', description: 'centre horizontal, fraction 0-1 de la largeur' },
    y: { type: 'number', description: 'centre vertical, fraction 0-1 de la hauteur' },
    size: { type: 'number', description: 'taille de police en pixels du fichier natif' },
    color: { type: 'string', description: 'couleur hexadécimale #rrggbb' },
    bold: { type: 'boolean' },
  },
}
const AI_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['style', 'formats'],
  properties: {
    style: { type: 'string', enum: STYLES },
    formats: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'names', 'date'],
        properties: { key: { type: 'string' }, names: TEXT_SCHEMA, date: TEXT_SCHEMA },
      },
    },
  },
}

const SYSTEM = `Tu analyses des templates de photobooth (PNG d'impression). Les zones à damier gris sont des trous transparents où la borne place les photos : aucun texte ne doit les chevaucher.
Pour chaque format fourni, indique où placer deux textes personnalisables : les prénoms (texte principal, ex. « Sophie & Marc ») et la date (texte secondaire, plus petit, ex. « 14 juin 2025 »).
- Place-les dans l'espace libre prévu pour le texte (bandeau, cartouche, zone vide sous/à côté des photos), jamais sur un trou ni sur un élément graphique important. Si le design contient déjà un emplacement ou un texte d'exemple pour les prénoms, reprends sa position.
- x, y = centre du texte en fraction de la largeur/hauteur de l'image ENTIÈRE. Pour un marque-page double (deux bandes identiques côte à côte), donne la position sur la bande de GAUCHE (x < 0.5).
- size = hauteur de police en pixels du fichier natif (dimensions indiquées). Les prénoms doivent tenir dans l'espace libre (environ 11 caractères) ; la date est environ 55 à 65 % des prénoms.
- color = couleur lisible sur le fond à cet endroit, dans la palette du design.
- style = l'ambiance générale du thème parmi la liste.`

async function analyze(theme, formats) {
  // la clé change avec les images ET avec la consigne (PROMPT_VERSION)
  const key = sha(Buffer.concat([Buffer.from(PROMPT_VERSION), ...formats.map((f) => Buffer.from(f.hash))]))
  if (!REANALYZE && cache[key]) return cache[key]
  const content = []
  for (const f of formats) {
    // aperçu réduit sur damier (les trous restent visibles), économe en jetons
    const tile = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#e4e4e4"/><rect width="8" height="8" fill="#bdbdbd"/><rect x="8" y="8" width="8" height="8" fill="#bdbdbd"/></svg>`)
    const small = await sharp(f.buf).resize({ width: f.width >= f.height ? 900 : 600 }).png().toBuffer()
    const meta = await sharp(small).metadata()
    const bg = await sharp({ create: { width: meta.width, height: meta.height, channels: 3, background: '#e4e4e4' } })
      .composite([{ input: tile, tile: true }, { input: small }]).jpeg({ quality: 82 }).toBuffer()
    const holesTxt = f.boxes.map((b) => `[${b.map((v) => v.toFixed(2)).join(', ')}]`).join(' ')
    content.push({ type: 'text', text: `Format « ${f.key} » (${FORMAT_META[f.key].lbl}) — fichier natif ${f.width} × ${f.height} px${f.key.startsWith('s') ? ' — marque-page double' : ''}. Photos (trous, fractions x0, y0, x1, y1) : ${holesTxt}` })
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: bg.toString('base64') } })
  }
  content.push({ type: 'text', text: `Thème : « ${theme} ». Réponds pour chacun des formats : ${formats.map((f) => f.key).join(', ')}.` })

  const ask = async (messages) => {
    const res = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: AI_SCHEMA } },
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages,
    })
    if (res.stop_reason === 'refusal') throw new Error('analyse IA refusée')
    const text = res.content.find((b) => b.type === 'text')?.text
    if (!text) throw new Error('réponse IA vide')
    return { res, out: JSON.parse(text) }
  }
  const messages = [{ role: 'user', content }]
  let { res, out } = await ask(messages)
  // Contrôle : un texte sur une photo ou hors cadre → une seule demande de correction
  const issues = formats.flatMap((f) => { const a = out.formats.find((x) => x.key === f.key); return a ? placementIssues(f, a) : [`${f.key} : format manquant`] })
  if (issues.length) {
    messages.push({ role: 'assistant', content: res.content.filter((b) => b.type === 'text') })
    messages.push({ role: 'user', content: `Corrige ces placements (garde les autres identiques) : ${issues.join(' ; ')}. Les textes ne doivent recouvrir aucune des zones photo indiquées.` })
    ;({ out } = await ask(messages))
  }
  out.issues = formats.flatMap((f) => { const a = out.formats.find((x) => x.key === f.key); return a ? placementIssues(f, a) : [] })
  cache[key] = out
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 1))
  return out
}

/** Boîte approximative d'un texte centré (fractions), d'après sa taille et son nombre de caractères. */
const textBox = (v, chars, W, H) => {
  const w = (v.size * 0.55 * chars) / W
  const h = (v.size * 1.1) / H
  return [v.x - w / 2, v.y - h / 2, v.x + w / 2, v.y + h / 2]
}
const overlap = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]))
/** Problèmes de placement d'un format : texte sur une photo ou hors de l'image. */
function placementIssues(f, a) {
  const issues = []
  for (const [role, v, chars] of [['prénoms', a.names, 13], ['date', a.date, 12]]) {
    const b = textBox(v, chars, f.width, f.height)
    const area = (b[2] - b[0]) * (b[3] - b[1])
    if (f.boxes.some((h) => overlap(b, h) > area * 0.08)) issues.push(`${f.key} : les ${role} chevauchent une photo`)
    if (b[0] < 0 || b[2] > (f.key.startsWith('s') ? 0.5 : 1) || b[1] < 0 || b[3] > 1) issues.push(`${f.key} : les ${role} dépassent ${f.key.startsWith('s') ? 'de la bande gauche' : 'de l\u2019image'}`)
  }
  return issues
}

const hex = (c, d) => (/^#[0-9a-f]{6}$/i.test(c ?? '') ? c : d)
const clamp = (v, a, b) => Math.min(b, Math.max(a, Number(v) || 0))
const toDef = (a, key, W) => {
  const book = key.startsWith('s')
  const right = book ? 0.5 : 1
  const one = (t, v, d) => {
    const x = clamp(v.x, book ? 0.03 : 0.05, book ? 0.47 : 0.95)
    // garde-fou : un texte qui déborderait du cadre (ou de la bande gauche) est réduit pour tenir
    const room = 2 * Math.min(x, right - x) * 0.96
    const fit = (room * W) / (0.55 * t.length)
    return { t, x: +x.toFixed(3), y: +clamp(v.y, 0.03, 0.97).toFixed(3), sz: Math.round(clamp(Math.min(v.size, fit), 18, 400)), c: hex(v.color, d), b: !!v.bold }
  }
  return [one('Sophie & Marc', a.names, '#1a1410'), one('14 juin 2025', a.date, '#C9A84C')]
}

// ───────────── planche de contrôle (--apercu) ─────────────
async function contactSheet(slug, inputs, fmts) {
  fs.mkdirSync(PREVIEW_DIR, { recursive: true })
  const tiles = []
  for (const f of inputs) {
    const def = fmts[f.key].def
    const t = (d) => `<text x="${d.x * f.width}" y="${d.y * f.height}" font-family="Georgia, serif" font-size="${d.sz}" fill="${d.c}" font-weight="${d.b ? 700 : 400}" text-anchor="middle" dominant-baseline="middle">${d.t.replace(/&/g, '&amp;')}</text>`
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${f.width}" height="${f.height}">${def.map(t).join('')}<text x="24" y="70" font-size="56" fill="#d83232" font-family="Arial">${f.key}</text></svg>`)
    const full = await sharp({ create: { width: f.width, height: f.height, channels: 3, background: '#9db0b6' } }).composite([{ input: f.buf }, { input: svg }]).png().toBuffer()
    tiles.push(await sharp(full).resize({ height: 600 }).png().toBuffer())
  }
  const metas = await Promise.all(tiles.map((x) => sharp(x).metadata()))
  let x = 10
  const comp = tiles.map((tile, i) => { const c = { input: tile, left: x, top: 10 }; x += metas[i].width + 10; return c })
  await sharp({ create: { width: x, height: 620, channels: 3, background: '#ffffff' } }).composite(comp).jpeg({ quality: 82 }).toFile(path.join(PREVIEW_DIR, `${slug}.jpg`))
}

// ───────────── Storage ─────────────
const CT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2' }
async function upload(p, buf) {
  const ext = p.split('.').pop().toLowerCase()
  if (!DRY) {
    const { error } = await sb.storage.from(BUCKET).upload(p, buf, { upsert: true, contentType: CT[ext] ?? 'application/octet-stream', cacheControl: '31536000' })
    if (error) throw new Error(`envoi ${p} : ${error.message}`)
  }
  // ?v= = empreinte du contenu : l'URL change seulement si le fichier change
  return `${sb.storage.from(BUCKET).getPublicUrl(p).data.publicUrl}?v=${sha(buf).slice(0, 10)}`
}

// ───────────── traitement d'un thème ─────────────
async function ingest(t, existing, report) {
  const slug = slugify(t.name)
  const r = { slug, name: t.name, warnings: [] }
  report.push(r)
  const entries = t.zip ? await entriesFromZip(readFileRetry(t.source)) : await entriesFromDir(t.source)
  const base = `themes/${slug}`
  const prev = existing.get(slug)

  // Documentation : polices requises (« Nom - https://… »)
  const docFonts = []
  for (const e of entries.filter((e) => /documentation\.txt$/i.test(e.name) && !/welcome/i.test(e.path))) {
    const txt = (await e.read()).toString('utf8')
    for (const m of txt.matchAll(/^\s*([^\n\r-][^\n\r]*?)\s+-\s+(https?:\/\/\S+)/gm))
      if (/font/i.test(m[2])) docFonts.push({ name: m[1].trim(), url: m[2] })
  }

  // Polices (fichiers, y compris dans des ZIP imbriqués) → thème + fonts_library
  const fonts = []
  const seenFont = new Set()
  for (const e of entries.filter((e) => FONT.test(e.name))) {
    const name = fontNameFromFile(e.name)
    if (seenFont.has(name.toLowerCase()) || /variable/i.test(name)) continue
    seenFont.add(name.toLowerCase())
    const url = await upload(`${base}/fonts/${slugify(name)}.${e.name.split('.').pop().toLowerCase()}`, await e.read())
    fonts.push({ name, url, source: 'file' })
  }
  for (const d of docFonts) {
    if (/google/i.test(d.url) && !seenFont.has(d.name.toLowerCase())) {
      seenFont.add(d.name.toLowerCase())
      fonts.push({ name: d.name, url: `https://fonts.googleapis.com/css2?family=${d.name.replace(/ /g, '+')}:wght@400;700&display=swap`, source: 'google' })
    } else if (!seenFont.has(d.name.toLowerCase())) r.warnings.push(`police « ${d.name} » requise mais absente des fichiers`)
  }
  // Police du template : la première citée par la documentation, sinon la première trouvée
  const fontName = docFonts.map((d) => d.name).find((n) => seenFont.has(n.toLowerCase())) ?? fonts[0]?.name ?? prev?.font_name ?? null

  // Images
  const pngs = []
  const extra = []
  const welcome = []
  const digits = {}
  let preview = null
  for (const e of entries.filter((e) => IMG.test(e.name))) {
    const lower = e.path.toLowerCase()
    if (/welcome/.test(lower)) {
      if (/\.png$/.test(lower) && /\/png\//.test(lower)) welcome.push(e)
      continue
    }
    if (/(^|\/)[0-9]\.png$/.test(lower) || /(chiffre|number|digit)[\s_-]*[0-9]\.png$/.test(lower)) {
      digits[lower.match(/([0-9])\.png$/)[1]] = e
      continue
    }
    if (/\.jpe?g$/.test(lower) && !/single strip/.test(lower)) { if (!preview || /cover|preview|apercu/.test(lower)) preview = e; continue }
    if (/\.png$/.test(lower)) pngs.push(e)
  }

  // Formats : analyse de chaque PNG (type d'après le nom ou les dimensions, trous), puis attribution
  const cands = []
  for (const e of pngs.sort((a, b) => a.path.localeCompare(b.path))) {
    if (/single strip/i.test(e.path)) continue // marque-pages doubles uniquement
    const buf = await e.read()
    const meta = await sharp(buf).metadata()
    const kind = kindOf(e.path, meta)
    cands.push({ e, buf, meta, kind, h: kind ? await holes(buf) : null })
  }
  const fmts = {}
  const aiInput = []
  const order = ['s4p', 's6p', 'port1', 'port2', 'land3', 'land1']
  const assigned = assignFormats(cands.filter((c) => c.kind))
  for (const key of order.filter((k) => assigned.has(k))) {
    const c = assigned.get(key)
    const file = normalize(c.e.name).replace(/\s+/g, '-').replace(/[^a-z0-9.-]/g, '')
    fmts[key] = { w: c.meta.width, h: c.meta.height, src: await upload(`${base}/${file}`, c.buf), ...FORMAT_META[key] }
    aiInput.push({ key, buf: c.buf, width: c.meta.width, height: c.meta.height, hash: sha(c.buf), boxes: c.h.boxes })
  }
  for (const c of cands) if (!c.used) extra.push(c)
  if (!Object.keys(fmts).length) { r.action = 'ignoré'; r.warnings.push('aucun format reconnu'); return }

  // Textes par défaut + style
  let style = prev?.style ?? null
  let ai = null
  if (USE_AI) {
    try { ai = await analyze(t.name, aiInput) } catch (err) { r.warnings.push(`IA : ${err.message}`) }
  }
  if (ai?.style) style = ai.style
  if (ai?.issues?.length) r.warnings.push(...ai.issues.map((i) => `à vérifier — ${i}`))
  for (const [key, f] of Object.entries(fmts)) {
    const prevDef = prev?.fmts?.[key]?.def
    const a = ai?.formats?.find((x) => x.key === key)
    f.def = KEEP_DEF && prevDef ? prevDef : a ? toDef(a, key, f.w) : prevDef ?? neutralDef(key)
  }
  r.ai = ai ? 'ok' : USE_AI ? 'échec' : '—'
  if (PREVIEW) await contactSheet(slug, aiInput, fmts)

  // Fichiers annexes, aperçu, écrans d'accueil, chiffres
  const preview_url = preview ? await upload(`${base}/preview.jpg`, await sharp(await preview.read()).resize({ width: 900, withoutEnlargement: true }).jpeg({ quality: 84 }).toBuffer()) : prev?.preview_url ?? null
  if (!preview) r.warnings.push('pas de JPG d’aperçu')
  const extra_files = []
  let i = 0
  for (const x of extra) extra_files.push({ name: x.e.name, w: x.meta.width, h: x.meta.height, url: await upload(`${base}/unassigned/${++i}-${slugify(x.e.name.replace(/\.png$/i, ''))}.png`, x.buf) })
  const welcome_screens = []
  for (const w of welcome) {
    const buf = await w.read()
    const meta = await sharp(buf).metadata()
    welcome_screens.push({ name: w.name, w: meta.width, h: meta.height, url: await upload(`${base}/welcome/${slugify(w.name.replace(/\.png$/i, ''))}.png`, buf) })
  }
  const digitUrls = {}
  for (const [d, e] of Object.entries(digits)) digitUrls[d] = await upload(`${base}/${d}.png`, await e.read())

  const row = {
    slug, name: t.name, category: categoryOf(t.folder, t.name), style, font_name: fontName, preview_url,
    fmts,
    fonts: fonts.length ? fonts : prev?.fonts ?? [],
    extra_files,
    welcome_screens: welcome_screens.length ? welcome_screens : prev?.welcome_screens ?? null,
    digits: Object.keys(digitUrls).length ? digitUrls : prev?.digits ?? null,
  }
  Object.assign(r, {
    category: row.category, style, font: fontName, formats: Object.keys(fmts).join(' '), fonts: row.fonts.length,
    welcome: welcome_screens.length, digits: Object.keys(digitUrls).length, extra: extra_files.length,
  })

  if (!DRY) {
    if (prev) {
      const { error } = await sb.from('themes').update(row).eq('slug', slug)
      if (error) throw new Error(`mise à jour : ${error.message}`)
    } else {
      const max = Math.max(0, ...[...existing.values()].map((x) => x.sort_order ?? 0))
      const { error } = await sb.from('themes').insert({ ...row, active: true, sort_order: max + 1 })
      if (error) throw new Error(`création : ${error.message}`)
      existing.set(slug, { ...row, sort_order: max + 1 })
    }
  }
  r.action = prev ? 'mis à jour' : 'créé'
  return fonts
}

// ───────────── programme principal ─────────────
const t0 = Date.now()
console.log(`\nIngestion des thèmes — ${ROOT}${DRY ? '  [SIMULATION]' : ''}${USE_AI ? `  [IA ${MODEL}]` : '  [sans IA]'}\n`)
const { data: rows, error } = await sb.from('themes').select('slug, font_name, style, preview_url, fmts, fonts, digits, welcome_screens, sort_order')
if (error) fail(`lecture de la table themes : ${error.message}`)
const existing = new Map(rows.filter((r) => r.slug).map((r) => [r.slug, r]))

let themes = discover()
if (ONLY?.length) themes = themes.filter((t) => ONLY.some((o) => t.name.toLowerCase().includes(o) || slugify(t.name).includes(o)))
themes = themes.slice(0, LIMIT)
console.log(`${themes.length} thème(s) à traiter\n`)

const report = []
const allFonts = []
for (const [n, t] of themes.entries()) {
  process.stdout.write(`[${n + 1}/${themes.length}] ${t.name} … `)
  try {
    const f = await ingest(t, existing, report)
    if (f) allFonts.push(...f)
    const r = report[report.length - 1]
    console.log(`${r.action}${r.formats ? ` · ${r.formats}` : ''}${r.warnings.length ? ` ⚠ ${r.warnings.join(' ; ')}` : ''}`)
  } catch (err) {
    const r = report[report.length - 1] ?? { name: t.name, warnings: [] }
    r.action = 'erreur'
    r.warnings.push(err.message)
    console.log(`✖ ${err.message}`)
  }
}

// Bibliothèque de polices : ajoute celles qui n'y sont pas encore (par nom)
let fontsAdded = 0
if (allFonts.length) {
  const { data: lib } = await sb.from('fonts_library').select('name')
  const have = new Set((lib ?? []).map((f) => f.name.toLowerCase()))
  const add = []
  for (const f of allFonts.filter((f) => f.source === 'file' && !isVariant(f.name))) {
    if (have.has(f.name.toLowerCase())) continue
    have.add(f.name.toLowerCase())
    add.push({ name: f.name, url: f.url.split('?')[0], category: guessFontCategory(f.name) })
  }
  if (add.length && !DRY) {
    const { error: e } = await sb.from('fonts_library').insert(add)
    if (e) console.log(`⚠ fonts_library : ${e.message}`)
  }
  fontsAdded = add.length
}

// Rapport
console.log('\n──────── Rapport ────────')
console.table(report.map((r) => ({
  thème: r.name, action: r.action, catégorie: r.category ?? '', style: r.style ?? '', formats: r.formats ?? '',
  police: r.font ?? '', polices: r.fonts ?? 0, accueil: r.welcome ?? 0, chiffres: r.digits ?? 0, IA: r.ai ?? '',
})))
const count = (a) => report.filter((r) => r.action === a).length
console.log(`Créés : ${count('créé')} · mis à jour : ${count('mis à jour')} · ignorés : ${count('ignoré')} · erreurs : ${count('erreur')}`)
console.log(`Polices ajoutées à la bibliothèque : ${fontsAdded}`)
const warn = report.filter((r) => r.warnings.length)
if (warn.length) {
  console.log('\nÀ vérifier :')
  for (const r of warn) console.log(`  • ${r.name} : ${r.warnings.join(' ; ')}`)
}
console.log(`\nTerminé en ${Math.round((Date.now() - t0) / 1000)} s${DRY ? ' (simulation : rien n’a été envoyé ni écrit)' : ''}.\n`)

// Page récapitulative des planches de contrôle (--apercu) : scripts/.ingest-apercu/index.html
if (PREVIEW && fs.existsSync(PREVIEW_DIR)) {
  const files = fs.readdirSync(PREVIEW_DIR).filter((f) => f.endsWith('.jpg')).sort()
  const warned = new Map(report.filter((r) => r.warnings.length).map((r) => [r.slug, r.warnings]))
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  const html = `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Planches de contrôle</title>
<style>body{font-family:Poppins,system-ui,sans-serif;background:#F7F5F2;color:#1a1410;margin:0;padding:24px}h1{font-size:20px;color:#0C2830}
section{background:#fff;border:1px solid #e6e2da;border-radius:12px;padding:12px 14px;margin:0 0 16px}h2{font-size:14px;margin:0 0 8px}
img{width:100%;height:auto;display:block;border-radius:6px}.w{color:#c0392b;font-size:12px;margin:0 0 8px}</style>
<h1>Planches de contrôle — ${files.length} thème(s)</h1>
${files.map((f) => { const slug = f.replace(/\.jpg$/, ''); const w = warned.get(slug); return `<section id="${esc(slug)}"><h2>${esc(slug)}</h2>${w ? `<p class="w">⚠ ${esc(w.join(' ; '))}</p>` : ''}<img loading="lazy" src="${esc(f)}" alt=""></section>` }).join('\n')}
</html>`
  fs.writeFileSync(path.join(PREVIEW_DIR, 'index.html'), html)
  console.log(`Planches : ${path.join(PREVIEW_DIR, 'index.html')}`)
}
