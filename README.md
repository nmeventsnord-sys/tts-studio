# Time To Smile · Studio

L'espace de personnalisation photobooth de Time To Smile : le client choisit un thème et un format (ou part d'une page vierge, ou envoie son Canva), personnalise son template dans l'éditeur, puis l'envoie directement dans son dossier Zing.

- **Front** : Vite + React + TypeScript, éditeur Fabric.js 7 (`src/`)
- **Données** : Supabase partagé avec Zing — tables `themes`, `fonts_library`, `client_projects`, `messages` ; bucket public `template`
- **Serveur** : fonctions Vercel dans `api/` (clé service_role, Brevo, relais Zing)
- **Ingestion des thèmes** : `scripts/ingest-themes.mjs`, lancé depuis un PC (`pnpm ingest:themes`)

## Parcours

| Écran | Route | Rôle |
|---|---|---|
| Connexion | `/connexion` | compte (sans email de confirmation), connexion, mot de passe oublié, invité (prénom, nom, email) |
| 1 · Parcours | `/` | personnaliser un thème · créer de A à Z · partager un Canva |
| 2 · Galerie | `/themes` | thèmes actifs, recherche, catégories, styles |
| 3 · Formats | `/formats/:slug` (`/formats/libre`) | aperçu réel de chaque format, prénoms et date |
| 4 · Éditeur | `/editeur?theme=…&format=…` · `?libre=port\|land\|mark` · `?projet=<id>` | |
| 5 · Envoi | `/envoye` | confirmation + PDF récapitulatif |
| Mes projets | `/projets` | 3 projets max (compte : en ligne ; invité : sur l'appareil) |
| Mode Time To Smile | `/editeur?master=<id>[&export=png]` | retouche d'un projet client (comptes Zing admin/collaborateur) |

## Développement

```bash
pnpm install
cp .env.example .env.local   # puis remplir les valeurs
pnpm dev                     # http://localhost:5173 — les fonctions api/ tournent aussi en local
pnpm typecheck
pnpm build
```

`vite.config.ts` exécute les fonctions `api/*.ts` comme Vercel pendant `pnpm dev` : pas besoin de `vercel dev`.

## Fonctions serveur (`api/`)

| Fonction | Rôle |
|---|---|
| `signup` | crée un compte déjà confirmé (clé service_role) |
| `reset-password` | lien « mot de passe oublié » envoyé par Brevo |
| `sign-upload` | URL de dépôt signées vers `template/studio/<compte\|invites>/…` (images, miniatures, envois) |
| `send-template` | relais vers Zing `POST {ZING_API_URL}/api/send-template` (`png_url`, `annotated_url` ou `lien_canva`) |
| `help` | « Besoin d'aide ? » : table `messages` + email Brevo à l'équipe |
| `master` | lecture/enregistrement d'un projet client pour l'équipe (rôles Zing) |

## Ingestion des thèmes

Depuis un PC où le dossier des templates est synchronisé (Google Drive pour ordinateur), **au bureau** (le réseau hors bureau bloque les scripts) :

```bash
pnpm ingest:themes -- --dry-run --ai --apercu   # simulation + planches de contrôle (scripts/.ingest-apercu/)
pnpm ingest:themes                              # écrit en base et envoie les fichiers
pnpm ingest:themes -- --only=champagne          # un seul thème
```

Options : `--dry-run`, `--only=<texte>`, `--limit=<n>`, `--no-ai`, `--reanalyze`, `--keep-def`, `--apercu`. L'analyse IA (Claude) est mise en cache dans `scripts/.ingest-cache.json` : un thème déjà analysé n'est pas refacturé.

## Déploiement sur Vercel

### 1. Créer le projet
1. https://vercel.com/new → importer le dépôt GitHub `nmeventsnord-sys/tts-studio` (équipe Time To Smile).
   Si le dépôt n'apparaît pas : *Adjust GitHub App Permissions* → autoriser `tts-studio`.
2. Framework : **Vite** (détecté, `vercel.json` fixe build, sortie `dist`, région Paris `cdg1`). Ne rien changer.
3. Ne pas déployer tout de suite : ajouter d'abord les variables (étape 2).

### 2. Variables d'environnement
Vercel → projet → **Settings → Environment Variables**, pour *Production* et *Preview* : toutes les variables de `.env.example` **sauf** `TEMPLATES_PATH`, `ANTHROPIC_API_KEY`, `ANTHROPIC_WORKSPACE_ID` (réservées au script d'ingestion).
`PUBLIC_URL` = l'adresse définitive (`https://perso.timetosmile.fr`).

Puis *Deployments → Redeploy*. Chaque push sur `main` crée ensuite un déploiement.

### 3. Supabase
Authentication → URL Configuration → **Redirect URLs** : ajouter
`https://perso.timetosmile.fr/**`, `https://*-timetosmile.vercel.app/**` et `http://localhost:5173/**`
(lien du mot de passe oublié) : https://supabase.com/dashboard/project/qfizhtcwxwjvohukmzay/auth/url-configuration

### 4. Domaine `perso.timetosmile.fr`
1. Vercel → projet → **Settings → Domains** → ajouter `perso.timetosmile.fr`.
2. OVH → Web Cloud → Domaines → `timetosmile.fr` → **Zone DNS** → *Ajouter une entrée* **CNAME** :
   sous-domaine `perso`, cible `cname.vercel-dns.com.` (garder le point final).
3. Attendre la validation (quelques minutes à quelques heures) : Vercel émet le certificat HTTPS tout seul.

### 5. Bascule depuis l'ancien Studio Zing (`/personnalisation`)
1. Tester sur `perso.timetosmile.fr` : un envoi réel (il doit arriver dans la fiche Zing), un message d'aide (il doit arriver sur contact@), le mode master avec un compte Zing.
2. Dans Zing : remplacer les liens vers `/personnalisation` par `https://perso.timetosmile.fr`, et le lien master par `https://perso.timetosmile.fr/editeur?master=<id>`.
3. Une fois l'ancien Studio retiré : appliquer le bloc « Retrait » de `sql/003_ancien_studio_depot_invites.sql` (ferme le dépôt anonyme minimal laissé pour l'ancien Studio).

## SQL (base partagée avec Zing)

Le schéma des tables Zing n'est jamais modifié par l'application ni par le script. Les changements proposés sont dans `sql/`, à appliquer à la main dans https://supabase.com/dashboard/project/qfizhtcwxwjvohukmzay/sql/new :

| Fichier | Rôle | État au 01/10/2026 |
|---|---|---|
| `001_limite_3_projets.sql` | limite de 3 projets vérifiée par la base | appliqué |
| `002_bucket_template_securite.sql` | retire l'écriture anonyme totale sur le bucket `template` | appliqué |
| `003_ancien_studio_depot_invites.sql` | dépôt anonyme minimal pour l'ancien Studio jusqu'à la bascule | appliqué — à retirer après la bascule |

Colonnes ajoutées précédemment : `themes.slug` (unique), `themes.style`, `fonts_library.category`.
