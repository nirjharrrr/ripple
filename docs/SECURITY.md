# Ripple — Security & Privacy Model

> Canonical documentation for **v1.0.0**.

Ripple is a free, offline-first productivity and team-rooms PWA. It has no traditional server: the entire backend is a single Google Apps Script web app (`google-apps-script/Code.gs`) bound to a Google Sheet you own, with an optional Netlify function (`netlify/functions/send-push.mjs`) for lock-screen Web Push. This document describes how authentication, authorization, secrets, and privacy work — and is candid about the trade-offs that come with a client-only, serverless-on-Google architecture.

---

## 1. Authentication

Ripple stores accounts and sessions **inside your Google Sheet**, not in any third-party identity provider.

### Password hashing (salted SHA-256)

Accounts live in the **`Users`** tab (`USER_COLS = ['id', 'name', 'email', 'pass_hash', 'salt', 'created_at']`). Passwords are never stored in plaintext:

- On `register`, a 16-char random salt is generated (`newToken().slice(0, 16)`) and the password is hashed with `hashPassword(password, salt)` in `Code.gs`.
- `hashPassword` computes `SHA-256` over the string `salt + ':' + password` (via `Utilities.computeDigest`) and hex-encodes the result.
- Only `pass_hash` and `salt` are persisted — never the raw password.
- On `login`, the supplied password is re-hashed with the stored salt and compared against `pass_hash`. A mismatch (or unknown email) returns the deliberately ambiguous `invalid email or password`.
- Registration enforces a minimum password length of 6 characters and rejects duplicate emails.

> **Honest trade-off:** SHA-256 is a fast digest, not a slow password-hashing function (bcrypt/scrypt/Argon2). Apps Script does not expose those primitives, and salted SHA-256 is the practical ceiling here. Salting defeats rainbow tables and makes each hash unique, but a determined attacker who obtains the raw Sheet could brute-force weak passwords faster than against bcrypt. **Pick a strong, unique password**, and treat read access to the Sheet as equivalent to access to the hash store.

### Per-device session tokens

Sessions live in the **`Sessions`** tab (`SESSION_COLS = ['token', 'user_id', 'created_at']`).

- On successful `register`/`login`, `createSession(userId)` mints a token via `newToken()` (two concatenated UUIDs, dashes stripped) and **appends** a new row — one row per device/login. It deliberately does **not** upsert, because the Sessions sheet has no `id` column and an upsert would collide all rows.
- The client stores this token in `localStorage` under `ripple_session_v1` (see `getSession()` in `src/lib/api.js`) and attaches it to every authenticated request via `call()`.
- On the server, `resolveSession(token)` looks the token up and returns the owning `user_id`; every authenticated action is gated on this resolution (`if (!userId) return ... 'unauthorized'`).
- `logout` deletes just that one session row (`deleteRow(SESSION_SHEET, token, 'token')`), so signing out on one device does not log out the others.

> **Note:** session tokens currently have no server-side expiry — a row persists until `logout` or account deletion. Self-hosters who want forced re-auth can prune old `Sessions` rows by `created_at`.

### The shared app-key gate

Before any account even exists, the unauthenticated endpoints are protected by a **shared application key**.

- The client sends `appKey: VITE_RIPPLE_TOKEN` (read as `APP_KEY` in `src/lib/api.js`) on `register` and `login`.
- The server compares it against `SECRET_TOKEN` (loaded from Script Properties in `Code.gs`) and rejects mismatches with `unauthorized` before doing any work.
- The same check guards the maintenance actions `migrate` and `claimOrphans`.

This stops random internet traffic from hitting your `/exec` URL to create accounts or probe the backend. It is a **gate, not a per-user credential** — see [§4 Known Limitations](#4-known--accepted-limitations).

### Public (key-gated only) vs authenticated actions

| Tier | Gate | Actions |
|------|------|---------|
| Open | none | `ping` |
| Bootstrap | refuses once configured | `bootstrap` |
| App-key | `appKey === SECRET_TOKEN` | `register`, `login`, `migrate`, `claimOrphans` |
| Authenticated | valid session `token` | everything else (`list`, all `upsert*`/`delete*`, team actions, `deleteAccount`, …) |

---

## 2. Authorization & Data Scoping (row-level security in Sheets)

Every data row carries a **`user_id`** column; room (team) rows additionally carry a **`team_id`**. Together these implement the Sheets equivalent of **row-level security** — the server never trusts the client to say which rows it may touch. The owning `user_id` is always derived from the resolved session, never from the request body.

### The team set

On each authenticated request, `teamSetFor(userId)` computes the set of `team_id`s the user may access:

- teams they **own** (`Teams.owner_id === userId`), plus
- memberships in the **`Memberships`** tab matched by `user_id` **or** email — **but only rows whose `status` is not `pending`**.

> **Pending invitees get NO room access.** A `pending` membership is explicitly `continue`-skipped in `teamSetFor`, so an invited-but-not-yet-accepted user cannot read or write any room content until they call `acceptInvite`.

### Enforcement helpers

The action handlers route every write through one of a small set of helpers, each enforcing a specific scope:

| Helper | Scope enforced | Used by |
|--------|----------------|---------|
| `upsertOwned` / `deleteOwned` | **Strictly the owner.** Refuses if an existing row's `user_id` differs; always re-stamps `user_id` to the caller. | Goals, Habits, Comments (delete), PushSubs |
| `upsertShared` / `deleteShared` | Owner **or** assignee **or** accepted room member. **Preserves the original `user_id`** so collaborators can't hijack ownership. | Tasks, Projects, Notes |
| `upsertRoomEntity` / `deleteRoomEntity` | Caller must be in the row's room (`teamSet[team_id]`). Any member may add; owner or member may delete. | Decisions, Discussions, Files |
| `taskTeamAllows` | Returns true if caller is the task owner, the assignee, or in the task's team — gates child writes. | Subtasks (`upsertSubtask`), Comments (`upsertComment`) |

Concrete consequences, straight from the code:

- **Ownership cannot be stolen.** In `upsertShared`, if a row already has an owner, `obj.user_id` is forced back to the stored owner before writing — a collaborator editing a shared task can change its fields but not seize it.
- **Subtasks and comments inherit task permission.** `upsertSubtask` and `upsertComment` first call `taskTeamAllows(...)`; if it returns false the action returns `forbidden` and never writes.
- **Room writes are membership-gated.** `upsertRoomEntity`, `postMessage`, `roomMessages`, and `uploadFile` all reject with `forbidden` unless `teamSet[team_id]` is truthy for the caller.
- **Reads are scoped too.** `listAll(userId)` returns only rows the caller owns, is assigned, or shares via an accepted room — and strips secrets (`admin_pass_hash`, `salt`, `invite_token`) from teams and memberships before sending.
- **Admin actions require the room admin password.** `addMember`, `removeMember`, `setRole` all pass through `teamAdminOK`, which checks both membership and `hashPassword(adminPass, team.salt) === team.admin_pass_hash`.

### Assignment notifications are double-checked

`notifyAssignment` verifies that the **caller** can touch the task **and** that the **assignee** is an accepted member of the task's room (`teamSetFor(assigneeId)[task.team_id]`) before emailing/pushing — so you can't use it to spam non-members.

---

## 3. Secrets Management

Ripple is designed so the **repository is safe to publish publicly**. No secret value lives in source.

### What lives where

| Secret | Stored in | Referenced as | Never in |
|--------|-----------|---------------|----------|
| `SECRET_TOKEN` (shared app key) | Apps Script **Script Properties** | `Code.gs` line 24 | source / git |
| `PUSH_SECRET` (push gate) | Apps Script **Script Properties** | `Code.gs` line 25 | source / git |
| `VITE_RIPPLE_TOKEN` (= app key, client copy) | `.env.local` | `src/lib/api.js` | git (`*.local` ignored) |
| `VITE_RIPPLE_API_URL` (`/exec` URL) | `.env.local` | `src/lib/api.js` | git |
| `PUSH_SECRET`, `VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_SUBJECT` | Netlify environment | `send-push.mjs` | git / client / Sheet |
| clasp credentials & deployment IDs | `.clasp.json`, `.clasprc.json` | — | git |

`Code.gs` reads its secrets from `PropertiesService.getScriptProperties()` at load time — they are **never hard-coded**. The file's header comment makes the contract explicit: *"Secrets are stored in Script Properties … never in this file — so this code is safe to publish."*

### One-time bootstrap

Rather than typing secrets into the editor, you can set them once over HTTP via the **`bootstrap`** action, which writes `SECRET_TOKEN` and `PUSH_SECRET` into Script Properties — and then **refuses to run again** once `SECRET_TOKEN` exists (`return ... 'already configured'`). This prevents a later caller from overwriting your keys.

### Gitignore posture

`.gitignore` excludes everything secret-bearing: `*.local` (covers `.env.local`), `google-apps-script/.clasp.json`, and `.clasprc.json`. The Netlify VAPID keypair and `PUSH_SECRET` live only in Netlify's environment settings.

### The push function is gated

`send-push.mjs` rejects any request whose `body.secret !== process.env.PUSH_SECRET` with `401` before touching VAPID. The Apps Script side sends that same `PUSH_SECRET` in `sendPush(...)`. The VAPID **private** key never leaves the Netlify environment — Apps Script can't do the ECDSA signing itself, which is precisely why this function exists.

---

## 4. Known & Accepted Limitations

This section is deliberately candid. A free, client-only PWA backed by a personal Google account makes real trade-offs.

1. **The app key is embedded in the client bundle.** `VITE_RIPPLE_TOKEN` is compiled into the shipped JavaScript — anyone who downloads the app can extract it. It is **not a per-user secret**; it only gates the API against drive-by traffic and casual abuse. Real security comes from per-user passwords and session tokens, not from the app key. This is unavoidable for a backend-less client app.

2. **The backend runs as the owner's Google account.** The Apps Script web app is deployed *"Execute as: Me."* Every email, every Drive upload (`uploadFile` → *"Ripple Uploads"* folder), and every Sheet write happens **as you, the owner**. Members never get Google credentials, but you are the single trust root.

3. **Email & quota limits.** Reminders, invites, and mention notifications go through `MailApp`/Gmail, which on a consumer account is capped at roughly **100 emails/day**. All send paths are wrapped in try/catch and fail silently (`/* quota */`), so hitting the cap drops notifications rather than erroring — reminders are best-effort, not guaranteed delivery.

4. **No end-to-end encryption.** Data is stored in plaintext in your Google Sheet and Drive. Ripple relies on Google account security and Sheet sharing permissions for confidentiality. Anyone you grant Sheet access to can read **everyone's** rows directly, bypassing the row-level scoping that only applies through the API.

5. **Data lives in the owner's Google Sheet (and Drive).** There is no separate database. The owner — and anyone they share the spreadsheet with — has raw access to all tabs, including `Users` (hashes + salts) and `Sessions` (live tokens). Guard Sheet sharing accordingly.

6. **Reminder timing & token longevity.** The reminder engine (`checkReminders`) runs on a 1-minute time trigger; delivery is minute-granular, not instant. Session tokens do not expire server-side (see §1).

7. **File uploads are world-readable by link.** `uploadFile` sets `DriveApp.Access.ANYONE_WITH_LINK` / `VIEW`. Anyone with the returned URL can open the file — treat room file links as unlisted, not private.

---

## 5. Account Deletion & Privacy

Ripple ships **self-service, irreversible account deletion**.

- **UI:** Settings → **Delete account**, which calls `deleteAccount()` in `src/lib/api.js`.
- **Server:** the `deleteAccount` action runs strictly self-scoped on the **resolved session `userId`** — it can only ever delete *your own* account, never another user's.

What `deleteAccount(userId)` purges (from `Code.gs`):

- **All rows you own** across Tasks, Subtasks, Projects, Notes, Goals, Habits, Comments, Decisions, Discussions, Files, Messages, PushSubs, Memberships, and Sessions (matched on `user_id`).
- **All rooms you own** (`Teams` rows where `owner_id === userId`).
- **Your account row** in `Users`.

The client then clears the local session and wipes the `ripple_cache_v1` and `ripple_queue_v1` localStorage keys, so no residual data is left on the device. `logout()` performs the same local cache/queue wipe (minus the server purge) so one user's data is never left behind for the next person on a shared device.

> **Caveat (honest):** deletion is scoped to rows where `user_id` matches you. Content you contributed to **rooms owned by someone else** (e.g. chat messages, decisions) is matched by your `user_id` and removed; but rooms you own are deleted wholesale, which also removes other members' contributions to *those* rooms. There is no "transfer ownership" flow in v1.0.0.

---

## 6. Recommendations for Self-Hosters

If you deploy your own Ripple backend, harden it as follows:

1. **Use a long, random `SECRET_TOKEN`.** Treat it like a password (32+ random chars). Set it once via `bootstrap` or Script Properties — never commit it. Keep `VITE_RIPPLE_TOKEN` in `.env.local` only.
2. **Restrict who has the `/exec` URL.** The deployment URL plus the app key is the entire perimeter for unauthenticated endpoints. Don't post it publicly; share it only with people you want creating accounts.
3. **Rotate tokens periodically.** To rotate the app key: update `SECRET_TOKEN` in Script Properties **and** `VITE_RIPPLE_TOKEN` in `.env.local`, then redeploy the client (they must match). To rotate push: change `PUSH_SECRET` in **both** Script Properties and Netlify env together. Rotate VAPID keys only if you accept that existing push subscriptions will need to re-subscribe.
4. **Lock down the Google Sheet.** Because the Sheet holds password hashes, salts, and live session tokens, **do not share it** beyond accounts that genuinely need raw access. Anyone with the Sheet bypasses all API-level scoping.
5. **Prune stale sessions.** Periodically delete old `Sessions` rows (by `created_at`) to limit the blast radius of a leaked token, since tokens don't auto-expire.
6. **Mind the email quota.** On a consumer Gmail account, expect ~100 notification emails/day. For heavier use, deploy under Google Workspace (higher limits) or accept that reminders/invites are best-effort.
7. **Keep secrets out of `Code.gs`.** When editing the script, never paste real values for `SECRET_TOKEN`/`PUSH_SECRET` into the file — leave them in Script Properties so the repo stays publishable.
8. **Re-authorize scopes deliberately.** File uploads require the Drive scope (`authorizeDrive()` run once from the editor). Grant it only if you intend to enable room file uploads, since it gives the script broad Drive access under your account.

---

*End of SECURITY.md — Ripple v1.0.0.*
