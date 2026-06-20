// Shown when VITE_RIPPLE_API_URL / VITE_RIPPLE_TOKEN aren't set yet.
export default function Setup() {
  return (
    <div className="setup">
      <div className="setup-card">
        <div className="logo">🌊 Ripple</div>
        <h1>Connect your Google Sheet</h1>
        <p>Ripple stores your tasks in a free Google Sheet — no account, no cost. One-time setup, about 5 minutes:</p>
        <ol>
          <li>Create a Sheet at <code>sheets.new</code></li>
          <li><b>Extensions → Apps Script</b>, paste <code>google-apps-script/Code.gs</code></li>
          <li>Set your <code>SECRET_TOKEN</code>, run <code>setup</code> once</li>
          <li><b>Deploy → Web app</b> (Anyone) and copy the URL</li>
          <li>
            Create <code>.env.local</code> in the project:
            <pre>{`VITE_RIPPLE_API_URL=https://script.google.com/.../exec
VITE_RIPPLE_TOKEN=your-secret-token`}</pre>
          </li>
          <li>Restart <code>npm run dev</code></li>
        </ol>
        <p className="muted">Full walk-through in <code>google-apps-script/README.md</code>.</p>
      </div>
    </div>
  );
}
