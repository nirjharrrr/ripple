# Ripple — Feature Catalogue

> Canonical documentation for Ripple v1.0.0 — a free, offline-first productivity and team-rooms PWA.

Ripple is a single-page React application (`src/components/Workspace.jsx` is the shell) backed by a Google Apps Script + Sheet store, with an optimistic offline cache and a write queue. Every feature below is rendered client-side and syncs in the background; the sync status indicator lives in the sidebar (`src/components/Sidebar.jsx`).

---

## Tasks & Subtasks

The task is Ripple's core object. Tasks are created, edited, and completed from the list views and the detail panel.

### Quick-add with natural-language parsing
New tasks can be typed as plain English in any list group's inline "＋ New task" row (`src/components/TaskList.jsx`). The text is run through `parseQuickAdd` (`src/lib/parse.js`), which uses `chrono-node` to extract:

- **A due date/time** — e.g. *"review deck friday 3pm"* sets `due_at` and strips the date phrase from the title. Parsing is forward-dated (future-biased).
- **A recurrence rule** — recognized patterns produce a `recurrence` value:

| You type | Parsed `recurrence` |
|---|---|
| `every weekday` / `every weekdays` | `weekdays` |
| `every day` / `daily` | `daily` |
| `every week` / `weekly` | `weekly` |
| `every mon`…`every sun` | `weekly` |

Leftover filler words (`at`, `on`, `by`, `every`, `due`) and stray punctuation are trimmed so the title stays clean. `formatRemind` and `recurrenceLabel` render friendly labels like *"Tomorrow 9:00 AM · every weekday"*.

### Attributes (set in `src/components/DetailPanel.jsx`)
Opening a task reveals a detail panel with a title (inline-editable via `TitleEdit`), a description (Markdown-free plain textarea, saved on blur), and these fields:

| Field | Values / behavior | Source |
|---|---|---|
| **Status** | Not Started → In Progress → Waiting → Review → Completed | `STATUSES` in `src/lib/status.js` |
| **Priority** | High / Medium (`normal`) / Low | `PRIORITIES`, `PRIORITY_LABEL` |
| **Assignee** | Any joined room member (or you); pending members are excluded | `AssigneeSelect` |
| **Due date** | `datetime-local` picker | `toLocalInput` / `fromLocalInput` |
| **Goal** | Link the task to a Goal | `goal_id` |
| **Depends on** | Prerequisite task for Ripple Chains (cannot self-reference or create a 1-step cycle) | `depends_on` |
| **Effort** | Small / Medium / Large | `EFFORTS` |
| **Estimate** | 15 min / 30 min / 1h / 2h / 4h | `ESTIMATES` |
| **Tags** | Comma-separated, rendered as chips | `tags` |
| **Attachments (links)** | Paste URLs (Drive, Figma, docs…); auto-prefixed with `https://`, shown with a prettified hostname | `LinkAttachments` |

The detail panel also has **Subtasks**, **Comments**, and **Activity** tabs.

### Reminders
A task's reminder timestamp is computed from its due date minus a "before" offset via `computeRemindAt` (`src/lib/status.js`). Offsets are: At deadline, 15 min before, 1 hour before, 1 day before (`REMIND_OFFSETS`). The in-app watcher (`startReminderWatch` in `src/lib/notify.js`) polls every 30s and fires a native notification when `remind_at` arrives.

### Subtasks
Added inline in the detail panel's Subtasks section or tab (`store.addSubtask`). Each subtask has its own checkbox (`toggleSubtask`), can be renamed via a prompt, and deleted. Task rows show a `☑ done/total` progress chip. Subtasks also appear inside Focus Mode.

### Comments & Activity
The **Comments** tab posts author-stamped comments (`store.addComment`), each deletable. The **Activity** tab shows created / last-updated / completed timestamps.

### Swipe actions (touch devices)
In `TaskRow` (`src/components/TaskList.jsx`), horizontal swipe gestures are supported:
- **Swipe right** (> 60px) → complete the task.
- **Swipe left** (< −60px) → snooze to tomorrow 9:00 AM and remove the "today" flag.

A drag threshold prevents an accidental swipe from being read as a tap-to-open.

### Recurrence storage
Recurrence is captured at quick-add time and stored on the task; reminder keys include the timestamp so recurring reminders re-fire on each new occurrence (`src/lib/notify.js`).

---

## Views

The sidebar and command palette switch between views; `buildView` in `src/components/Workspace.jsx` defines each one's task set, sort, and grouping.

| View | Contents | Group-by |
|---|---|---|
| **Today** | Tasks flagged for today, due today, or overdue (overdue carries over so nothing falls off — `belongsToToday`) | Priority |
| **Inbox** | Active tasks with no project | Priority |
| **Upcoming** | Active tasks with a future due date | Date (Tomorrow / This week / Next week / Later) |
| **My tasks** | Everything assigned to you across all rooms, bucketed Overdue / Today / Upcoming / Completed (`src/components/MyTasksView.jsx`) | Sectioned |
| **All tasks** | Every active task | Priority |
| **Completed** | Finished tasks, newest first | Flat |
| **Board** | Kanban columns by workflow status | Status |
| **Calendar** | Month grid of tasks by due date | — |
| **Timeline** | Horizontal Gantt-style bars across time | — |
| **Project** | Tasks in one project | Priority |

### List / Board / Calendar modes
The `TaskList` header offers a **List / Board / Calendar** toggle. Active tasks are sorted by priority, then due date, then manual position (`sortActive`).

- **List** groups by priority (High/Medium/Low) or by date bucket, each group collapsible with an inline quick-add.
- **Board** (`Board` component) is a Kanban laid out by the five workflow statuses; cards show project chips.
- **Calendar** (`src/components/CalendarView.jsx`) is a 6-week month grid honoring the user's start-of-week preference, showing up to 4 tasks per day (`+N more` overflow), colored by project, click-to-open.

### Timeline
`src/components/TimelineView.jsx` plots every dated task as a bar from creation→due across a today→+90-day axis with weekly tick marks and a "today" marker; overdue bars are highlighted.

### Analytics
`src/components/Analytics.jsx` computes, with no AI/server call:
- KPI stats: **Completed**, **Active**, **Completion rate %**, **Current streak** (consecutive days with ≥1 completion).
- A **14-day completed** bar chart (by `updated_at` of done tasks).
- **By priority (active)** distribution bars.

---

## Ripple Chains

Ripple Chains turn tasks into ordered dependency flows (`src/lib/chains.js`, `src/components/ChainsView.jsx`).

- **Dependencies** — a task's `depends_on` points to its single prerequisite. Set from the detail panel's *Depends on* field.
- **Locked / Ready / Done states** — `isLocked` marks a task locked while its prerequisite is incomplete. `ChainsView` renders each task as a node labeled **🔒 Locked**, **→ Ready**, or **✓ Done**. Locked tasks also show a 🔒 chip in normal list rows and a banner in the detail panel (`ChainInfo`), which lists what completing the task will unlock.
- **Auto-unlock** — completing a prerequisite immediately flips its dependents from locked to ready (derived live, no manual step).
- **Flow visualization** — `buildChains` groups dependency-linked tasks into connected components (union-find), orders each root→leaf by depth, and renders them as connected nodes. The connector between two steps animates (`.flow`) once the upstream step is done.
- **Completion ripple animation** — checking off a task triggers `rippleBurst`, a one-shot expanding ripple on the checkbox (fires only on the actual completion click, not on re-render). This plays in both the list and the Chains view.

---

## Projects, Goals, Habits & Templates

### Projects
Lightweight colored containers for tasks (`store.addProject`, palette command "New project"). Project chips appear on task rows, board cards, calendar items, and timeline bars. Deleting a project detaches its tasks rather than deleting them. A default 8-color palette is defined (`PROJECT_COLORS`).

### Goals
`src/components/GoalsView.jsx` — outcomes that tasks ladder up to. Each goal shows a **progress bar computed from its linked tasks** (`done/total` and %). Tasks are linked via the detail panel's *Goal* field; clicking a linked task opens it, and its checkbox toggles completion inline. Deleting a goal detaches its tasks.

### Habits
`src/components/HabitsView.jsx` — daily habits with a one-tap check for today (`toggleHabitToday`), a **7-day dot strip**, and a **🔥 streak** count computed by walking back consecutive logged days (`streakOf`, up to 365 days).

### Templates
`src/components/TemplatesView.jsx` — ready-made checklists that create a task plus pre-filled subtasks (`applyTemplate`). Built-in templates: **Content Creation**, **Product Launch**, **Weekly Review**, **Bug Fix**, **Meeting Prep**. Also available as commands in the command palette.

---

## Notes (Markdown)

`src/components/NotesView.jsx` is a two-pane notes editor (list + editor). Each note has a title and a Markdown body with a **Write / Preview** toggle. Rendering uses Ripple's own dependency-free Markdown engine (`src/lib/markdown.js`), a deliberately safe subset:

- HTML is escaped first, so user text can never inject markup.
- Supported: `#`–`####` headings, `- `/`* ` and `1. ` lists, `> ` blockquotes, `**bold**`, `*italic*`/`_italic_`, `` `code` ``, `[label](url)`, and bare URLs (http/https only, opened in a new tab with `noreferrer noopener`).

Notes save on blur (`store.updateNote`). The same editor is embedded per-room in the Rooms **Notes** tab.

---

## Rooms (Collaboration)

Rooms (`src/components/RoomsIndex.jsx`, `src/components/RoomView.jsx`) are shared spaces. Creating a room requires a name and a 4+ character **admin passcode** (`createTeam`). Each room card shows open/done task counts and member count. A room exposes seven tabs:

| Tab | What it does |
|---|---|
| **Overview** | Stat grid (open / completed / decisions / members / last activity), quick-action buttons, and a non-AI computed room summary |
| **Tasks** | A `TaskList` scoped to the room (new tasks default to `team_id` = room) |
| **Chat** | Real-time room messaging (see below) |
| **Notes** | Per-room Markdown notes with Write/Preview |
| **Decisions** | A permanent decision log — title + optional reason, author- and time-stamped (`addDecision`) |
| **Files** | File links + Drive upload (see below) |
| **Members** | Roster and admin management (see below) |

### Membership & roles
Members carry a **role** badge of `admin` or `member`. Management is gated behind the room's admin passcode: enter it to **Unlock**, then promote/demote (`setRole` → "Make admin"/"Make member") or remove members (`removeMember`). The room owner cannot be demoted or removed. Pending (not-yet-joined) members show a "· pending" tag and can't be assigned tasks.

### Email invitations
Admins invite by email; the invitee receives an accept link (`addMember`). Pending invites surface two ways for the recipient:
- An **Invites banner** at the top of the workspace with **Accept** / **Decline** (`acceptInvite` / `declineInvite` in `src/components/Workspace.jsx`).
- A "N invites" pill in the sidebar's Rooms section.

Accepting an emailed link is auto-redeemed once after sign-in via a `ripple_pending_invite` token in `localStorage`, then opens the joined room.

### Assignment notifications
Assigning a task to someone other than yourself queues an assignment notice (`assignTask` → `saveAssignmentNotice`), delivering an email + push to the assignee. Re-assigning to the same person does not re-notify.

### Room chat
`RoomChat` in `src/components/RoomView.jsx`:
- **Live polling** — the open Chat tab polls new messages every ~3.5s (`fetchRoomMessages` + `mergeMessages`), independent of the 20s full sync.
- **@mention autocomplete** — typing `@` opens a suggestion popover of joined members; navigate with ↑/↓, accept with Enter/Tab, dismiss with Esc.
- **Mention highlight** — `@handles` are highlighted in rendered messages (`renderBody`). Mentioning a teammate notifies them by email + push.
- **Per-room mute** — a Mute toggle suppresses @mention notifications for that room for you (`muteRoom` → `setRoomMute`).
- **Unread dots** — the sidebar shows a dot per room with unread messages, tracked client-side via per-room last-read bookmarks (`src/lib/chat.js`, `unreadCount`). Opening the Chat tab marks it read (`markRoomRead`).
- Consecutive messages from the same author within 4 minutes are visually grouped; you can delete your own messages.

### Files: links + Drive upload
`RoomFiles` supports two paths:
- **Paste a link** — any URL (auto-prefixed `https://`), saved with an optional label.
- **Drive upload** — pick a local file (≤ **8 MB**, base64-POSTed within Apps Script limits) via `uploadFile`. **Note:** Drive upload requires the room owner to have authorized Google Drive; if not, the UI surfaces *"Upload failed — the room owner may need to authorize Drive."*

---

## Notifications

Ripple layers reminders so something reaches the user whether the app is open or closed:

- **In-app / native** — while Ripple is open, `startReminderWatch` (`src/lib/notify.js`) polls every 30s and pops a native `Notification` for any task whose `remind_at` has passed (deduped per timestamp via a `ripple_fired_v1` localStorage set).
- **Email reminders** — handled server-side by the Sheet's Apps Script for the "everything closed" case.
- **iPhone / web push** — `src/lib/push.js` registers a Web Push subscription (VAPID) so the backend reminder engine can push to the lock screen with the app closed. On iPhone the PWA must be **Added to Home Screen** first; enabling lives in Settings.
- **Assignment + @mention** — both generate email + push to the target user, as described under Rooms.

---

## Productivity Shell

| Feature | Where | Notes |
|---|---|---|
| **⌘K Command Palette** | `src/components/CommandPalette.jsx` | Fuzzy search over commands: new task/project, go-to-view, open project, apply template, enter focus, open settings, theme. ↑/↓ to move, Enter to run, Esc to close |
| **Keyboard shortcuts** | `src/components/Workspace.jsx` | See table below |
| **Focus Mode + Pomodoro** | `src/components/FocusMode.jsx` | Full-screen focus on one task: 25-min work / 5-min break cycle, progress ring, Start/Pause/Reset, skip-to-break, inline subtask checklist, and a "✓ Mark task complete" button |
| **Light theme** | `src/lib/settings.js` | Theme is forced to `light`; dark mode is intentionally disabled in v1.0.0 |
| **Mobile bottom-nav (PWA)** | `src/components/MobileNav.jsx` | Bottom bar: Today · Tasks · ＋Add (opens palette) · Rooms · Profile; plus a top mobile bar with menu/search |
| **Settings** | `src/components/SettingsModal.jsx` | Account info, **Start of week** (Sun/Mon), **Push notifications** enable, detected timezone, and **Delete account** |
| **Sync indicator** | `src/components/Sidebar.jsx` | Live status dot: Synced / Syncing… / Offline / Sync error, plus a pending-writes count |

### Keyboard shortcuts

| Key | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Toggle the command palette |
| `N` | New task in the current view |
| `F` | Enter Focus Mode on the selected task |
| `/` | Focus the sidebar search box |
| `Esc` | Deselect the open task |

(Shortcuts are suppressed while typing in an input, textarea, select, or contenteditable.)

### Delete account
The Settings "Danger zone" requires typing **DELETE** to confirm, then permanently removes the account and all data — tasks, notes, owned rooms, messages, and memberships (`deleteAccount`) — and boots back to the login screen.

---

## Offline-first behavior

All mutations are optimistic against a local cache and queued for sync (`enqueue`/`flush` in `src/lib/api.js`); the sidebar shows pending writes and offline state. Deleting a task returns a snapshot enabling **Undo** (`deleteTask` → `restoreTask`). This is what makes Ripple usable with no connection and free to run on a Google Sheet backend.

---

Relevant source files: `src/components/Workspace.jsx`, `TaskList.jsx`, `DetailPanel.jsx`, `RoomView.jsx`, `RoomsIndex.jsx`, `Sidebar.jsx`, `NotesView.jsx`, `GoalsView.jsx`, `HabitsView.jsx`, `TemplatesView.jsx`, `ChainsView.jsx`, `Analytics.jsx`, `CalendarView.jsx`, `TimelineView.jsx`, `MyTasksView.jsx`, `CommandPalette.jsx`, `FocusMode.jsx`, `MobileNav.jsx`, `SettingsModal.jsx`; and `src/lib/parse.js`, `chains.js`, `markdown.js`, `status.js`, `notify.js`, `chat.js`, `push.js`, `settings.js`, `store.js`, `api.js`.
