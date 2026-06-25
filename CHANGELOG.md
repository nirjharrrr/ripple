# Changelog

All notable changes to **Ripple** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Given a version `MAJOR.MINOR.PATCH`:

- **MAJOR** — incompatible API or backend changes (e.g. the v2 backend migration).
- **MINOR** — functionality added in a backward-compatible manner.
- **PATCH** — backward-compatible bug fixes.

---

## [Unreleased]

### In progress — v2 backend migration

- Migrating the backend from Google Apps Script + Google Sheets to **Supabase**:
  - **Postgres** as the relational store (replacing per-tab Sheets and the column-array schema in `Code.gs`).
  - **Supabase Auth** for accounts and sessions (replacing the Sheets-backed `Users`/`Sessions` tables and SHA-256 salted password hashing in `Code.gs`).
  - **Supabase Realtime** for live room chat and task sync (replacing the ~3.5s chat poll in `RoomView.jsx` and the periodic full `pull()` in `api.js`).
  - **Supabase Storage** for room file uploads (replacing the Google Drive `DriveApp` upload path and 8 MB base64 cap).
- Schema, auth, and queries are being designed to stay within the **Supabase free tier**.
- The offline-first client model (local cache + queued writes in `localStorage`) is being preserved across the migration.

---

## [1.0.0] - 2026-06-21

First stable release. Ripple is a free, offline-first productivity and team-rooms PWA backed entirely by a single Google Sheet via a Google Apps Script web app. Reads come from a local cache instantly; writes are queued in `localStorage` and flushed to the Sheet when online, so nothing is lost offline.

### Added

#### Core tasks
- Tasks with title, notes, priority (`low` / `normal` / `high`), status, effort, estimate, tags, and project assignment.
- **Subtasks** with their own done state and ordering (inherit permissions from the parent task).
- **Deadlines** (`due_at`) and **reminders** (`remind_at`, with a configurable `remind_offset`).
- **Recurrence** — `daily`, `weekly`, `weekdays`, and `weekly:<day>`; on fire, recurring tasks reschedule the next occurrence (and keep the deadline in step) instead of completing (`nextOccurrence` in `Code.gs`).
- **Natural-language quick-add** for fast task capture.
- Optimistic local writes via a `localStorage` queue (`enqueue`/`flush` in `api.js`) that auto-flushes when connectivity returns.

#### Views
- **Smart views**: Today, Inbox, Upcoming, My tasks, All tasks, and Completed (`buildView` in `Workspace.jsx`).
- **Display modes**: List, Board, Calendar, Timeline, and Analytics.
- Priority- and deadline-aware sorting; search across task title, notes, and tags.

#### Ripple Chains
- **Ripple Chains** view for sequencing dependent tasks (`depends_on` field; `ChainsView`).

#### Projects, Goals, Habits, Templates
- **Projects** with name, color, and ordering (shareable into rooms via `team_id`).
- **Goals** with title and description, linkable from tasks (`goal_id`).
- **Habits** with a streak log.
- **Templates** for spinning up predefined task sets (`applyTemplate` / `TEMPLATES`).

#### Markdown Notes
- Personal and per-room **Markdown notes** with a dependency-free renderer and a **Write / Preview** toggle (`renderMarkdown`; `RoomNoteBody` in `RoomView.jsx`).

#### Multi-user auth
- Email + password **registration and login**, with Sheets-backed accounts and per-device session tokens (SHA-256 salted hashing; `register`/`login`/`createSession`/`resolveSession` in `Code.gs`).
- Per-row `user_id` ownership scoping so each user only sees their own data.
- `logout` clears the local cache and queue so one user's data never lingers for the next.

#### Rooms (team collaboration)
- **Rooms** (teams) with shared tasks, projects, and notes scoped by `team_id`.
- **Members and roles** — `admin` / `member`, gated behind a room admin passcode (`createTeam`, `setMemberRole`, `removeMember`).
- **Email invites** — invite by email with a secret token; invitees receive an accept link and join only after accepting. **Accept / Decline** flows surface both in an in-app invites banner and via the emailed link (`addMember`/`acceptInvite`/`declineInvite`; `InvitesBanner`).
- Pending-invitation **count badge** in the sidebar Rooms header.
- **Assignment notifications** — assigning a task to a room member notifies them by email + push, validated against room membership (`notifyAssignment`).
- Room overview with computed stats (open/completed tasks, decisions, members, last activity) — no AI.

#### Room Chat
- Per-room **chat** with message grouping and self-message deletion (`RoomChat`; `postMessage`).
- **@mention autocomplete** (keyboard-navigable suggestion popover) and **@mention highlighting** in rendered messages.
- **@mention notifications** delivered by email + push to mentioned members (`parseMentions`).
- **Per-room mute** to suppress @mention notifications per user per room (`setMute` / `isMuted`).
- **Unread dots** and fast-poll message sync (~3.5s) while the Chat tab is open (`fetchRoomMessages` / `roomMessages`).

#### Decisions log
- Per-room **decision log** — title, reason/context, author, and timestamp — as a permanent team memory (`RoomDecisions`; `Decisions` sheet).

#### Files
- Per-room **Files** — paste a link (Drive, Figma, docs) or **upload a file to Google Drive** (≤8 MB, shared via "anyone with link") through the owner's Drive (`uploadFile` / `getUploadsFolder` in `Code.gs`; `RoomFiles`).

#### Notifications
- **Email reminders** sent from a per-minute Apps Script time trigger, even with every device closed (`checkReminders`).
- **iPhone / web push** lock-screen notifications via a Netlify VAPID function, for reminders, assignments, and mentions (`savePushSub` / `sendPush`).

#### Productivity shell
- **Command palette** (Cmd/Ctrl-K) for navigation, creation, theme switching, and templates.
- **Focus mode** (press `F` on a selected task).
- **Mobile PWA** with a dedicated mobile nav and slide-out sidebar.
- **Light brand theme** (system / light / dark).
- **Delete account** — self-service danger-zone action that wipes all of the caller's data, the rooms they own, and their account, then clears local state (`deleteAccount` in both `api.js` and `Code.gs`).

#### Security
- Secrets (`SECRET_TOKEN`, `PUSH_SECRET`) stored in Apps Script **Script Properties**, never in source — so the repository is safe to publish.
- One-time `bootstrap` action to set secrets, which refuses to run once configured.
- Public repository with no committed credentials.

[Unreleased]: https://github.com/nirjharrrr/ripple/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/nirjharrrr/ripple/releases/tag/v1.0.0
