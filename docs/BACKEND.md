# Ripple — Backend Reference

The Ripple backend is a single Google Apps Script web app (`google-apps-script/Code.gs`) backed by a Google Sheet. It is the entire server: an HTTP JSON API, a per-user authentication store, a team/room collaboration layer, an email + web-push notification engine, and a per-minute reminder scheduler — all with zero hosting cost and no external database.

---

## 1. Overview

- **One file, one Sheet.** `Code.gs` is deployed from the Sheet's bound Apps Script project (`Extensions → Apps Script`). The active spreadsheet (`SpreadsheetApp.getActiveSpreadsheet()`) is the database; every tab is a table.
- **HTTP entry points.** `doGet(e)` and `doPost(e)` both forward to a single `handle(e)` dispatcher. The request body is parsed from `e.postData.contents` (JSON POST) or from `e.parameter.payload` (a JSON string passed as a query/form param — used to dodge CORS preflight). Every response is JSON via `json(obj)` → `ContentService` with MIME type `application/json`, shaped `{ ok: true, data: ... }` or `{ ok: false, error: ... }`.
- **Deployment posture** (`appsscript.json`): `executeAs: USER_DEPLOYING` (runs as the owner — so it can read the Sheet, send mail as the owner, and write to the owner's Drive) and `access: ANYONE_ANONYMOUS` (no Google sign-in required to call it). Runtime is V8, timezone `Asia/Kolkata`, exception logging to Stackdriver.
- **Two-layer gate.** Because access is anonymous, every request is gated:
  1. **Shared app key** — public actions require `body.appKey === SECRET_TOKEN` (the frontend's `VITE_RIPPLE_TOKEN`).
  2. **Per-device session token** — all other actions require a valid `body.token`, resolved to a `user_id` via `resolveSession`.
- **Secrets live in Script Properties**, never in the file: `SECRET_TOKEN` (shared app key) and `PUSH_SECRET` (must match the Netlify push function). The file is therefore safe to publish.
- **First-request migration.** `handle()` calls `ensureMigrated()` on every request; it runs the schema migration exactly once (guarded by a Script Property) and then short-circuits.

---

## 2. Sheets Schema

Every tab is created on demand by `sheet(name, cols)` with a frozen header row. New columns are always appended to the right, so existing Sheets migrate non-destructively. Columns come directly from the `*_COLS` arrays in `Code.gs`.

Two scoping columns recur throughout:
- **`user_id`** — the owning account (ownership scope). Preserved on update so collaborators can never hijack ownership.
- **`team_id`** — the room a row belongs to (collaboration scope). A row with a `team_id` is visible to accepted members of that room.

### Tasks (`Tasks`)
| Column | Notes |
|---|---|
| `id` | UUID, primary key |
| `title` | |
| `notes` | |
| `done` | boolean-ish (`true`/`'true'`) |
| `is_today` | "today" flag |
| `remind_at` | ISO time the reminder fires |
| `recurrence` | `daily` / `weekly` / `weekdays` / `weekly:*` / blank |
| `position` | sort order |
| `reminded` | set true once the reminder has fired (non-recurring) |
| `created_at` / `updated_at` | ISO timestamps |
| `due_at` | deadline (kept in step with `remind_at` for recurring tasks) |
| `remind_offset` | lead time between reminder and due |
| `priority` | |
| `archived` | |
| `user_id` | owner |
| `project_id` | |
| `tags` | |
| `status` | |
| `effort` / `estimate` | |
| `goal_id` | |
| `links` | |
| `assignee_id` | collaborator the task is assigned to (grants access + assignment notify) |
| `team_id` | room scope |
| `depends_on` | task dependency |

### Subtasks (`Subtasks`)
| Column | Notes |
|---|---|
| `id` | UUID |
| `task_id` | parent task (inherits its permissions) |
| `title` | |
| `done` | |
| `position` | |
| `created_at` | |
| `user_id` | owner |

### Users (`Users`)
| Column | Notes |
|---|---|
| `id` | UUID |
| `name` | |
| `email` | unique login (matched case-insensitively) |
| `pass_hash` | salted SHA-256 hex |
| `salt` | per-user random salt |
| `created_at` | |

### Sessions (`Sessions`)
| Column | Notes |
|---|---|
| `token` | per-device session token (primary key — **no `id` column**) |
| `user_id` | the authenticated account |
| `created_at` | |

### Projects (`Projects`)
| Column | Notes |
|---|---|
| `id` | UUID |
| `name` / `color` / `position` / `created_at` | |
| `user_id` | owner |
| `team_id` | room scope (shared project) |
| `members` | |

### Notes (`Notes`)
| Column | Notes |
|---|---|
| `id` / `title` / `body` / `position` / `created_at` / `updated_at` | |
| `user_id` | owner |
| `team_id` | room scope (shared note) |

### Goals (`Goals`)
| Column | Notes |
|---|---|
| `id` / `title` / `description` / `created_at` | |
| `user_id` | owner (strictly private — no team scope) |

### Habits (`Habits`)
| Column | Notes |
|---|---|
| `id` / `name` / `log` / `position` / `created_at` | |
| `user_id` | owner (strictly private) |

### Comments (`Comments`)
| Column | Notes |
|---|---|
| `id` / `task_id` / `author` / `body` / `created_at` | |
| `user_id` | owner; permission inherited from the parent task |

### PushSubs (`PushSubs`)
| Column | Notes |
|---|---|
| `id` | the push endpoint URL (dedupe key) |
| `user_id` | subscriber |
| `endpoint` / `p256dh` / `auth` | Web Push subscription fields |
| `created_at` | |

### Teams (`Teams`)
| Column | Notes |
|---|---|
| `id` | UUID room id |
| `name` | |
| `owner_id` | creator (implicit admin) |
| `admin_pass_hash` | salted SHA-256 of the room admin password |
| `salt` | |
| `created_at` | |

### Memberships (`Memberships`)
| Column | Notes |
|---|---|
| `id` | UUID membership id |
| `team_id` | room |
| `user_id` | bound account (blank until an email-only invite is claimed) |
| `email` | invitee email (used to match before binding) |
| `name` | display name |
| `role` | `admin` / `member` |
| `created_at` | |
| `status` | `accepted` (full member) or `pending` (invited, not yet joined). Blank = legacy → treated as accepted |
| `invite_token` | secret gating the email accept link (stripped from API output) |
| `invited_by` | inviter `user_id` |
| `invited_at` | ISO timestamp |
| `muted` | `'true'` mutes this room's chat notifications for this member |

### Decisions (`Decisions`) — room sub-entity
| Column | Notes |
|---|---|
| `id` / `team_id` / `title` / `body` / `author` / `created_at` / `user_id` | |

### Discussions (`Discussions`) — room sub-entity
| Column | Notes |
|---|---|
| `id` / `team_id` / `parent_id` / `body` / `author` / `created_at` / `user_id` | `parent_id` threads replies |

### Files (`Files`) — room sub-entity
| Column | Notes |
|---|---|
| `id` / `team_id` / `name` / `url` / `created_at` / `user_id` | `url` is a Drive share link |

### Messages (`Messages`) — room chat
| Column | Notes |
|---|---|
| `id` / `team_id` / `user_id` / `author` / `body` / `created_at` | |

---

## 3. Actions API

All actions are dispatched by `action` in `handle()`. **Auth** column: `app-key` = requires `appKey === SECRET_TOKEN`; `session` = requires a valid `token`; `public` = ungated (only `ping`/`bootstrap`). Session actions also pre-compute `teamSet = teamSetFor(userId)`.

| Action | Auth | Inputs | Effect / Returns |
|---|---|---|---|
| `ping` | public | — | `{ data: 'pong' }` health check |
| `bootstrap` | public | `SECRET_TOKEN`, `PUSH_SECRET` | One-time: writes the secret Script Properties. Refuses if `SECRET_TOKEN` already set |
| `migrate` | app-key | `appKey` | Runs `migrate()` (ensure sheets + columns); returns status string |
| `claimOrphans` | app-key | `appKey`, `email` | `assignAllTo(email)` — assigns un-owned Tasks/Subtasks to that account |
| `register` | app-key | `appKey`, `name`, `email`, `password` | Creates a user (validates email + 6+ char password, dedupes email), links pending invites, opens a session → `{ token, user }` |
| `login` | app-key | `appKey`, `email`, `password` | Verifies hash, links invites, opens a session → `{ token, user }` |
| `me` | session | `token` | `currentUser(userId)` → public profile |
| `logout` | session | `token` | Deletes the session row |
| `deleteAccount` | session | `token` | Self-scoped purge of all owned rows + owned teams + the user row |
| `list` | session | `token` | `listAll(userId)` — full filtered snapshot (see §5) |
| `upsertTask` | session | `task` | `upsertShared` on Tasks (owner/assignee/room) |
| `deleteTask` | session | `id` | Deletes the task (if owner/room) plus all its subtasks |
| `upsertSubtask` | session | `subtask` | Allowed only if `taskTeamAllows(subtask.task_id)`; stamps owner |
| `deleteSubtask` | session | `id` | Owner or parent-task-permitted delete |
| `upsertProject` | session | `project` | `upsertShared` on Projects |
| `deleteProject` | session | `id` | `deleteShared` on Projects |
| `createTeam` | session | `name`, `adminPass` (4+) | Creates a room + an `accepted` admin membership for the caller |
| `verifyAdmin` | session | `team_id`, `adminPass` | `{ valid: boolean }` — checks the room admin password |
| `addMember` | session | `team_id`, `adminPass`, `email`, `name?` | Admin-gated. Creates a `pending` membership + emails an accept link (re-sends if already pending) |
| `removeMember` | session | `team_id`, `adminPass`, `membership_id` | Admin-gated; deletes the membership row |
| `setRole` | session | `team_id`, `adminPass`, `membership_id`, `role` | Admin-gated; updates `role` |
| `setMute` | session | `team_id`, `muted` | Mutes/unmutes the caller's own membership for that room |
| `acceptInvite` | session | `invite_token` | Binds the membership to the caller and sets `status='accepted'` |
| `declineInvite` | session | `invite_token` | Deletes the matching `pending` membership |
| `notifyAssignment` | session | `task_id`, `assignee_id` | Validates caller+assignee belong to the task's room, then emails/pushes the assignee |
| `uploadFile` | session | `file` (`team_id`, `name`, `mimeType`, `dataBase64`) | Room-gated; writes to Drive, returns `{ name, url }` |
| `upsertMessage` | session | `message` (`team_id`, `body`, ...) | Room-gated post; fires `@mention` notifications |
| `deleteMessage` | session | `id` | `deleteRoomEntity` on Messages |
| `roomMessages` | session | `team_id`, `since` | Fast-poll: room messages created after `since` |
| `upsertDecision` | session | `decision` | `upsertRoomEntity` on Decisions |
| `deleteDecision` | session | `id` | `deleteRoomEntity` on Decisions |
| `upsertDiscussion` | session | `discussion` | `upsertRoomEntity` on Discussions |
| `deleteDiscussion` | session | `id` | `deleteRoomEntity` on Discussions |
| `upsertFile` | session | `file` | `upsertRoomEntity` on Files (metadata row) |
| `deleteFile` | session | `id` | `deleteRoomEntity` on Files |
| `upsertNote` | session | `note` | `upsertShared` on Notes |
| `deleteNote` | session | `id` | `deleteShared` on Notes |
| `upsertGoal` | session | `goal` | `upsertOwned` (private) |
| `deleteGoal` | session | `id` | `deleteOwned` (private) |
| `upsertHabit` | session | `habit` | `upsertOwned` (private) |
| `deleteHabit` | session | `id` | `deleteOwned` (private) |
| `upsertComment` | session | `comment` | Allowed only if `taskTeamAllows(comment.task_id)`; stamps owner |
| `deleteComment` | session | `id` | `deleteOwned` on Comments |
| `savePushSub` | session | `sub` (Web Push subscription) | Upserts a PushSub row keyed by endpoint |

Unknown actions return `{ ok: false, error: 'unknown action: ...' }`. Any thrown error is caught and returned as `{ ok: false, error: <string> }`.

---

## 4. Auth & Sessions

- **`hashPassword(password, salt)`** — `SHA-256` of `salt + ':' + password`, lower-case hex. Each user has a 16-char random `salt` (`newToken().slice(0,16)`).
- **`register(body)`** — validates email + password (≥6 chars), rejects duplicate emails (`findUserByEmail`, case-insensitive), stores `{ id, name, email, pass_hash, salt, created_at }`, calls `linkMemberships` to claim any email-only invites, then opens a session.
- **`login(body)`** — recomputes the hash from the stored salt and compares; same `linkMemberships` + session step on success.
- **`createSession(userId)`** — generates a `newToken()` (two concatenated UUIDs, dashes stripped) and **`appendRow`s** a `[token, userId, created_at]` row.
  > **Why append, not upsert (historical bug):** the Sessions sheet has **no `id` column**. `upsertRow` keys on `id`; every session would resolve `obj.id === undefined`, collide on the same "row," and overwrite other devices'/users' sessions. `createSession` therefore appends one row per login so each device keeps its own token.
- **`resolveSession(token)`** — linear scan of Sessions; returns the matching `user_id` or `null`. A `null` result on a session-gated action yields `unauthorized`.
- **`logout(token)`** — `deleteRow(SESSION_SHEET, token, 'token')` removes just that device's session.
- **`deleteAccount(userId)`** — strictly self-scoped (uses the resolved session `userId`): deletes every row with the caller's `user_id` across all owned sheets, deletes teams where `owner_id === userId`, then deletes the user row.

---

## 5. Access Control

Three permission models, selected per entity type:

**Ownership scope set — `teamSetFor(userId)`**
Builds the set of room ids the user may access: every team they `own` (by `owner_id`), plus every membership matched by `user_id` **or** by email (case-insensitive). **Pending invites are skipped** (`status === 'pending'` → `continue`), so an invite grants no data access until accepted.

**`upsertShared` / `deleteShared`** (Tasks, Projects, Notes)
On update, an existing row is editable if it has **no owner**, the caller **is the owner**, the caller belongs to the row's `team_id`, or the caller is the row's `assignee_id`. The original `user_id` is preserved on update (no ownership hijacking). New rows are stamped with the caller as owner. Delete follows the same owner/team rule.

**`upsertOwned` / `deleteOwned`** (Goals, Habits, Comments, PushSubs)
Strictly private: refuses to touch a row whose `user_id` belongs to someone else, and always stamps the caller as owner. Delete only removes rows the caller owns.

**`upsertRoomEntity` / `deleteRoomEntity`** (Decisions, Discussions, Files, Messages)
Requires `obj.team_id` to be in the caller's `teamSet`. Any room member may add; delete succeeds if the caller is the row owner **or** still belongs to the row's team.

**`taskTeamAllows(taskId, userId, teamSet)`**
Gate for subtasks and comments: the parent task is touchable if the caller is its `user_id`, its `assignee_id`, or a member of its `team_id`. Returns `true` for an unknown task id (treated as a brand-new task).

**`listAll(userId)`** applies these rules on read: tasks where the user is owner/assignee/room-member; subtasks & comments whose `task_id` is in that visible set (or owned); projects/notes owned or in-room; goals/habits owned only. It also returns the user's `teams` (secrets stripped), room `memberships` (with `invite_token` removed), and `invites` (pending memberships addressed to the user by bound id or email). All rows pass through `stripRow` to drop the internal `_row` index.

---

## 6. Invites & Memberships

- **`addMember`** (admin-gated via `teamAdminOK`) — if the email is already an `accepted` member, no-op; if already `pending`, re-sends the existing invite. Otherwise creates a `pending` membership with a fresh `invite_token` (binding `user_id` immediately if a matching account already exists) and emails an accept link.
- **`sendInviteEmail(email, team, token, inviterId)`** — `MailApp` HTML + plaintext email containing `APP_URL + '/?invite=' + token`. Returns whether the send succeeded (caller surfaces a graceful message if email quota/permissions block it — the invite still works in-app).
- **`acceptInvite(token, userId)`** — finds the membership by `invite_token`, sets its `user_id` to the caller, flips `status` to `accepted`, and copies the user's name in. Returns the `team_id`.
- **`declineInvite(token, userId)`** — deletes the matching `pending` membership.
- **`linkMemberships(userId, email)`** — run on every register/login: binds any membership rows that were created by email (blank `user_id`) but match the now-known email.
- **`backfillMemberStatus()`** — migration: any membership with a blank `status` predates the invite flow and is set to `accepted` so legacy members keep access.

---

## 7. Backend Notifications

**Email (MailApp), runs as the deploying owner:**
- **Reminders** — `checkReminders()` emails the task owner (mapped `user_id → email`, falling back to `REMINDER_EMAIL` or the owner's account email).
- **Invites** — `sendInviteEmail` (see §6).
- **Assignment** — `notifyAssignment(taskId, assigneeId, ...)`: validates the caller may touch the task and that the assignee is an **accepted** member of the task's room, then calls `notifyUser` (skips self-assignment).
- **@mentions** — when a message is posted, `parseMentions(body, teamId)` matches `@token` against accepted room members' name (whitespace-stripped) or email local-part, and `notifyUser`s each (skipping the sender and anyone who `muted` the room).
- **`notifyUser(userId, title, body)`** — best-effort email **and** web push; never throws.

**Web push (via Netlify):** Apps Script can't do VAPID/ECDSA signing, so `sendPush(subs, title, body)` POSTs to `SEND_PUSH_URL` (the Netlify `send-push` function) with `PUSH_SECRET` and the subscription list; the function signs and delivers them. Failures are swallowed.

**Reminder scheduler:** `setup()` creates a **time-based trigger** firing `checkReminders` **every minute**. For each non-done, non-`reminded` task whose `remind_at` is now or past, it emails + pushes the owner. If the task has a `recurrence`, `nextOccurrence(when, recurrence)` advances `remind_at` (and `due_at`) and clears `reminded`; otherwise it sets `reminded = true`. `nextOccurrence` supports `daily` (+1d), `weekly`/`weekly:*` (+7d), `weekdays` (skip Sat/Sun), default (+1d).

---

## 8. File Uploads

`uploadFile(f, userId, teamSet)` is room-gated (`f.team_id` must be in `teamSet`). It base64-decodes `f.dataBase64`, builds a blob with `f.mimeType`/`f.name`, and writes it via `DriveApp` into a **"Ripple Uploads"** folder (`getUploadsFolder()` finds-or-creates it). The file is shared `ANYONE_WITH_LINK` / `VIEW`, and the function returns `{ name, url }`. Because the web app executes as the owner, uploads land in the **owner's** Drive. This requires the Drive scope — run **`authorizeDrive()`** once from the editor (it touches `DriveApp` to trigger Google's consent prompt) before deploying a version with uploads.

---

## 9. Schema Migration & Setup

- **`ensureMigrated()`** — called on every request. Guarded by the Script Property key **`schema_v11`**: if set to `'1'` it returns immediately; otherwise it runs `migrate()`, then `backfillMemberStatus()`, then sets the property. Bumping this key (e.g. on a future schema change) forces a one-time re-migration.
- **`migrate()`** — idempotent: `sheet(...)` ensures every tab exists, and `migrateHeaders(...)` appends any columns present in a `*_COLS` array but missing from the header row (existing rows get blank cells). Exposed over HTTP via the `migrate` action.
- **`setup()`** — run once from the editor: runs `migrate()`, deletes any existing `checkReminders` triggers, and creates a fresh per-minute time trigger.
- **`assignAllTo(email)`** — one-time helper (exposed as `claimOrphans`) to assign un-owned Tasks/Subtasks to an account.

---

## 10. Secrets

`SECRET_TOKEN` (shared app key, must equal the frontend `VITE_RIPPLE_TOKEN`) and `PUSH_SECRET` (must equal the Netlify push function's secret) live in **Script Properties** (`Project Settings → Script Properties`), never in `Code.gs`. They can be set in the editor or, once, via the public **`bootstrap`** action — which writes the properties only if `SECRET_TOKEN` is not already configured, then permanently refuses. Keeping secrets out of the file is what makes the script safe to publish. `REMINDER_EMAIL`, `SEND_PUSH_URL`, and `APP_URL` are non-secret configuration constants in the file.
