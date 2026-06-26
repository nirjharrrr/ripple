# Ripple v2 — Supabase Backend

v2 replaces the v1 Google Sheets / Apps Script backend with **Supabase** (managed Postgres + Auth + Realtime + Storage). The frontend UI and feature set stay the same; only the storage, auth, and sync layer change. Everything here is designed to run comfortably on the **Supabase Free plan**.

> **Status:** the database layer (schema, RLS, RPCs, realtime, storage) is complete on the `v2` branch. The client data-layer rewrite and Edge Functions (email/push/reminders) are wired once your Supabase project exists — see [What I need from you](#what-i-need-from-you).

---

## Why Supabase for v2

| | v1 (Google Sheets) | v2 (Supabase) |
|---|---|---|
| Database | Sheet tabs | Postgres tables with real types, FKs, indexes |
| Auth | Custom Users/Sessions sheet + SHA-256 | Supabase Auth (email/password) |
| Access control | `user_id`/`team_id` checks in Apps Script | Postgres **Row Level Security** |
| Sync | Full-state poll every 20s | **Realtime** change feeds (deltas only) |
| Files | Google Drive (needs owner OAuth) | Supabase **Storage** bucket |
| Notifications | Apps Script MailApp + Netlify push | Edge Functions + `pg_cron` |
| Cost | Free | Free tier (see budgets below) |

The big win is **Realtime instead of polling** — it cuts egress ~10×, which is what keeps you under the free plan's 5 GB/month.

---

## Architecture

```
  React PWA  ──@supabase/supabase-js──►  Supabase
     │                                     ├── Auth        (accounts, sessions, JWT)
     │  realtime subscriptions  ◄──────────┤  Postgres     (tables + RLS + RPCs)
     │  (row deltas, RLS-filtered)         ├── Realtime    (change feeds)
     │                                     ├── Storage     (room-files bucket)
     │  supabase.functions.invoke ────────►├── Edge Funcs  (send-invite, notify)
     │                                     └── pg_cron     (per-minute reminders)
```

- **Reads** use RLS-filtered `select` + **realtime subscriptions** (no polling).
- **Writes** are plain `insert/update/delete` (RLS enforces access) or **RPCs** for room actions (`create_room`, `invite_member`, `accept_invite`, …).
- **Files** upload straight to Storage from the browser; a `files` row records the path.
- **Email/push** are Edge Functions; **reminders** are a `pg_cron` job that calls an Edge Function.

---

## Database layer (built — `supabase/migrations/`)

| Migration | Contents |
|---|---|
| `0001_schema.sql` | All tables: `profiles, teams, memberships, projects, tasks, subtasks, comments, notes, goals, habits, decisions, discussions, files, messages, push_subs`. Auto-creates a `profiles` row + claims email invites on signup. |
| `0002_rls.sql` | Row Level Security on every table, via `SECURITY DEFINER` helpers `is_room_member()`, `is_room_admin()`, `can_touch_task()`, `my_email()`. |
| `0003_rpc.sql` | Room/membership actions: `create_room`, `invite_member`, `accept_invite`, `decline_invite`, `set_member_role`, `remove_member`, `purge_my_data`. |
| `0004_realtime_storage.sql` | Adds tables to the `supabase_realtime` publication (+ `replica identity full`), creates the private `room-files` Storage bucket with member-scoped policies. |

**Key change from v1:** the per-room *admin password* is gone. With real auth, "admin" is just `membership.role = 'admin'` (the room creator is admin). Admin actions are enforced by RLS + RPC checks.

---

## Setup runbook

### 1. Create the project
1. Sign up at [supabase.com](https://supabase.com) → **New project** (free plan). Pick a strong DB password and a region near you.
2. From **Project Settings → API**, copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public key** → `VITE_SUPABASE_ANON_KEY` (safe to embed in the client)
   - **service_role key** → keep secret; used only by Edge Functions (set as a function secret, never in the client).

### 2. Run the migrations
Either paste each file in **SQL Editor** (in order 0001→0004 and run), or use the CLI:
```bash
npm i -g supabase            # or: npx supabase
supabase link --project-ref <your-ref>
supabase db push             # applies supabase/migrations/*
```

### 3. Configure Auth
- **Authentication → Providers → Email**: enable Email. For "effortless," turn **Confirm email = off** (or keep on if you want verification).
- **URL Configuration → Site URL**: set to your app URL (e.g. `https://ripple-b0912a.netlify.app`) so invite/redirect links work.

### 4. Frontend env
Add to `.env.local` (see `.env.example`):
```
VITE_SUPABASE_URL=<your project url>
VITE_SUPABASE_ANON_KEY=<your anon key>
```
Install the client: `npm i @supabase/supabase-js`.

### 5. Email (optional but recommended for invites)
Invites and notifications send email via an Edge Function. The free, simplest path is **[Resend](https://resend.com)** (3,000 emails/month free):
- Create a Resend API key, set it as a Supabase **function secret**: `supabase secrets set RESEND_API_KEY=...`
- If you skip this, the app still works fully — invites just rely on the **in-app pending-invite banner** + a copyable invite link instead of an email.

### 6. Web push (optional)
Reuse your existing VAPID keys. Set `VAPID_PUBLIC` / `VAPID_PRIVATE` / `VAPID_SUBJECT` as function secrets; the `notify` Edge Function signs and sends.

### 7. Keep-alive (free-tier pause prevention)
Free projects pause after 7 days of inactivity. `.github/workflows/keepalive.yml` pings your project on a schedule. Add repo secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY` (Settings → Secrets → Actions). It runs every 3 days — well inside the 7-day window.

---

## Free-tier budget & optimizations

| Free limit | How v2 stays under it |
|---|---|
| **5 GB egress / mo** | **Realtime deltas, not polling.** Reads fetch once, then receive only changed rows. Chat uses realtime, not a 3.5s poll. |
| **500 MB database** | Rows are tiny; indexes are targeted. Hundreds of thousands of rows fit. |
| **50,000 MAU** | Never the bottleneck for a small team. |
| **1 GB storage** | `room-files` bucket; large uploads are still capped client-side (8 MB) and you can paste links for bigger files. |
| **Pause after 7 days idle** | The keep-alive GitHub Action (step 7). |
| **2 active projects** | v2 uses one. |

Other optimizations baked in: narrow `select` columns, indexes on every foreign key + the reminder hot-path, `REPLICA IDENTITY FULL` only where deletes must reconcile, and RPCs to avoid N+1 round-trips for room actions.

---

## What remains (wired against your live project)

1. **Client data layer** — `src/lib/supabase.js` (client) + a Supabase implementation of the existing `api.js` surface, so `store.js` keeps working. Realtime subscriptions replace the polling `refresh()`.
2. **Auth screens** — `Auth.jsx` switches to Supabase Auth (`signInWithPassword` / `signUp`); `App.jsx` listens to `onAuthStateChange`.
3. **Files** — upload to the `room-files` bucket, store the path + a signed URL.
4. **Edge Functions** — `send-invite` (email accept link), `notify` (assignment/@mention email + push), and a `reminders` function driven by `pg_cron`.
5. **Account deletion** — `purge_my_data()` RPC + an Edge Function that deletes the `auth.users` row with the service-role key.
6. **Optional v1 → v2 data import** — a one-off script to copy your existing Sheet rows into Postgres (kept optional; v2 can also start fresh).

---

## What I need from you

To finish wiring + verify v2 end-to-end, send me (safe to share):
- **`VITE_SUPABASE_URL`** (Project URL)
- **`VITE_SUPABASE_ANON_KEY`** (anon public key)

Do **not** paste the **service_role** key in chat — set it yourself as a Supabase function secret when we deploy the Edge Functions. With the URL + anon key I'll wire the client, run the realtime + RLS flows against your project, and confirm everything works on the free tier.
