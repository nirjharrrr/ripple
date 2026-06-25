# Ripple

> **Create momentum.**

Ripple is a free, offline-first Progressive Web App for getting things done — solo and together. It pairs a fast personal task manager (tasks, projects, deadlines, habits, goals) with collaborative **Rooms** for teams, all backed by a single Google Sheet you own. Clean light theme, the Inter typeface, and a calm brand blue (`#2E84A7`).

---

## Why Ripple

Ripple is built around one hard constraint: **it should cost nothing to run and depend on nothing you have to pay for.**

- **100% free** — no subscriptions, no metered services, no credit card.
- **No paid APIs, no AI** — the entire backend is a Google Apps Script web app writing to a Google Sheet you create in ~5 minutes (see [`google-apps-script/README.md`](./google-apps-script/README.md)).
- **All data through Google Sheets** — your tasks live as plain rows in a spreadsheet you own and can open, read, and edit by hand at any time.
- **PWA only** — installs to your phone or desktop, works offline, and syncs when you reconnect. No native app store, no install friction.

Your data, your Sheet, your secret token. Nothing is hosted on someone else's database.

---

## Feature highlights

| Area | What you get |
|------|--------------|
| **Tasks** | Tasks and subtasks, priorities, due dates, projects, tags, archive/complete |
| **Deadlines & reminders** | Due dates with natural-language entry (via `chrono-node`); reminder emails fire even when every device is off |
| **Views** | Today, Inbox, Upcoming, All tasks, Completed, **Board**, **Timeline**, **Calendar**, **Analytics** |
| **Productivity systems** | **Goals**, **Habits**, **Templates** (apply a prebuilt checklist in one click) |
| **Ripple Chains** | Task dependencies — chain tasks so finishing one unblocks the next |
| **Notes** | Markdown notes alongside your tasks |
| **Rooms (teams)** | Shared workspaces with members, email invites, and accept/decline invite flow |
| **Room chat** | Real-time discussion with `@mentions`, per-room mute, and unread indicators |
| **Decisions log** | Capture and track team decisions inside a Room |
| **Files** | Attach and share files within Rooms |
| **Notifications** | Email reminders **and** web-push notifications |
| **Power tools** | Command palette (`⌘K` / `Ctrl-K`), **Focus mode** (`F`), keyboard shortcuts |
| **Mobile** | Full installable PWA with a mobile nav bar and slide-out sidebar |

Keyboard shortcuts (from `src/components/Workspace.jsx`): `⌘K`/`Ctrl-K` command palette, `N` new task, `F` focus mode on the selected task, `/` jump to search, `Esc` clear selection.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | [React 19](https://react.dev) + [Vite 8](https://vite.dev) |
| PWA | [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app) (offline support, installable) |
| Date parsing | [`chrono-node`](https://github.com/wanasit/chrono) (natural-language dates) |
| Backend | [Google Apps Script](https://developers.google.com/apps-script) + Google Sheets |
| Push | [`web-push`](https://github.com/web-push-libs/web-push) (VAPID web-push) |
| Hosting | [Netlify](https://www.netlify.com) (static `dist/` + `netlify/functions`) |
| Lint | ESLint 10 with React Hooks + React Refresh plugins |

The app boots from `index.html` → `src/main.jsx` → `src/App.jsx`. `App.jsx` gates rendering on configuration and auth state: it shows `Setup` until the API URL/token are configured (`isConfigured()`), then `Auth` until signed in (`isLoggedIn()`), then the main `Workspace`.

---

## Quickstart

**Prerequisites:** Node.js 18+ and a Google account.

```bash
# 1. Clone
git clone <your-fork-url> ripple
cd ripple

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env.local
#   then edit .env.local with your Apps Script deployment values:
#     VITE_RIPPLE_API_URL=https://script.google.com/macros/s/XXXX/exec
#     VITE_RIPPLE_TOKEN=your-long-random-secret-token

# 4. Run the dev server
npm run dev
```

Other scripts: `npm run build` (production build to `dist/`), `npm run preview` (preview the build), `npm run lint`.

> **Before the app will run**, you need the Google Sheets backend deployed so you have an API URL and token. Follow [`google-apps-script/README.md`](./google-apps-script/README.md) — it walks you through creating the Sheet, pasting `Code.gs`, setting your `SECRET_TOKEN`, running `setup` once, and deploying as a web app. Use the resulting `/exec` URL and your token in `.env.local`. For hosting, see [`docs/DEPLOY.md`](./docs/DEPLOY.md).

> **Note:** never commit `.env.local` or your Apps Script secret token. Keep the deployment URL + token private — anyone with both can reach your data.

---

## Documentation

| Doc | Contents |
|-----|----------|
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | App structure, the offline-first store, sync model, and data flow |
| [`docs/FEATURES.md`](./docs/FEATURES.md) | Full feature reference — tasks, Rooms, chains, habits, and more |
| [`docs/BACKEND.md`](./docs/BACKEND.md) | Google Apps Script + Sheets backend, schema, and API surface |
| [`docs/DEPLOY.md`](./docs/DEPLOY.md) | Deploying to Netlify and configuring web-push functions |
| [`docs/SECURITY.md`](./docs/SECURITY.md) | Token model, access scope, and data-privacy notes |
| [`CHANGELOG.md`](./CHANGELOG.md) | Release history |

---

## Project status

**v1.0.0** — current release. The backend is the **Google Sheets** stack described above: a Google Apps Script web app reading and writing a Sheet you own, with email reminders driven by a per-minute Apps Script trigger.

**v2 (in progress)** — migrates the backend from Google Sheets to [Supabase](https://supabase.com) for a real database and richer realtime collaboration. The frontend and feature set remain the same; only the storage and sync layer changes.
