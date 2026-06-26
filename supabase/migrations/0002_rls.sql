-- Ripple v2 — Row Level Security
-- The Postgres equivalent of v1's user_id / team_id scoping. Membership checks
-- run through SECURITY DEFINER helpers so policies never recurse into the
-- memberships table's own RLS.

-- ---------------------------------------------------------------------------
-- Scope helpers (SECURITY DEFINER → bypass RLS while evaluating access)
-- ---------------------------------------------------------------------------
create or replace function public.my_email()
returns text language sql stable security definer set search_path = public as $$
  select lower(coalesce((select email from public.profiles where id = auth.uid()), ''));
$$;

create or replace function public.is_room_member(_team uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select _team is not null and (
    exists (select 1 from public.teams t       where t.id = _team and t.owner_id = auth.uid())
 or exists (select 1 from public.memberships m where m.team_id = _team and m.user_id = auth.uid() and m.status = 'accepted')
  );
$$;

create or replace function public.is_room_admin(_team uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select _team is not null and (
    exists (select 1 from public.teams t       where t.id = _team and t.owner_id = auth.uid())
 or exists (select 1 from public.memberships m where m.team_id = _team and m.user_id = auth.uid() and m.status = 'accepted' and m.role = 'admin')
  );
$$;

create or replace function public.can_touch_task(_task uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tasks t
     where t.id = _task
       and (t.user_id = auth.uid() or t.assignee_id = auth.uid()
            or (t.team_id is not null and public.is_room_member(t.team_id)))
  );
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS on every table
-- ---------------------------------------------------------------------------
alter table public.profiles    enable row level security;
alter table public.teams       enable row level security;
alter table public.memberships enable row level security;
alter table public.projects    enable row level security;
alter table public.tasks       enable row level security;
alter table public.subtasks    enable row level security;
alter table public.comments    enable row level security;
alter table public.notes       enable row level security;
alter table public.goals       enable row level security;
alter table public.habits      enable row level security;
alter table public.decisions   enable row level security;
alter table public.discussions enable row level security;
alter table public.files       enable row level security;
alter table public.messages    enable row level security;
alter table public.push_subs   enable row level security;

-- ---------------------------------------------------------------------------
-- profiles — any signed-in user can read profiles (member names / assignee
-- pickers); you can only edit your own.
-- ---------------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- teams — members can read; creation/admin happen through RPCs (0003). Owner
-- may delete their room directly.
-- ---------------------------------------------------------------------------
create policy teams_select on public.teams for select to authenticated using (public.is_room_member(id));
create policy teams_delete on public.teams for delete to authenticated using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- memberships — visible to room members, to the bound user, and to the invitee
-- (so a pending invite shows up). All writes go through SECURITY DEFINER RPCs
-- in 0003, except a member muting their own row.
-- ---------------------------------------------------------------------------
create policy memberships_select on public.memberships for select to authenticated
  using (public.is_room_member(team_id) or user_id = auth.uid() or lower(email) = public.my_email());
create policy memberships_mute on public.memberships for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create policy projects_select on public.projects for select to authenticated
  using (user_id = auth.uid() or public.is_room_member(team_id));
create policy projects_insert on public.projects for insert to authenticated
  with check (user_id = auth.uid() and (team_id is null or public.is_room_member(team_id)));
create policy projects_update on public.projects for update to authenticated
  using (user_id = auth.uid() or public.is_room_member(team_id))
  with check (user_id = auth.uid() or public.is_room_member(team_id));
create policy projects_delete on public.projects for delete to authenticated
  using (user_id = auth.uid() or public.is_room_member(team_id));

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
create policy tasks_select on public.tasks for select to authenticated
  using (user_id = auth.uid() or assignee_id = auth.uid() or public.is_room_member(team_id));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (user_id = auth.uid() and (team_id is null or public.is_room_member(team_id)));
create policy tasks_update on public.tasks for update to authenticated
  using (user_id = auth.uid() or assignee_id = auth.uid() or public.is_room_member(team_id))
  with check (user_id = auth.uid() or assignee_id = auth.uid() or public.is_room_member(team_id));
create policy tasks_delete on public.tasks for delete to authenticated
  using (user_id = auth.uid() or public.is_room_member(team_id));

-- ---------------------------------------------------------------------------
-- subtasks & comments — inherit the parent task's permission
-- ---------------------------------------------------------------------------
create policy subtasks_all on public.subtasks for all to authenticated
  using (public.can_touch_task(task_id))
  with check (public.can_touch_task(task_id) and user_id = auth.uid());

create policy comments_select on public.comments for select to authenticated using (public.can_touch_task(task_id));
create policy comments_insert on public.comments for insert to authenticated with check (public.can_touch_task(task_id) and user_id = auth.uid());
create policy comments_delete on public.comments for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- notes (personal or room)
-- ---------------------------------------------------------------------------
create policy notes_select on public.notes for select to authenticated using (user_id = auth.uid() or public.is_room_member(team_id));
create policy notes_insert on public.notes for insert to authenticated with check (user_id = auth.uid() and (team_id is null or public.is_room_member(team_id)));
create policy notes_update on public.notes for update to authenticated using (user_id = auth.uid() or public.is_room_member(team_id)) with check (user_id = auth.uid() or public.is_room_member(team_id));
create policy notes_delete on public.notes for delete to authenticated using (user_id = auth.uid() or public.is_room_member(team_id));

-- ---------------------------------------------------------------------------
-- goals & habits (strictly private)
-- ---------------------------------------------------------------------------
create policy goals_all  on public.goals  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy habits_all on public.habits for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- room sub-entities: any member may read/add; author or member may delete
-- ---------------------------------------------------------------------------
create policy decisions_select on public.decisions for select to authenticated using (public.is_room_member(team_id));
create policy decisions_insert on public.decisions for insert to authenticated with check (public.is_room_member(team_id) and user_id = auth.uid());
create policy decisions_delete on public.decisions for delete to authenticated using (user_id = auth.uid() or public.is_room_member(team_id));

create policy discussions_select on public.discussions for select to authenticated using (public.is_room_member(team_id));
create policy discussions_insert on public.discussions for insert to authenticated with check (public.is_room_member(team_id) and user_id = auth.uid());
create policy discussions_delete on public.discussions for delete to authenticated using (user_id = auth.uid() or public.is_room_member(team_id));

create policy files_select on public.files for select to authenticated using (public.is_room_member(team_id));
create policy files_insert on public.files for insert to authenticated with check (public.is_room_member(team_id) and user_id = auth.uid());
create policy files_delete on public.files for delete to authenticated using (user_id = auth.uid() or public.is_room_member(team_id));

create policy messages_select on public.messages for select to authenticated using (public.is_room_member(team_id));
create policy messages_insert on public.messages for insert to authenticated with check (public.is_room_member(team_id) and user_id = auth.uid());
create policy messages_delete on public.messages for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- push_subs (own only)
-- ---------------------------------------------------------------------------
create policy push_subs_all on public.push_subs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
