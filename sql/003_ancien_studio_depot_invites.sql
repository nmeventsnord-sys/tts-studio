-- Time To Smile Studio — dépôt anonyme minimal pour l'ANCIEN Studio Zing, jusqu'à la bascule.
-- 002 a retiré « anon_all_template » (tous droits anonymes sur le bucket, thèmes compris).
-- L'ancien Studio (/personnalisation sur Zing) dépose encore les envois des invités en anonyme,
-- à la racine : tts-<horodatage>.png et tts-<horodatage>-plan.jpg (upsert).
-- Ces règles n'autorisent QUE ces fichiers-là (aucune suppression, aucun accès aux thèmes).
-- À SUPPRIMER après la bascule vers tts-studio (bloc « retrait » en bas).
-- À coller dans https://supabase.com/dashboard/project/qfizhtcwxwjvohukmzay/sql/new

drop policy if exists "tts_ancien_studio_invites_depot" on storage.objects;
drop policy if exists "tts_ancien_studio_invites_maj" on storage.objects;
drop policy if exists "tts_ancien_studio_invites_lecture" on storage.objects;

create policy "tts_ancien_studio_invites_depot" on storage.objects for insert to anon
  with check (bucket_id = 'template' and name ~ '^tts-[0-9]+(-plan)?\.(png|jpg)$');
create policy "tts_ancien_studio_invites_maj" on storage.objects for update to anon
  using (bucket_id = 'template' and name ~ '^tts-[0-9]+(-plan)?\.(png|jpg)$')
  with check (bucket_id = 'template' and name ~ '^tts-[0-9]+(-plan)?\.(png|jpg)$');
create policy "tts_ancien_studio_invites_lecture" on storage.objects for select to anon
  using (bucket_id = 'template' and name ~ '^tts-[0-9]+(-plan)?\.(png|jpg)$');

-- Retrait après la bascule :
-- drop policy if exists "tts_ancien_studio_invites_depot" on storage.objects;
-- drop policy if exists "tts_ancien_studio_invites_maj" on storage.objects;
-- drop policy if exists "tts_ancien_studio_invites_lecture" on storage.objects;
