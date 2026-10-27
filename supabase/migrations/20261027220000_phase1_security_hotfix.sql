-- Phase 1 security hotfix.
-- 1) Credit RPCs: only the service role (edge functions) may call them.
-- 2) Profiles: signed-in users may edit only their own display/brand fields.
--    Plan, limits, usage, credits, subscription and connection flags are server-only.
--
-- Rollback (down):
--   grant execute on function public.try_spend_credits(uuid,int), public.refund_credits(uuid,int) to anon, authenticated;
--   drop trigger if exists profiles_guard_protected on public.profiles;
--   drop function if exists public.profiles_guard_protected();

revoke execute on function public.try_spend_credits(uuid, int) from public, anon, authenticated;
revoke execute on function public.refund_credits(uuid, int) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.try_spend_credits(uuid, int) to service_role;
grant execute on function public.refund_credits(uuid, int) to service_role;

create or replace function public.profiles_guard_protected()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  allowed constant text[] := array[
    'display_name', 'brand_color', 'brand_font', 'brand_cta', 'logo_url',
    'checklist_done', 'onboarded_at'
  ];
begin
  if coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
    raise exception 'profile field is read-only' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_protected on public.profiles;
create trigger profiles_guard_protected
  before update on public.profiles
  for each row execute function public.profiles_guard_protected();

-- Users never insert or delete profiles themselves (handle_new_user creates them).
drop policy if exists "own profile" on public.profiles;
drop policy if exists "own profile select" on public.profiles;
drop policy if exists "own profile update" on public.profiles;
create policy "own profile select" on public.profiles for select using (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
