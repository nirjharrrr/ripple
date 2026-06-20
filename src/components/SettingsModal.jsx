import { useEffect, useState } from 'react';
import { getPrefs, setPrefs } from '../lib/settings';
import { currentUser } from '../lib/api';
import { pushSupported, isPushOn, enablePush } from '../lib/push';

export default function SettingsModal({ onClose }) {
  const [prefs, setLocal] = useState(getPrefs());
  const user = currentUser();
  const [pushState, setPushState] = useState('checking'); // checking | on | off | busy | unsupported
  const [pushErr, setPushErr] = useState('');

  useEffect(() => {
    if (!pushSupported()) { setPushState('unsupported'); return; }
    isPushOn().then((on) => setPushState(on ? 'on' : 'off'));
  }, []);

  async function turnOnPush() {
    setPushErr(''); setPushState('busy');
    try { await enablePush(); setPushState('on'); }
    catch (e) { setPushErr(String(e.message || e)); setPushState('off'); }
  }

  function update(patch) { setLocal(setPrefs(patch)); }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>Settings</h2><button className="dp-close" onClick={onClose}>✕</button></div>

        <div className="set-row">
          <span className="set-label">Account</span>
          <span className="set-val">{user?.name} · {user?.email}</span>
        </div>

        <div className="set-row">
          <span className="set-label">Start of week</span>
          <div className="seg">
            <button className={prefs.weekStart === 0 ? 'on' : ''} onClick={() => update({ weekStart: 0 })}>Sunday</button>
            <button className={prefs.weekStart === 1 ? 'on' : ''} onClick={() => update({ weekStart: 1 })}>Monday</button>
          </div>
        </div>

        <div className="set-row">
          <span className="set-label">Push notifications</span>
          <span className="set-val">
            {pushState === 'on' && <span style={{ color: 'var(--low)' }}>✓ Enabled on this device</span>}
            {pushState === 'off' && <button className="btn-primary" style={{ padding: '6px 12px' }} onClick={turnOnPush}>Enable</button>}
            {pushState === 'busy' && 'Enabling…'}
            {pushState === 'checking' && '…'}
            {pushState === 'unsupported' && 'Add to Home Screen first (iPhone)'}
          </span>
        </div>
        {pushErr && <div className="auth-error">{pushErr}</div>}

        <div className="set-row">
          <span className="set-label">Timezone</span>
          <span className="set-val">{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
        </div>
      </div>
    </div>
  );
}
