# 🌊 Ripple

A simple, free to-do app for tasks, subtasks, and reminders — runs on your
laptop and your phone, synced through a Google Sheet you own. No accounts to
pay for, no servers to run.

## What it does
- **Multi-user accounts** — sign up / log in; every task is private to its owner. Accounts + sessions live in the Sheet (passwords hashed + salted). All free, no external auth.
- **Tasks + subtasks**, with **Today / All / Done** views
- **Deadlines** — due date & time per task, with **Pending / Due today / Overdue / Done** status badges
- **Priority** (High / Normal / Low) with smart sorting, **search**, **undo on delete**, **clear completed**, **carry-over** of unfinished tasks
- **Reminders** at the deadline (with optional "15 min / 1 hr / 1 day before"): emailed to the task's owner when due + native banners when the app is open. Recurring ("every weekday") supported.
- **🎤 Brain dump** — dictate or paste a stream of thoughts; Ripple splits it into tasks + subtasks and pulls out deadlines, all on-device (no AI API). Review screen before saving.
- **Syncs** laptop ↔ phone through your Google Sheet · **offline-first** · **installable PWA**

## Setup (one time, ~5 min, free)
1. **Backend** — follow [`google-apps-script/README.md`](./google-apps-script/README.md) to create your Google Sheet + paste the script + deploy it. You'll get a web-app URL and you'll choose a secret token.
2. **Connect the app** — create `.env.local` (copy from `.env.example`):
   ```
   VITE_RIPPLE_API_URL=https://script.google.com/macros/s/XXXX/exec
   VITE_RIPPLE_TOKEN=your-secret-token
   ```
3. **Run it**:
   ```
   npm install
   npm run dev
   ```
4. **Install on phone** — open the dev/preview URL on your phone, then "Add to Home Screen". Allow notifications when prompted.

## Project layout
```
src/
  App.jsx              app shell: Today/All views, sync status, reminder watch
  lib/api.js           talks to the Sheet; offline cache + write queue
  lib/store.js         React store; optimistic task/subtask actions
  lib/parse.js         natural-language date/recurrence parsing
  lib/notify.js        in-app native notifications
  components/          QuickAdd, TaskItem, Setup
google-apps-script/
  Code.gs              the entire backend (paste into Apps Script)
  README.md            backend setup walk-through
```

## Roadmap
- **Done:** tasks/subtasks, Today/All/Done, deadlines + status badges, priority, search, undo, carry-over, notes, reminders (email + in-app), voice brain-dump auto-arrange, multi-user login (Sheets-backed), PWA, offline
- **Next:** iPhone push notifications (lock-screen, app-closed)
- **Then (Notion-flavored, all free on Sheets):** command palette (⌘K), keyboard shortcuts, Projects + Board/Calendar/Timeline views, Tags, Inbox/Upcoming, Focus mode + Pomodoro, Habits, Goals, Templates, Notes, Analytics, Settings

## Multi-user setup
After updating `Code.gs`, **re-run `setup()`** in the Apps Script editor once — it creates the `Users` + `Sessions` sheets and adds the new columns (`due_at`, `priority`, `user_id`, …) to existing sheets. To keep tasks you created before login existed, register in the app, then run `assignAllTo("you@email.com")` once from the editor.
