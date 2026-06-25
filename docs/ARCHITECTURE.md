# Ripple — Architecture

> Canonical documentation for v1.0.0

Ripple is a free, offline-first productivity and team-rooms PWA. The entire backend runs on a single Google Apps Script web app backed by Google Sheets — there are no servers to operate and no databases to provision. A small Netlify serverless function handles web-push delivery. This document explains how the three tiers fit together, how offline-first sync works, the data model, auth, the realtime-ish behaviors, and the notification stack.

## 1. System Overview

Ripple is a three-tier system with one auxiliary serverless function:

```
   ┌──────────────────────────────────────────────────────────────┐
   │  TIER 1 — React PWA Client (browser / installed PWA)          │
   │                                                                │
   │   Workspace.jsx ── useStore() hook (src/lib/store.js)          │
   │        │              │                                        │
   │        │              ├── optimistic write → localStorage      │
   │        │              │      cache  (ripple_cache_v1)          │
   │        │              │      queue  (ripple_queue_v1)          │
   │        │              │      session(ripple_session_v1)        │
   │        │              │                                        │
   │   data layer: src/lib/api.js                                   │
   └───────────────┬───────────────────────────────┬──────────────┘
                   │  POST text/plain (no preflight)│
                   │  JSON body { action, token,…}  │  (Web Push register)
                   ▼                                │
   ┌───────────────────────────────────────────┐   │
   │  TIER 2 — Google Apps Script Web App       │   │
   │  google-apps-script/Code.gs  (doPost/doGet)│   │
   │   • auth, session, per-user/-room scoping  │   │
   │   • upsert / delete / list dispatch        │   │
   │   • checkReminders() — per-minute trigger  │───┼──────────────┐
   └───────────────┬───────────────────────────┘   │              │
                   │ SpreadsheetApp read/append/set │              │ POST
                   ▼                                │              ▼
   ┌───────────────────────────────────────────┐   │  ┌────────────────────────────┐
   │  TIER 3 — Google Sheets (the database)     │   │  │ Netlify Function           │
   │  One tab per entity: Tasks, Subtasks,      │   │  │ netlify/functions/         │
   │  Projects, Notes, Goals, Habits, Comments, │   │  │   send-push.mjs            │
   │  Users, Sessions, Teams, Memberships,      │   │  │ • web-push + VAPID         │
   │  Decisions, Discussions, Files, Messages,  │   │  │ • gated by PUSH_SECRET     │
   │  PushSubs                                  │   │  └─────────────┬──────────────┘
   └────────────────────────────────────────────┘   │                │ encrypted push
                                                     │                ▼
                         (browser registers push) ───┘         Browser push service
                                                                → lock-screen notification
```

- **Tier 1** is the only code the user interacts with. All reads are served instantly from a localStorage cache; all writes go through an optimistic-update + queue pipeline in `src/lib/store.js` and `src/lib/api.js`.
- **Tier 2** (`google-apps-script/Code.gs`) is the entire server. `doPost`/`doGet` both funnel into `handle(e)`, which dispatches on a string `action` field. It owns auth, scoping, and the per-minute reminder engine.
- **Tier 3** is Google Sheets — one tab per entity, accessed through `SpreadsheetApp`.
- The **Netlify function** (`netlify/functions/send-push.mjs`) exists solely because Apps Script cannot perform the VAPID-signed encryption required for the Web Push protocol. The reminder trigger calls out to it.

## 2. Offline-First Design

Ripple's core principle (stated at the top of `src/lib/api.js`): *reads come from a local cache instantly; writes are queued in localStorage and flushed to the Sheet when online. Nothing is lost if you add a task on the subway.*

### localStorage keys

| Key | Defined in | Purpose |
|-----|-----------|---------|
| `ripple_cache_v1` | `src/lib/api.js` (`CACHE_KEY`) | Full snapshot of all entities; the read source of truth for the UI |
| `ripple_queue_v1` | `src/lib/api.js` (`QUEUE_KEY`) | FIFO queue of pending write bodies awaiting flush |
| `ripple_session_v1` | `src/lib/api.js` (`SESSION_KEY`) | `{ token, user }` for the signed-in account |
| `ripple_fired_v1` | `src/lib/notify.js` | Dedupe set of already-fired in-app reminders |
| `ripple_chat_read_v1` | `src/lib/chat.js` | Per-room last-read bookmarks for unread badges |
| `ripple_prefs_v1` | `src/lib/settings.js` | Local preferences (week start; theme is pinned to light) |

### Optimistic updates

The `useStore` hook (`src/lib/store.js`) owns all entity state. Every mutation follows the same pattern, e.g. `addTask`:

1. Build the new entity locally (client-generated `id` via `crypto.randomUUID`).
2. `commit(next)` — writes the new state to both `ripple_cache_v1` (`writeCache`) and React state (`setData`) in one step. **The UI updates immediately, before any network call.**
3. Call a queued writer like `saveTask(task)`, which calls `enqueue({ action: 'upsertTask', task })` in `api.js`.

`enqueue` appends the write body to `ripple_queue_v1` and calls `flush()`. Because the cache is already updated, the UI never waits on the network.

### The write queue and flush-on-online

`flush()` (in `api.js`) drains the queue strictly in order: it `await call(q[0])`, then `q.shift()` and re-persists, one item at a time. If a call throws, the loop stops and **leaves remaining items queued** for the next attempt — no data is dropped. A module-level `flushing` guard prevents concurrent drains. Flushing is triggered:

- On every `enqueue`.
- On the `window 'online'` event — registered both in `api.js` (`window.addEventListener('online', flush)`) and in `store.js`'s `refresh` effect.
- At the start of every periodic `refresh()` (so pending writes are pushed *before* pulling authoritative state).

Ordering matters for derived effects: `saveAssignmentNotice` is deliberately queued **after** the task upsert that triggered it (`api.js` comment) so the server sees the assignment before it tries to notify.

### ~20s polling sync

`useStore`'s `refresh()` runs on mount and then on a `setInterval(refresh, 20000)`. Each cycle:

1. Bails out to `status: 'offline'` if `!navigator.onLine` or the backend isn't configured.
2. `await flush()` — push pending writes.
3. `await pull()` — `pull()` issues `{ action: 'list' }`, normalizes booleans/numbers (Sheets returns strings) via `normalizeTask`/`normalizeSub`/`normalizeProject`, writes the result to cache, and returns it.
4. `commit(fresh)` replaces local state with the authoritative snapshot.

An `unauthorized` error (expired/invalid token) surfaces as `status: 'unauthorized'`; `Workspace.jsx` watches for this and bounces to the login screen via `logout().finally(onSignOut)`.

### text/plain POST (no CORS preflight)

Apps Script web apps reject CORS preflight (`OPTIONS`) requests. Ripple avoids triggering one by sending a **"simple request"**: `rawCall` in `api.js` POSTs with `Content-Type: text/plain;charset=utf-8` and puts the JSON in the body (`redirect: 'follow'` handles Apps Script's 302 to `script.googleusercontent.com`). On the server, `handle(e)` parses `e.postData.contents` as JSON. Every response is `{ ok, data | error }`; `rawCall` throws on `ok: false`.

## 3. Data Model

All entities live in a single Google Sheet, **one tab per entity**. Column orders are declared as `*_COLS` constants in `Code.gs`; new columns are appended at the end so existing sheets migrate cleanly (`ensureMigrated`/`migrateHeaders`). The client's `EMPTY` shape in `api.js` and `pull()` mirror these tabs.

| Entity | Sheet tab | Key columns (from `*_COLS`) | Scoping |
|--------|-----------|------------------------------|---------|
| Tasks | `Tasks` | id, title, notes, done, is_today, remind_at, recurrence, position, reminded, …, user_id, team_id, assignee_id, depends_on | per-user (`user_id`), optionally per-room (`team_id`) |
| Subtasks | `Subtasks` | id, task_id, title, done, position, user_id | follows parent task |
| Projects | `Projects` | id, name, color, position, user_id, team_id, members | per-user or per-room |
| Notes | `Notes` | id, title, body, position, user_id, team_id | per-user or per-room |
| Goals | `Goals` | id, title, description, user_id | per-user (owned) |
| Habits | `Habits` | id, name, log, position, user_id | per-user (owned) |
| Comments | `Comments` | id, task_id, author, body, user_id | scoped via parent task's team |
| Teams / Rooms | `Teams` | id, name, owner_id, admin_pass_hash, salt | a "room" is a team |
| Memberships | `Memberships` | id, team_id, user_id, email, name, role, … (muted) | per-room membership |
| Decisions | `Decisions` | id, team_id, title, body, author, user_id | per-room (`team_id`) |
| Discussions | `Discussions` | id, team_id, parent_id, body, author, user_id | per-room; threaded via `parent_id` |
| Files | `Files` | id, team_id, name, url, user_id | per-room |
| Messages | `Messages` | id, team_id, user_id, author, body, created_at | per-room chat |
| Push subscriptions | `PushSubs` | id, user_id, endpoint, p256dh, auth | per-user device registrations |
| Users | `Users` | id, name, email, pass_hash, salt | — |
| Sessions | `Sessions` | token, user_id, created_at | — |

**Scoping rules** (server-enforced in `Code.gs`):
- **Owned** entities (Goals, Habits) — visible only where `user_id` matches (`upsertOwned`/`deleteOwned`).
- **Shared** entities (Tasks, Projects, Notes) — visible if owned **or** their `team_id` is in the caller's `teamSet` (`upsertShared`/`listAll`). `teamSetFor(userId)` builds the set of rooms the user belongs to.
- **Room** entities (Decisions, Discussions, Files, Messages) — gated by `teamSet` membership (`upsertRoomEntity`/`deleteRoomEntity`).
- Subtasks/Comments inherit their parent task's room via `taskTeamAllows`.

## 4. Auth & Session Flow

1. **Register / login** — `register(name, email, password)` / `login(email, password)` in `api.js` call `rawCall` with `action: 'register' | 'login'` plus `appKey: APP_KEY` (the shared `VITE_RIPPLE_TOKEN` gate — *not* per-user). On the server, passwords are stored hashed + salted (`hashPassword`, `register`/`login` in `Code.gs`).
2. **Token issuance** — the server creates a session row (`createSession` → `newToken()`, stored in the `Sessions` tab) and returns `{ token, user }`, which the client persists to `ripple_session_v1` via `setSession`.
3. **Authenticated calls** — every non-auth request goes through `call(body)`, which spreads in `token: session.token`. The server's `handle` resolves it via `resolveSession(token)` → `userId` before dispatching any per-user action.
4. **Logout / delete** — `logout()` calls `{ action: 'logout' }` (deletes the session row) and clears `ripple_session_v1`, `ripple_cache_v1`, and `ripple_queue_v1` locally so one user's data never leaks to the next. `deleteAccount()` additionally removes all owned rows server-side.

`isConfigured()` (backend URL present) and `isLoggedIn()` (URL + token) gate the app shell.

## 5. Realtime-ish Behavior

Ripple has no websockets; "live" is achieved with two polling loops:

- **20s full-list poll** — `useStore`'s `refresh()` interval (`store.js`) keeps every device's cache roughly in sync across the whole dataset.
- **~3.5s chat fast-poll** — while a room's **Chat** tab is open, `RoomChat` (`src/components/RoomView.jsx`) runs `setInterval(poll, 3500)`. Each tick calls `fetchRoomMessages(room.id, since)` (`api.js`, `action: 'roomMessages'`) which returns only messages created after the `since` ISO timestamp — far cheaper than a full `list`. New messages are folded into the cache via `store.mergeMessages(incoming)`, which dedupes by id (`store.js`) so optimistic local messages are never dropped or duplicated.

**Unread tracking** (`src/lib/chat.js`, purely client-side in `ripple_chat_read_v1`):
- `markRoomRead(roomId, iso)` bookmarks the last-seen timestamp when you open a room's Chat tab.
- `unreadCount(roomId, messages, myId)` counts messages newer than that bookmark, excluding your own.

## 6. Notifications

Ripple delivers reminders through three independent layers so something fires whether the app is open, backgrounded, or fully closed:

1. **In-app (app is open)** — `src/lib/notify.js`. `startReminderWatch(getTasks)` polls every 30s, and for any task whose `remind_at` has passed (and isn't done) fires a native `Notification`. A `ripple_fired_v1` dedupe set keyed by `id@remind_at` prevents repeats while still re-firing recurring reminders. Wired up in `Workspace.jsx` via `startReminderWatch(() => tasksRef.current)`.
2. **Web Push (app closed)** — `src/lib/push.js` subscribes the device's service worker to `PushManager` using the `VITE_VAPID_PUBLIC` key and registers it server-side via `savePushSubscription` → `savePushSub` (stored in `PushSubs`). Actual delivery is performed by the Netlify function `netlify/functions/send-push.mjs`, which uses the `web-push` library with VAPID keys held only in Netlify env (`VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_SUBJECT`) and is gated by a shared `PUSH_SECRET`. It reports `gone` (404/410) endpoints so dead subscriptions can be pruned.
3. **Server reminder engine (per-minute)** — `checkReminders()` in `Code.gs` runs every minute via a time-based trigger installed by `setup()` (`ScriptApp.newTrigger('checkReminders').timeBased().everyMinutes(1)`). For each due, un-`reminded`, not-done task it sends an email via `MailApp` to the task owner and, if that user has push subscriptions, calls `sendPush(...)` → `UrlFetchApp.fetch(SEND_PUSH_URL, …)` with the shared `PUSH_SECRET`. Assignment notices follow the same path through `notifyAssignment`.

VAPID private key and `PUSH_SECRET` are never present in the client or the Sheet — they live in Apps Script Script Properties and Netlify environment variables respectively.

## 7. Key Client Modules

All under `src/lib/`:

| Module | Purpose |
|--------|---------|
| `api.js` | Data layer: session, cache (`ripple_cache_v1`), write queue (`ripple_queue_v1`), `flush`/`pull`, and every `action` wrapper. text/plain POST to the Apps Script web app. |
| `store.js` | `useStore()` React hook — owns all entity state, optimistic mutations, the 20s `refresh()` poll, and message merging. |
| `status.js` | Task status/priority constants and helpers — `taskStatus`, `belongsToToday`, `computeRemindAt`, datetime-local conversions. |
| `parse.js` | Natural-language quick-add parsing (chrono-node) — extracts due date and recurrence from free text. |
| `chains.js` | Ripple Chains — `depends_on` dependency logic (`isLocked`, `buildChains`) plus the `rippleBurst` completion animation. |
| `chat.js` | Per-room unread bookmarks in `ripple_chat_read_v1` — `markRoomRead`, `unreadCount`. |
| `markdown.js` | Dependency-free, HTML-escaped-first Markdown→HTML renderer for notes (safe subset). |
| `notify.js` | In-app native `Notification` reminder watcher (30s tick, `ripple_fired_v1` dedupe). |
| `push.js` | Web Push subscription lifecycle — `enablePush`/`disablePush`/`isPushOn`, VAPID key handling. |
| `settings.js` | Local preferences (`ripple_prefs_v1`); theme currently pinned to light. |

---

**Source references:** `src/lib/api.js`, `src/lib/store.js`, `src/lib/notify.js`, `src/lib/push.js`, `src/lib/chat.js`, `src/lib/status.js`, `src/lib/parse.js`, `src/lib/chains.js`, `src/lib/markdown.js`, `src/lib/settings.js`, `src/components/Workspace.jsx`, `src/components/RoomView.jsx`, `google-apps-script/Code.gs`, `netlify/functions/send-push.mjs`.
