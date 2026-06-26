-- Ripple v2 — Realtime + Storage
-- Realtime is the key free-tier optimization: instead of v1's full-state polling
-- every 20s, clients subscribe to row-level change feeds and receive only deltas.
-- This keeps egress an order of magnitude below the polling model.

-- ---------------------------------------------------------------------------
-- Realtime: publish change feeds for the collaborative + synced tables.
-- (RLS still applies to realtime — users only receive rows they may see.)
-- ---------------------------------------------------------------------------
do $$
declare tbl text;
begin
  foreach tbl in array array[
    'tasks','subtasks','projects','notes','comments',
    'decisions','discussions','files','messages','memberships','teams','goals','habits'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    exception when duplicate_object then null;  -- already in the publication
    end;
  end loop;
end $$;

-- REPLICA IDENTITY FULL so DELETE/UPDATE events carry the full old row (lets the
-- client reconcile removed rows by id).
alter table public.tasks       replica identity full;
alter table public.subtasks    replica identity full;
alter table public.projects    replica identity full;
alter table public.notes       replica identity full;
alter table public.comments    replica identity full;
alter table public.decisions   replica identity full;
alter table public.discussions replica identity full;
alter table public.files       replica identity full;
alter table public.messages    replica identity full;
alter table public.memberships replica identity full;
alter table public.teams       replica identity full;
alter table public.goals       replica identity full;
alter table public.habits      replica identity full;

-- ---------------------------------------------------------------------------
-- Storage: a private bucket for room file uploads (replaces v1's Drive uploads).
-- Files are stored at  <team_id>/<uuid>-<filename>  so the first path segment is
-- the room id, which the policies check for membership.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('room-files', 'room-files', false)
on conflict (id) do nothing;

create policy "room files: members read" on storage.objects for select to authenticated
  using (bucket_id = 'room-files' and public.is_room_member(((storage.foldername(name))[1])::uuid));
create policy "room files: members upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'room-files' and public.is_room_member(((storage.foldername(name))[1])::uuid));
create policy "room files: members delete" on storage.objects for delete to authenticated
  using (bucket_id = 'room-files' and public.is_room_member(((storage.foldername(name))[1])::uuid));
