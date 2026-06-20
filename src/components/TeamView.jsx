import { useState } from 'react';
import { createTeam, verifyAdmin, addMember, removeMember, setRole } from '../lib/api';
import Icon from './Icon';

export default function TeamView({ store, user }) {
  const teams = store.data.teams || [];
  const [teamId, setTeamId] = useState(teams[0]?.id || null);
  const team = teams.find((t) => t.id === teamId) || teams[0] || null;

  if (!team) return <CreateTeam store={store} />;

  return <ManageTeam key={team.id} store={store} team={team} teams={teams} user={user} onSwitch={setTeamId} />;
}

function CreateTeam({ store }) {
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
    } catch (e2) { setErr(String(e2.message || e2)); setBusy(false); }
  }

  return (
    <section className="main">
      <header className="main-head"><div><h1>Team</h1><div className="main-sub">Create a team to share projects and assign tasks</div></div></header>
      <form className="goal-add" style={{ flexDirection: 'column', maxWidth: 380, alignItems: 'stretch', gap: 10 }} onSubmit={submit}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Team name — e.g. My Studio" />
        <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Set an admin password (4+ chars)" />
        {err && <div className="auth-error">{err}</div>}
        <button className="btn-primary" disabled={busy || !name.trim() || pass.length < 4}>{busy ? 'Creating…' : 'Create team'}</button>
        <span className="dp-muted tiny">You'll use this admin password to add or remove members later.</span>
      </form>
    </section>
  );
}

function ManageTeam({ store, team, teams, user, onSwitch }) {
  const members = (store.data.memberships || []).filter((m) => m.team_id === team.id);
  const [adminPass, setAdminPass] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function unlock(e) {
    e.preventDefault();
    setErr('');
    const r = await verifyAdmin(team.id, adminPass);
    if (r && r.valid) { setUnlocked(true); setMsg(''); }
    else setErr('Admin password incorrect');
  }

  async function invite(e) {
    e.preventDefault();
    setErr(''); setMsg('');
    const r = await addMember(team.id, adminPass, email.trim());
    if (r === null) { setErr('Could not add member'); return; }
    setMsg(typeof r === 'string' ? r : 'Added');
    setEmail('');
    await store.refresh();
  }

  async function kick(m) {
    await removeMember(team.id, adminPass, m.id);
    await store.refresh();
  }
  async function toggleRole(m) {
    await setRole(team.id, adminPass, m.id, m.role === 'admin' ? 'member' : 'admin');
    await store.refresh();
  }

  return (
    <section className="main">
      <header className="main-head">
        <div>
          <h1>{team.name}</h1>
          <div className="main-sub">{members.length} member{members.length === 1 ? '' : 's'}</div>
        </div>
        {teams.length > 1 && (
          <select className="field-input" value={team.id} onChange={(e) => onSwitch(e.target.value)}>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </header>

      <div className="member-list">
        {members.map((m) => (
          <div className="member" key={m.id}>
            <span className="avatar sm">{(m.name || m.email || '?').slice(0, 1).toUpperCase()}</span>
            <div className="member-main">
              <div className="member-name">{m.name || m.email}{!m.user_id && <span className="member-pending"> · invited</span>}</div>
              <div className="member-email">{m.email}</div>
            </div>
            <span className={`role-badge ${m.role}`}>{m.role}</span>
            {unlocked && m.user_id !== team.owner_id && (
              <>
                <button className="mini" onClick={() => toggleRole(m)}>{m.role === 'admin' ? 'Make member' : 'Make admin'}</button>
                <button className="act danger small" onClick={() => kick(m)}>✕</button>
              </>
            )}
          </div>
        ))}
      </div>

      {!unlocked ? (
        <form className="team-admin" onSubmit={unlock}>
          <Icon name="settings" size={15} />
          <input type="password" value={adminPass} onChange={(e) => setAdminPass(e.target.value)} placeholder="Enter admin password to manage" />
          <button className="btn-ghost">Unlock</button>
          {err && <span className="team-err">{err}</span>}
        </form>
      ) : (
        <form className="team-admin" onSubmit={invite}>
          <Icon name="plus" size={15} />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Add member by email" />
          <button className="btn-primary">Add</button>
          {msg && <span className="team-msg">{msg}</span>}
          {err && <span className="team-err">{err}</span>}
        </form>
      )}
      <div className="dp-muted tiny" style={{ marginTop: 10 }}>Members sign in with their own Ripple account; assign them tasks from any task's Assignee field.</div>
    </section>
  );
}
