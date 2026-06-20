import { useState } from 'react';
import { createTeam } from '../lib/api';
import Icon from './Icon';

export default function RoomsIndex({ store, startCreating, onOpenRoom }) {
  const rooms = store.data.teams || [];
  const [creating, setCreating] = useState(startCreating || rooms.length === 0);

  return (
    <section className="main">
      <header className="main-head">
        <div><h1>Rooms</h1><div className="main-sub">Collaborative spaces for tasks, notes & decisions</div></div>
        <button className="btn-primary" style={{ padding: '8px 14px' }} onClick={() => setCreating((v) => !v)}>+ New room</button>
      </header>

      {creating && <CreateRoom store={store} onDone={(id) => { setCreating(false); if (id) onOpenRoom(id); }} />}

      <div className="rooms-grid">
        {rooms.map((r) => {
          const tasks = store.data.tasks.filter((t) => t.team_id === r.id && !t.archived);
          const open = tasks.filter((t) => !t.done).length;
          const done = tasks.filter((t) => t.done).length;
          const members = (store.data.memberships || []).filter((m) => m.team_id === r.id).length;
          return (
            <button className="room-card" key={r.id} onClick={() => onOpenRoom(r.id)}>
              <div className="room-card-icon"><Icon name="rooms" size={20} /></div>
              <div className="room-card-name">{r.name}</div>
              <div className="room-card-stats">
                <span>{open} open</span><span>·</span><span>{done} done</span><span>·</span><span>{members} member{members === 1 ? '' : 's'}</span>
              </div>
            </button>
          );
        })}
        {rooms.length === 0 && !creating && <div className="placeholder">No rooms yet. Create your first room.</div>}
      </div>
    </section>
  );
}

function CreateRoom({ store, onDone }) {
  const [name, setName] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const r = await createTeam(name.trim(), pass);
      if (!r) throw new Error('failed');
      await store.refresh();
      onDone(r.id);
    } catch (e2) { setErr(String(e2.message || e2)); setBusy(false); }
  }

  return (
    <form className="create-room" onSubmit={submit}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Room name — e.g. Launch Room" autoFocus />
      <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Admin passcode (4+ chars)" />
      {err && <div className="auth-error">{err}</div>}
      <div className="create-room-actions">
        <button type="button" className="btn-ghost" onClick={() => onDone(null)}>Cancel</button>
        <button className="btn-primary" disabled={busy || !name.trim() || pass.length < 4}>{busy ? 'Creating…' : 'Create room'}</button>
      </div>
    </form>
  );
}
