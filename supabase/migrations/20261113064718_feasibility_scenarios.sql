-- Saved feasibility scenarios: units an operator is considering, shared with the team.
-- Members can read them; staff and above can save, change and delete them.

create table public.feasibility_scenarios (
  org_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120 and name !~ '[[:cntrl:]]'),
  inputs jsonb not null check (jsonb_typeof(inputs) = 'object' and pg_column_size(inputs) <= 16384),
  converted_apartment_id text check (char_length(converted_apartment_id) <= 128),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, id)
);
create index feasibility_scenarios_org_idx on public.feasibility_scenarios (org_id, created_at desc);

alter table public.feasibility_scenarios enable row level security;
alter table public.feasibility_scenarios force row level security;
revoke all on public.feasibility_scenarios from anon;
revoke truncate, trigger, references on public.feasibility_scenarios from authenticated;

create policy feasibility_scenarios_select on public.feasibility_scenarios for select to authenticated
  using (private.has_org_role(org_id, '{owner,manager,staff,viewer}'::public.member_role[]));
create policy feasibility_scenarios_insert on public.feasibility_scenarios for insert to authenticated
  with check (private.can_write(org_id, '{owner,manager,staff}'::public.member_role[]));
create policy feasibility_scenarios_update on public.feasibility_scenarios for update to authenticated
  using (private.can_write(org_id, '{owner,manager,staff}'::public.member_role[]))
  with check (private.can_write(org_id, '{owner,manager,staff}'::public.member_role[]));
create policy feasibility_scenarios_delete on public.feasibility_scenarios for delete to authenticated
  using (private.can_write(org_id, '{owner,manager,staff}'::public.member_role[]));

create trigger feasibility_scenarios_updated_at before update on public.feasibility_scenarios
  for each row execute function public.set_updated_at();
create trigger feasibility_scenarios_lock_tenant before update on public.feasibility_scenarios
  for each row execute function private.lock_tenant_columns('org');
