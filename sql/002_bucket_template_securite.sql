-- Time To Smile Studio — fermer l'écriture anonyme sur le bucket « template »
--
-- Constat (30/09/2026) : la policy « anon_all_template » donne au rôle anon TOUS les droits
-- (lecture, dépôt, remplacement, SUPPRESSION) sur tout le bucket « template », donc sur les
-- fichiers des 142 thèmes. N'importe qui disposant de la clé publique peut les effacer.
--
-- tts-studio n'en a pas besoin : il dépose ses fichiers via des URL signées (api/sign-upload)
-- et les lit par URL publique (bucket public).
--
-- ⚠️ À appliquer APRÈS la bascule : l'ancien Studio Zing (/personnalisation) dépose encore
-- les envois des invités en anonyme à la racine du bucket et cesserait de fonctionner.
-- À coller dans https://supabase.com/dashboard/project/qfizhtcwxwjvohukmzay/sql/new

drop policy if exists "anon_all_template" on storage.objects;
