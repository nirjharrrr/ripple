-- Ripple v2 — RPC functions for room & membership "actions"
-- These mirror v1's createTeam / addMember / acceptInvite / etc. They run as
-- SECURITY DEFINER and do their own authorization, so the client calls them via
-- supabase.rpc(...) instead of writing membership rows directly.

-- Create a room and add the caller as its admin (atomic).
create or replace function public.create_room(p_name text)
returns public.teams language plpgsql security definer set search_path = public as $$
declare t public.teams; p public.profiles;
begin
  if coalesce(trim(p_name),'') = '' then raise exception 'room name required'; end if;
  select * into p from public.profiles where id = auth.uid();
  insert into public.teams (name, owner_id) values (trim(p_name), auth.uid()) returning * into t;
  insert into public.memberships (team_id, user_id, email, name, role, status)
  values (t.id, auth.uid(), coalesce(p.email,''), coalesce(p.name,''), 'admin', 'accepted');
  return t;
end; $$;

-- Invite a member by email. Admin-only. Creates a PENDING membership + token.
-- Returns the row (incl. invite_token) so the caller can send the email via the
-- send-invite Edge Function. Re-invites return the existing token.
create or replace function public.invite_member(p_team uuid, p_email text, p_name text default '')
returns public.memberships language plpgsql security definer set search_path = public as $$
declare m public.memberships; existing public.memberships; bound uuid;
begin
  if not public.is_room_admin(p_team) then raise exception 'not a room admin'; end if;
  if coalesce(trim(p_email),'') = '' then raise exception 'email required'; end if;

  select * into existing from public.memberships
   where team_id = p_team and lower(email) = lower(trim(p_email)) limit 1;
  if found then
    if existing.status = 'accepted' then raise exception 'already a member'; end if;
    return existing; -- still pending → reuse token, caller re-sends the email
  end if;

  select id into bound from public.profiles where lower(email) = lower(trim(p_email)) limit 1;
  insert into public.memberships (team_id, user_id, email, name, role, status, invite_token, invited_by, invited_at)
  values (p_team, bound, lower(trim(p_email)), coalesce(p_name,''), 'member', 'pending', gen_random_uuid(), auth.uid(), now())
  returning * into m;
  return m;
end; $$;

-- Accept an invite by its token: bind the membership to the caller.
create or replace function public.accept_invite(p_token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare m public.memberships; nm text;
begin
  select * into m from public.memberships where invite_token = p_token limit 1;
  if not found then raise exception 'invite not found or already used'; end if;
  select name into nm from public.profiles where id = auth.uid();
  update public.memberships
     set user_id = auth.uid(), status = 'accepted', name = coalesce(nm, name), invite_token = null
   where id = m.id;
  return m.team_id;
end; $$;

-- Decline an invite (delete the pending row).
create or replace function public.decline_invite(p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.memberships where invite_token = p_token and status = 'pending';
end; $$;

-- Change a member's role. Admin-only.
create or replace function public.set_member_role(p_membership uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare tid uuid;
begin
  if p_role not in ('member','admin') then raise exception 'invalid role'; end if;
  select team_id into tid from public.memberships where id = p_membership;
  if tid is null or not public.is_room_admin(tid) then raise exception 'not a room admin'; end if;
  update public.memberships set role = p_role where id = p_membership;
end; $$;

-- Remove a member. Admin-only (and cannot remove the owner).
create or replace function public.remove_member(p_membership uuid)
returns void language plpgsql security definer set search_path = public as $$
declare tid uuid; uid uuid; ownr uuid;
begin
  select team_id, user_id into tid, uid from public.memberships where id = p_membership;
  if tid is null or not public.is_room_admin(tid) then raise exception 'not a room admin'; end if;
  select owner_id into ownr from public.teams where id = tid;
  if uid is not null and uid = ownr then raise exception 'cannot remove the room owner'; end if;
  delete from public.memberships where id = p_membership;
end; $$;

-- Delete the caller's own account data + owned rooms (Settings → Delete account).
-- (auth.users deletion itself is done client-side via an Edge Function with the
-- service-role key; this cleans up owned rooms the cascade would otherwise keep
-- if other members exist.)
create or replace function public.purge_my_data()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.teams where owner_id = auth.uid();   -- cascades rooms' rows
  -- personal rows cascade from profiles on auth user delete; nothing else needed here
end; $$;

grant execute on function public.create_room(text)                  to authenticated;
grant execute on function public.invite_member(uuid, text, text)    to authenticated;
grant execute on function public.accept_invite(uuid)                to authenticated;
grant execute on function public.decline_invite(uuid)               to authenticated;
grant execute on function public.set_member_role(uuid, text)        to authenticated;
grant execute on function public.remove_member(uuid)                to authenticated;
grant execute on function public.purge_my_data()                    to authenticated;
