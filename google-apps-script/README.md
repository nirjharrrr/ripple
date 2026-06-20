# Ripple backend — Google Sheet setup (free, ~5 min, no credit card)

This is the entire "server" for Ripple. It costs nothing and needs no API keys.

## Steps

1. **Create the Sheet** — go to [sheets.new](https://sheets.new). Name it "Ripple Data" (any name is fine). You can open this Sheet anytime to see/edit your tasks as plain rows.

2. **Open the script editor** — in the Sheet menu: **Extensions → Apps Script**.

3. **Paste the code** — delete the sample `function myFunction() {}` and paste the entire contents of [`Code.gs`](./Code.gs).

4. **Set your secret** — near the top, change:
   ```js
   var SECRET_TOKEN = 'CHANGE-ME-to-a-long-random-string';
   ```
   to a long random string (e.g. mash the keyboard, 30+ chars). Keep it — the app needs the same value. Optionally set `REMINDER_EMAIL` to where reminder emails should go (blank = your own Google account email).

5. **Run setup once** — in the toolbar function dropdown pick **`setup`**, click **Run**. Google will ask you to authorize — approve it (it's your own script). This creates the `Tasks`/`Subtasks` tabs and the every-minute reminder check.

6. **Deploy as a web app:**
   - Click **Deploy → New deployment**.
   - Gear icon → **Web app**.
   - **Execute as:** Me. **Who has access:** Anyone.
   - **Deploy**, then **copy the Web app URL** (ends in `/exec`).

7. **Wire it into the app** — in the `ripple` project create `.env.local`:
   ```
   VITE_RIPPLE_API_URL=https://script.google.com/macros/s/XXXX/exec
   VITE_RIPPLE_TOKEN=the-same-long-random-string
   ```

That's it. The app now reads/writes your Sheet, and due reminders email you even when every device is off.

## Notes
- **Privacy:** "Who has access: Anyone" means anyone *with the URL* can reach the script, but every request must include your `SECRET_TOKEN`, so without the token they get `unauthorized`. Don't share the URL+token.
- **Updating the code later:** paste changes, then **Deploy → Manage deployments → Edit → Version: New version → Deploy** (the `/exec` URL stays the same).
- **Email quota:** consumer Gmail allows ~100 reminder emails/day — far more than a personal to-do list needs.
