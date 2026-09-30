-- Time To Smile Studio — limite de 3 projets par compte, vérifiée côté base
-- (jusqu'ici elle n'était vérifiée que dans le navigateur : contournable).
-- Idempotent. À coller dans https://supabase.com/dashboard/project/qfizhtcwxwjvohukmzay/sql/new

create or replace function public.tts_client_projects_limite()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.client_projects where user_id = new.user_id) >= 3 then
    raise exception 'TTS_LIMITE_PROJETS' using errcode = 'P0001',
      hint = 'Un compte peut garder 3 projets au maximum.';
  end if;
  return new;
end;
$$;

drop trigger if exists tts_client_projects_limite on public.client_projects;
create trigger tts_client_projects_limite
  before insert on public.client_projects
  for each row execute function public.tts_client_projects_limite();
