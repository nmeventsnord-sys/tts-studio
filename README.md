# Time To Smile · Studio (`tts-studio`)

## 1. À quoi sert le logiciel

Le **Studio** est l'espace de personnalisation des photobooths de Time To Smile, en ligne sur **https://perso.timetosmile.fr**. Un client (mariage, anniversaire, entreprise…) y prépare le visuel que la borne imprimera le jour J :

1. il choisit un **thème** parmi la bibliothèque (≈ 140 thèmes) et un **format** d'impression, ou part d'une page vierge, ou envoie le lien de son design Canva ;
2. il **personnalise** le template dans l'éditeur (prénoms, date, textes, couleurs, fonds, polices, photos détourées) et pose les **zones photo** numérotées là où la borne placera les prises de vue ;
3. il **envoie** le résultat : le PNG d'impression et le plan annoté partent directement dans son dossier client de **Zing** (l'ERP maison), avec un PDF récapitulatif.

L'équipe Time To Smile dispose d'un **mode master** (comptes Zing admin/collaborateur) pour retoucher le projet d'un client avant l'événement.

### Lien avec les bornes : rien ne s'installe sur les bornes

Le Studio est une **application web** hébergée sur Vercel ; il **ne s'installe pas et ne se met pas à jour sur les bornes**. Les bornes n'exécutent aucun code de ce dépôt :

- le Studio produit un **fichier PNG d'impression au format exact de la borne** (dimensions dans `src/data/formats.ts`), avec les zones photo transparentes/numérotées ;
- ce fichier arrive dans la fiche client Zing (`api/send-template.ts` → `POST {ZING_API_URL}/api/send-template`) ;
- l'équipe charge ensuite ce template dans le logiciel de la borne par la procédure habituelle du fabricant (hors de ce dépôt).

Mettre à jour le Studio = pousser sur `main` (voir § 5) ; cela ne touche aucune borne.

## 2. Structure du projet

```
src/                 Front Vite + React 19 + TypeScript (SPA, react-router)
  screens/           Écrans du parcours : Auth, Parcours, Galerie, Formats, Editor, Envoye, Projets, Apercu, ResetPassword
  editor/            Éditeur Fabric.js 7 : moteur (engine.ts), export PNG/PDF (export.ts), détourage (cutout.ts),
                     fonds, polices, panneaux, modales d'envoi et de projets, tutoriel
  components/        Hero, aperçu de template, miniatures, modale Canva, aide
  lib/               Clients et accès : supabase.ts, api.ts, session.tsx, projects.ts, themes.ts, fonts.ts, upload.ts, help.ts
  data/              formats.ts (formats d'impression des bornes), fontLibrary.ts
  styles/            studio.css, editor.css
api/                 Fonctions serveur Vercel (Node) : signup, reset-password, sign-upload, send-template, help, master
  _lib/              brevo.ts (envoi d'e-mails), http.ts (helpers)
scripts/ingest-themes.mjs   Ingestion des thèmes depuis le dossier Google Drive vers Supabase (PC du bureau)
sql/                 Changements SQL à appliquer à la main dans Supabase (base partagée avec Zing)
public/              favicon, exemples
index.html, vite.config.ts, tsconfig.json, vercel.json, pnpm-workspace.yaml
prototype-studio-tts.html   Prototype statique d'origine (référence, non servi)
```

`vite.config.ts` exécute les fonctions `api/*.ts` comme le ferait Vercel pendant `pnpm dev` : pas besoin de `vercel dev`.

### Parcours et routes

| Écran | Route | Rôle |
|---|---|---|
| Connexion | `/connexion` | compte (sans e-mail de confirmation), connexion, mot de passe oublié, invité (prénom, nom, e-mail) |
| 1 · Parcours | `/` | personnaliser un thème · créer de A à Z · partager un Canva |
| 2 · Galerie | `/themes` | thèmes actifs, recherche, catégories, styles |
| 3 · Formats | `/formats/:slug` (`/formats/libre`) | aperçu réel de chaque format, prénoms et date |
| 4 · Éditeur | `/editeur?theme=…&format=…` · `?libre=port\|land\|mark` · `?projet=<id>` | |
| 5 · Envoi | `/envoye` | confirmation + PDF récapitulatif |
| Mes projets | `/projets` | 3 projets max (compte : en ligne ; invité : sur l'appareil) |
| Mode Time To Smile | `/editeur?master=<id>[&export=png]` | retouche d'un projet client (comptes Zing admin/collaborateur) |

### Fonctions serveur (`api/`)

| Fonction | Rôle |
|---|---|
| `signup` | crée un compte déjà confirmé (clé service_role) |
| `reset-password` | lien « mot de passe oublié » envoyé par Brevo |
| `sign-upload` | URL de dépôt signées vers `template/studio/<compte\|invites>/…` (images, miniatures, envois) |
| `send-template` | relais vers Zing `POST {ZING_API_URL}/api/send-template` (`png_url`, `annotated_url` ou `lien_canva`) |
| `help` | « Besoin d'aide ? » : table `messages` + e-mail Brevo à l'équipe |
| `master` | lecture/enregistrement d'un projet client pour l'équipe (rôles Zing) |

## 3. Lancer le projet

Prérequis : Node ≥ 20, pnpm.

```bash
pnpm install
cp .env.example .env.local   # puis remplir les valeurs (voir § 4)
pnpm dev                     # http://localhost:5173 — les fonctions api/ tournent aussi en local
pnpm typecheck
pnpm build                   # tsc + vite build → dist/
pnpm preview
```

### Ingestion des thèmes (`pnpm ingest:themes`)

Depuis un PC où le dossier des templates est synchronisé (Google Drive pour ordinateur), **au bureau** (le réseau hors bureau bloque les scripts) :

```bash
pnpm ingest:themes -- --dry-run --ai --apercu   # simulation + planches de contrôle (scripts/.ingest-apercu/)
pnpm ingest:themes                              # écrit en base et envoie les fichiers
pnpm ingest:themes -- --only=champagne          # un seul thème
```

Options : `--dry-run`, `--only=<texte>`, `--limit=<n>`, `--no-ai`, `--reanalyze`, `--keep-def`, `--apercu`. L'analyse IA (Claude) est mise en cache dans `scripts/.ingest-cache.json` (ignoré par git) : un thème déjà analysé n'est pas refacturé.

## 4. Bases de données et services utilisés

| Service | Usage | Variables (`.env.example`) |
|---|---|---|
| **Supabase** (projet partagé avec Zing) | Auth (comptes clients, comptes Zing pour le mode master), tables `themes`, `fonts_library`, `client_projects`, `messages`, bucket public `template` (thèmes, polices, envois des clients). Le schéma des tables Zing n'est jamais modifié par l'application ; les changements proposés sont dans `sql/` | navigateur : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` · serveur : `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Zing** (ERP maison, app Replit) | réception des templates envoyés dans la fiche client ; rôles admin/collaborateur du mode master | `ZING_API_URL` |
| **Brevo** | e-mails transactionnels : mot de passe oublié, messages « Besoin d'aide ? » vers l'équipe | `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, `HELP_NOTIFY_EMAIL` |
| **Vercel** | hébergement du front (`dist/`) et des fonctions `api/`, région Paris (`cdg1`) | `PUBLIC_URL`, (`VERCEL_URL` fournie par Vercel) |
| **Anthropic (Claude)** | uniquement le script d'ingestion : analyse des textes par défaut des thèmes | `ANTHROPIC_API_KEY`, `ANTHROPIC_WORKSPACE_ID`, `TEMPLATES_PATH` (jamais sur Vercel) |
| Navigateur du client | `@imgly/background-removal` (détourage local), `jspdf` (PDF récapitulatif), Fabric.js ; projets des invités stockés sur l'appareil | `STUDIO_SECRET` (facultatif, jetons du fil d'aide des invités) |

**Secrets** : aucune valeur réelle n'est versionnée. `.env`, `.env.*` (sauf `.env.example`), `env.download`, `dist/`, `.vercel/` et les caches d'ingestion sont dans `.gitignore`. Les valeurs de production se posent dans Vercel → Settings → Environment Variables ; en local dans `.env.local`.

### SQL (base partagée avec Zing)

À appliquer à la main dans l'éditeur SQL du projet Supabase :

| Fichier | Rôle | État au 01/10/2026 |
|---|---|---|
| `001_limite_3_projets.sql` | limite de 3 projets vérifiée par la base | appliqué |
| `002_bucket_template_securite.sql` | retire l'écriture anonyme totale sur le bucket `template` | appliqué |
| `003_ancien_studio_depot_invites.sql` | dépôt anonyme minimal pour l'ancien Studio jusqu'à la bascule | appliqué — à retirer après la bascule |

Colonnes ajoutées précédemment : `themes.slug` (unique), `themes.style`, `fonts_library.category`.

## 5. Déploiement et mise à jour (Vercel)

Chaque push sur `main` déclenche un déploiement Vercel (projet `tts-studio`) ; c'est **la** procédure de mise à jour du Studio. Le dépôt relié à Vercel est `nmeventsnord-sys/tts-studio` ; ce dépôt-ci (`timetosmile-logiciel`) est une copie de sauvegarde : pousser ici ne déploie rien.

Mise en place initiale (déjà faite) :

1. **Projet Vercel** : https://vercel.com/new → importer le dépôt GitHub (équipe Time To Smile). Framework **Vite** détecté ; `vercel.json` fixe build, sortie `dist`, région `cdg1`. Ne rien changer.
2. **Variables** : Settings → Environment Variables, Production et Preview : toutes celles de `.env.example` **sauf** `TEMPLATES_PATH`, `ANTHROPIC_API_KEY`, `ANTHROPIC_WORKSPACE_ID` (réservées au script d'ingestion). `PUBLIC_URL` = `https://perso.timetosmile.fr`. Puis Deployments → Redeploy.
3. **Supabase** : Authentication → URL Configuration → Redirect URLs : `https://perso.timetosmile.fr/**`, `https://*-timetosmile.vercel.app/**`, `http://localhost:5173/**` (lien du mot de passe oublié).
4. **Domaine** : Vercel → Settings → Domains → `perso.timetosmile.fr` ; OVH → zone DNS de `timetosmile.fr` → CNAME `perso` → `cname.vercel-dns.com.` (point final). Certificat HTTPS émis par Vercel.
5. **Bascule depuis l'ancien Studio Zing** (`/personnalisation`) : tester un envoi réel, un message d'aide et le mode master sur `perso.timetosmile.fr` ; remplacer dans Zing les liens vers `/personnalisation` par `https://perso.timetosmile.fr` (master : `/editeur?master=<id>`) ; une fois l'ancien Studio retiré, appliquer le bloc « Retrait » de `sql/003_ancien_studio_depot_invites.sql`.
