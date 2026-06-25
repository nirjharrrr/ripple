# Ripple — Deployment Runbook

This is the operations/deployment runbook for **Ripple**, a personal to-do PWA. Ripple has two halves:

- **Backend** — a Google Apps Script web app backed by a Google Sheet (the entire "server"). Free, no credit card, no API keys.
- **Frontend** — a React + Vite PWA deployed to Netlify, plus one Netlify serverless function (`send-push`) that delivers Web Push notifications.

There is no traditional database or VM. Reads/writes flow from the browser → Apps Script `/exec` → Sheet. Reminders are sent by a per-minute Apps Script trigger that emails the user and (optionally) calls the Netlify push function.

---

## 1. Prerequisites

| Requirement | Notes |
|---|---|
| **Node 18+** | Needed for Vite build, the Netlify CLI, and `web-push`. Check with `node -v`. |
| **A Google account** | Hosts the Sheet + Apps Script web app. A normal consumer Gmail is fine (~100 reminder emails/day quota). |
| **A Netlify account** | Hosts the static PWA and the `send-push` function. Free tier is sufficient. |
| **clasp** | The Apps Script CLI. Already a dev dependency (`@google/clasp`), so use `npx clasp ...`. Log in once: `npx clasp login`. |
| **Netlify CLI** | Used for deploys. Invoke via `npx netlify ...` (no global install required). Log in once: `npx netlify login`. |

Install repo dependencies first:

```bash
cd ~/ripple
npm install
```

---

## 2. One-Time Backend Setup (Google Sheet + Apps Script)

You only do this once per environment. After this, code updates go through the clasp workflow in §4.

1. **Create the Sheet** — go to [sheets.new](https://sheets.new), name it `Ripple Data` (any name works). You can open this Sheet anytime to see your tasks as plain rows.

2. **Open the script editor** — in the Sheet menu: **Extensions → Apps Script**.

3. **Paste the code** — delete the sample `function myFunction() {}` and paste the entire contents of `google-apps-script/Code.gs`.

4. **Set the secret token.** Two options:
   - **Script Property (recommended):** in the Apps Script editor go to **Project Settings (gear) → Script Properties → Add script property**, key `SECRET_TOKEN`, value = a long random string (30+ chars). Also set `PUSH_SECRET` here if you use Web Push (see §3/§7).
   - **Bootstrap action:** alternatively, with the web app deployed, call the one-time `bootstrap` action to write the Script Properties (it refuses once `SECRET_TOKEN` is already set).

   Whatever value you choose, **it must equal `VITE_RIPPLE_TOKEN`** in the frontend (see §3).

5. **Run `setup()` once** — in the toolbar function dropdown pick **`setup`**, click **Run**. Approve the Google authorization prompt (it's your own script). This creates the `Tasks`/`Subtasks` (and related) tabs and installs the **per-minute reminder trigger**.

6. **(If using Drive uploads) run `authorizeDrive()` once** — see §5 below. Do this **before** the first deploy of any version that touches `DriveApp`.

7. **Deploy as a Web app:**
   - **Deploy → New deployment** → gear icon → **Web app**.
   - **Execute as:** `Me`. **Who has access:** `Anyone`.
   - Click **Deploy**, then **copy the Web app URL** (ends in `/exec`). This is `<YOUR_EXEC_URL>`.

   > The `appsscript.json` manifest already declares `executeAs: USER_DEPLOYING` and `access: ANYONE_ANONYMOUS`, matching the settings above.

**Privacy note:** "Who has access: Anyone" means anyone *with the URL* can reach the script, but every request must carry the correct `SECRET_TOKEN`, so without it they get `unauthorized`. Don't share the URL + token.

---

## 3. Environment Variables

### Frontend (Vite) — `.env.local` in the repo root

Copy `.env.example` to `.env.local` and fill in. These are **baked into the client bundle at build time** (Vite inlines `VITE_*` vars).

| Variable | Purpose |
|---|---|
| `VITE_RIPPLE_API_URL` | The Apps Script `/exec` Web app URL — `<YOUR_EXEC_URL>`. |
| `VITE_RIPPLE_TOKEN` | Shared app gate token. **Must equal the Apps Script `SECRET_TOKEN`.** |
| `VITE_VAPID_PUBLIC` | VAPID public key for Web Push subscriptions (see §7). Same value as the function's `VAPID_PUBLIC`. |

```bash
cp .env.example .env.local
# then edit .env.local
```

### Netlify function (`send-push`) — set in Netlify env (Site settings → Environment variables, or via CLI)

| Variable | Purpose |
|---|---|
| `VAPID_PUBLIC` | VAPID public key. Must match the client's `VITE_VAPID_PUBLIC`. |
| `VAPID_PRIVATE` | VAPID private key. **Server-only — never ship to the client or the Sheet.** |
| `VAPID_SUBJECT` | Contact URI for push, e.g. `mailto:you@example.com`. |
| `PUSH_SECRET` | Shared secret gating the push function. **Must match the `PUSH_SECRET` Script Property in Apps Script.** |

### Cross-system equality rules (do not get these wrong)

- `SECRET_TOKEN` (Apps Script Script Property)  ==  `VITE_RIPPLE_TOKEN` (frontend)
- `VITE_VAPID_PUBLIC` (frontend)  ==  `VAPID_PUBLIC` (Netlify function)
- `PUSH_SECRET` (Apps Script Script Property)  ==  `PUSH_SECRET` (Netlify function)

Setting Netlify env vars via CLI (example):

```bash
npx netlify env:set VAPID_PUBLIC "<YOUR_VAPID_PUBLIC>"
npx netlify env:set VAPID_PRIVATE "<YOUR_VAPID_PRIVATE>"
npx netlify env:set VAPID_SUBJECT "mailto:<YOU>@example.com"
npx netlify env:set PUSH_SECRET "<YOUR_PUSH_SECRET>"
```

---

## 4. Backend Deploy Workflow (clasp)

After the one-time setup, push code changes and **redeploy the same deployment id** so the `/exec` URL stays stable:

```bash
# from repo root; clasp is configured against the google-apps-script/ project
npx clasp push -f
npx clasp deploy -i <DEPLOYMENT_ID> -d "describe the change"
```

- `clasp push -f` uploads local `.gs`/manifest files, overwriting the remote copy.
- `clasp deploy -i <DEPLOYMENT_ID>` redeploys **that existing deployment**, so `<YOUR_EXEC_URL>` does not change. Omitting `-i` creates a *new* deployment with a *new* URL — don't do that unless you intend to rotate the URL.
- To find the id: `npx clasp deployments` (use the non-`@HEAD` entry).

**Schema auto-migration:** the backend migrates its own Sheet schema on the **first request after a code change** (`ensureMigrated`). You don't run migrations manually — just push/deploy, then make one request (open the app) to trigger it.

---

## 5. Drive Uploads — Authorize Before Deploying

Ripple's file-upload feature (`uploadFile` → `DriveApp`) needs the Drive OAuth scope. Apps Script only grants a scope after code using it has been authorized interactively.

**Before deploying any version that uses `DriveApp`:**

1. In the Apps Script editor, select **`authorizeDrive`** from the function dropdown and click **Run**.
2. Approve the Drive authorization prompt.

If you deploy a Drive-using version **without** having authorized the scope, `/exec` will break (the web app runs as you, but lacks the granted scope) until you run `authorizeDrive()` and redeploy. Run it once per environment; re-run only if you revoke access or add new scopes.

---

## 6. Frontend Deploy (Netlify)

Deploys are done **via the Netlify CLI** — this project is **not** wired to GitHub auto-build.

```bash
npm run build                       # vite build → dist/
npx netlify deploy --prod --build   # builds + publishes to production
```

What `netlify.toml` configures:

- `publish = "dist"` — the Vite output directory is served as the static site.
- `command = "npm run build"` — build command used by `--build`.
- `[functions] directory = "netlify/functions"` with `node_bundler = "esbuild"` — bundles `send-push.mjs` (and its `web-push` dependency) into a deployable function.

After deploy, the function is reachable at `https://<your-site>.netlify.app/.netlify/functions/send-push`.

> Ensure `.env.local` is populated **before** `npm run build` — `VITE_*` values are inlined at build time, so a rebuild is required to change them.

---

## 7. Web Push

### Generate VAPID keys (once)

`web-push` is a dependency, so:

```bash
npx web-push generate-vapid-keys
```

This prints a **Public Key** and **Private Key**. Wire them up:

- Public key → `VITE_VAPID_PUBLIC` (frontend `.env.local`) **and** `VAPID_PUBLIC` (Netlify env) — these two must be identical.
- Private key → `VAPID_PRIVATE` (Netlify env only — never client-side, never in the Sheet).

### What `send-push.mjs` does

The function (`netlify/functions/send-push.mjs`):

1. Accepts `POST` only.
2. Rejects the request unless `body.secret === process.env.PUSH_SECRET` (401 otherwise) — this is the gate between Apps Script and the function.
3. Loads VAPID details from env (`VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_SUBJECT`); returns 500 if keys are missing.
4. Sends the payload `{ title, body, url }` to every subscription in `body.subscriptions` via `web-push`.
5. Returns `{ ok, sent, gone }` — `gone` lists endpoints that returned 404/410 (expired subscriptions to prune).

Flow at runtime: the per-minute Apps Script reminder trigger collects due reminders + saved push subscriptions, then POSTs them to the function with the shared `PUSH_SECRET`. The browser subscribes using `VITE_VAPID_PUBLIC` and sends the subscription to the Sheet via the `savePushSub` action.

---

## 8. Gotchas

- **PWA service worker is sticky.** Vite PWA uses `registerType: 'autoUpdate'` with a Workbox service worker (`push-sw.js` imported in). After a new frontend deploy, an open client may take **a few reloads** (or a tab close/reopen) to swap in the new build. Hard-refresh or close all tabs if you don't see changes.

- **Don't test `/exec` with anonymous `curl`.** An unauthenticated request to the Apps Script URL returns a **Google login HTML page**, not your JSON — even when the deployment is healthy. The client deliberately POSTs as `text/plain` (no CORS preflight) and follows redirects. Test via the actual app, or a browser `fetch()` with the correct body/token — not `curl`.

- **The app token is in the client bundle.** `VITE_RIPPLE_TOKEN` is inlined into the shipped JS — this is inherent to a client-only app with no per-user server auth. The token is a shared gate, not a per-user secret. To **rotate** it: change `SECRET_TOKEN` (Apps Script Script Property) **and** `VITE_RIPPLE_TOKEN` (`.env.local`) to the same new value, then redeploy **both** halves (clasp deploy + `netlify deploy --prod --build`).

- **`/exec` URL stability.** Always redeploy with `-i <DEPLOYMENT_ID>` (§4). A fresh `clasp deploy` (no `-i`) mints a new URL and silently breaks the frontend until you update `VITE_RIPPLE_API_URL` and rebuild.

- **Env changes need a rebuild.** Editing `.env.local` does nothing to an already-built `dist/`. Re-run `npm run build` / `netlify deploy --prod --build`.

- **Drive scope.** If file uploads suddenly fail after a deploy, you likely shipped Drive code without running `authorizeDrive()` first (§5).

- **Email quota.** Consumer Gmail allows ~100 reminder emails/day — ample for a personal list, but the cap exists.
