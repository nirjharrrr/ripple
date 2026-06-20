import { useState } from 'react';
import { verifyAdmin, addMember, removeMember, setRole } from '../lib/api';
import TaskList from './TaskList';
import Icon from './Icon';

const TABS = ['Overview', 'Tasks', 'Notes', 'Discussions', 'Decisions', 'Files', 'Members'];

export default function RoomView({ store, room, user, onSelect, selectedId }) {
  const [tab, setTab] = useState('Overview');
  const [mode, setMode] = useState('list');

  const roomTasks = store.data.tasks.filter((t) => t.team_id === room.id && !t.archived);
  const open = roomTasks.filter((t) => !t.done);
  const done = roomTasks.filter((t) => t.done);
  const members = (store.data.memberships || []).filter((m) => m.team_id === room.id);
  const decisions = (store.data.decisions || []).filter((d) => d.team_id === room.id);
  const files = (store.data.files || []).filter((f) => f.team_id === room.id);
  const threads = (store.data.discussions || []).filter((d) => d.team_id === room.id && !d.parent_id);
  const lastActivity = roomTasks.map((t) => t.updated_at).filter(Boolean).sort().slice(-1)[0];

  return (
    <section className="main room">
      <header className="room-head">
        <div className="room-title"><span className="room-badge"><Icon name="rooms" size={18} /></span><h1>{room.name}</h1></div>
        <div className="room-tabs">
          {TABS.map((t) => {
            const n = t === 'Members' ? members.length : t === 'Decisions' ? decisions.length : t === 'Files' ? files.length : t === 'Discussions' ? threads.length : 0;
            return <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}{n ? ` ${n}` : ''}</button>;
          })}
        </div>
      </header>

      {tab === 'Overview' && (
        <div className="room-overview">
          <div className="stat-grid">
            <Stat label="Open tasks" value={open.length} />
            <Stat label="Completed" value={done.length} />
            <Stat label="Decisions" value={decisions.length} />
            <Stat label="Members" value={members.length} />
            <Stat label="Last activity" value={lastActivity ? new Date(lastActivity).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '—'} />
          </div>

          <h3 className="an-h">Quick actions</h3>
          <div className="quick-actions">
            <button onClick={() => setTab('Tasks')}><Icon name="plus" size={15} /> Add task</button>
            <button onClick={() => setTab('Notes')}><Icon name="notes" size={15} /> Create note</button>
            <button onClick={() => setTab('Files')}><Icon name="rooms" size={15} /> Add file</button>
            <button onClick={() => setTab('Discussions')}><Icon name="team" size={15} /> Start discussion</button>
            <button onClick={() => setTab('Decisions')}><Icon name="completed" size={15} /> Log decision</button>
          </div>

          <h3 className="an-h">Room summary</h3>
          <div className="room-summary">
            <div className="rs-row"><b>{open.length}</b> open task{open.length === 1 ? '' : 's'}{open.length > 0 && <span className="rs-list"> — {open.slice(0, 5).map((t) => t.title).join(', ')}{open.length > 5 ? '…' : ''}</span>}</div>
            <div className="rs-row"><b>{done.length}</b> completed</div>
            <div className="rs-row"><b>{decisions.length}</b> decision{decisions.length === 1 ? '' : 's'} logged · <b>{threads.length}</b> discussion{threads.length === 1 ? '' : 's'} · <b>{files.length}</b> file{files.length === 1 ? '' : 's'}</div>
            <div className="rs-row"><b>{members.length}</b> member{members.length === 1 ? '' : 's'} — {members.map((m) => m.name || m.email).join(', ')}</div>
            <div className="rs-row rs-muted">Computed from room data — no AI.</div>
          </div>
        </div>
      )}

      {tab === 'Tasks' && (
        <TaskList store={store} tasks={sortByPriority(open)} title="" subtitle=""
          groupBy="priority" mode={mode} onMode={setMode}
          onSelect={onSelect} selectedId={selectedId}
          newTaskDefaults={{ team_id: room.id, is_today: false }} />
      )}

      {tab === 'Notes' && <RoomNotes store={store} room={room} />}
      {tab === 'Discussions' && <RoomDiscussions store={store} room={room} user={user} />}
      {tab === 'Decisions' && <RoomDecisions store={store} room={room} user={user} />}
      {tab === 'Files' && <RoomFiles store={store} room={room} />}
      {tab === 'Members' && <Members store={store} room={room} members={members} />}
    </section>
  );
}

function Stat({ label, value }) {
  return <div className="stat"><div className="stat-val">{value}</div><div className="stat-lbl">{label}</div></div>;
}
function sortByPriority(list) {
  const rank = { high: 2, normal: 1, low: 0 };
  return [...list].sort((a, b) => (rank[b.priority] ?? 1) - (rank[a.priority] ?? 1));
}
function when(iso) { return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }

/* ---------- Notes ---------- */
function RoomNotes({ store, room }) {
  const notes = store.data.notes.filter((n) => n.team_id === room.id).sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  const [openId, setOpenId] = useState(null);
  return (
    <div className="room-pane">
      <button className="pane-add" onClick={() => { const n = store.addNote('Untitled', '', room.id); setOpenId(n.id); }}><Icon name="plus" size={14} /> New note</button>
      {notes.length === 0 && <div className="placeholder">No notes in this room yet.</div>}
      {notes.map((n) => (
        <div className="room-note" key={n.id}>
          <div className="room-note-head" onClick={() => setOpenId(openId === n.id ? null : n.id)}>
            <span className="room-note-title">{n.title || 'Untitled'}</span>
            <span className="room-note-when">{n.updated_at ? when(n.updated_at) : ''}</span>
            <button className="act danger small" onClick={(e) => { e.stopPropagation(); store.deleteNote(n.id); }}>✕</button>
          </div>
          {openId === n.id && (
            <div className="room-note-body">
              <input className="note-title-input" defaultValue={n.title} onBlur={(e) => e.target.value !== n.title && store.updateNote(n.id, { title: e.target.value })} placeholder="Title" />
              <textarea className="note-body-input" defaultValue={n.body || ''} onBlur={(e) => e.target.value !== (n.body || '') && store.updateNote(n.id, { body: e.target.value })} placeholder="Write… (Markdown supported)" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------- Discussions ---------- */
function RoomDiscussions({ store, room, user }) {
  const [text, setText] = useState('');
  const all = store.data.discussions.filter((d) => d.team_id === room.id);
  const threads = all.filter((d) => !d.parent_id).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  const author = user?.name || user?.email;

  function post(e) { e.preventDefault(); const v = text.trim(); if (!v) return; store.addDiscussion(room.id, v, author); setText(''); }

  return (
    <div className="room-pane">
      <form className="disc-new" onSubmit={post}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Start a discussion…" />
        <button className="btn-primary" disabled={!text.trim()}>Post</button>
      </form>
      {threads.length === 0 && <div className="placeholder">No discussions yet.</div>}
      {threads.map((th) => (
        <Thread key={th.id} thread={th} replies={all.filter((d) => d.parent_id === th.id)} store={store} room={room} author={author} />
      ))}
    </div>
  );
}
function Thread({ thread, replies, store, room, author }) {
  const [reply, setReply] = useState('');
  function send(e) { e.preventDefault(); const v = reply.trim(); if (!v) return; store.addDiscussion(room.id, v, author, thread.id); setReply(''); }
  return (
    <div className="thread">
      <div className="msg">
        <span className="avatar sm">{(thread.author || '?').slice(0, 1).toUpperCase()}</span>
        <div className="msg-body"><div className="msg-head"><b>{thread.author || 'Someone'}</b> <span>{when(thread.created_at)}</span>
          <button className="act danger small" onClick={() => store.deleteDiscussion(thread.id)}>✕</button></div>
          <div className="msg-text">{thread.body}</div></div>
      </div>
      <div className="replies">
        {replies.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '')).map((r) => (
          <div className="msg reply" key={r.id}>
            <span className="avatar sm">{(r.author || '?').slice(0, 1).toUpperCase()}</span>
            <div className="msg-body"><div className="msg-head"><b>{r.author || 'Someone'}</b> <span>{when(r.created_at)}</span></div><div className="msg-text">{r.body}</div></div>
          </div>
        ))}
        <form className="reply-add" onSubmit={send}>
          <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply…" />
        </form>
      </div>
    </div>
  );
}

/* ---------- Decisions ---------- */
function RoomDecisions({ store, room, user }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const decisions = store.data.decisions.filter((d) => d.team_id === room.id).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  function add(e) { e.preventDefault(); const t = title.trim(); if (!t) return; store.addDecision(room.id, t, body.trim(), user?.name || user?.email); setTitle(''); setBody(''); }
  return (
    <div className="room-pane">
      <form className="decision-new" onSubmit={add}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Decision — e.g. Delay launch by one week" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Reason / context (optional)" />
        <div className="create-room-actions"><button className="btn-primary" disabled={!title.trim()}>Log decision</button></div>
      </form>
      {decisions.length === 0 && <div className="placeholder">No decisions logged. The decision log is your team's permanent memory.</div>}
      {decisions.map((d) => (
        <div className="decision" key={d.id}>
          <div className="decision-head"><Icon name="completed" size={15} /><b>{d.title}</b>
            <button className="act danger small" onClick={() => store.deleteDecision(d.id)}>✕</button></div>
          {d.body && <div className="decision-body">{d.body}</div>}
          <div className="decision-meta">{d.author || 'Someone'} · {when(d.created_at)}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Files (links) ---------- */
function RoomFiles({ store, room }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const files = store.data.files.filter((f) => f.team_id === room.id).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  function add(e) {
    e.preventDefault(); let u = url.trim(); if (!u) return;
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    store.addFile(room.id, name.trim() || u, u); setName(''); setUrl('');
  }
  return (
    <div className="room-pane">
      <form className="file-new" onSubmit={add}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Label (optional)" />
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a link (Drive, Figma, doc…)" />
        <button className="btn-primary" disabled={!url.trim()}>Add</button>
      </form>
      {files.length === 0 && <div className="placeholder">No files yet. Paste a shared link (direct uploads need Google Drive).</div>}
      {files.map((f) => (
        <div className="file-row" key={f.id}>
          <Icon name="notes" size={15} />
          <a href={f.url} target="_blank" rel="noreferrer">{f.name}</a>
          <span className="row-spacer" />
          <span className="row-meta">{when(f.created_at)}</span>
          <button className="act danger small" onClick={() => store.deleteFile(f.id)}>✕</button>
        </div>
      ))}
    </div>
  );
}

/* ---------- Members ---------- */
function Members({ store, room, members }) {
  const [adminPass, setAdminPass] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function unlock(e) { e.preventDefault(); setErr(''); const r = await verifyAdmin(room.id, adminPass); if (r && r.valid) setUnlocked(true); else setErr('Admin passcode incorrect'); }
  async function invite(e) { e.preventDefault(); setErr(''); setMsg(''); const r = await addMember(room.id, adminPass, email.trim()); if (r === null) { setErr('Could not add member'); return; } setMsg(typeof r === 'string' ? r : 'Added'); setEmail(''); await store.refresh(); }
  async function kick(m) { await removeMember(room.id, adminPass, m.id); await store.refresh(); }
  async function toggleRole(m) { await setRole(room.id, adminPass, m.id, m.role === 'admin' ? 'member' : 'admin'); await store.refresh(); }

  return (
    <div className="room-members room-pane">
      <div className="member-list">
        {members.map((m) => (
          <div className="member" key={m.id}>
            <span className="avatar sm">{(m.name || m.email || '?').slice(0, 1).toUpperCase()}</span>
            <div className="member-main">
              <div className="member-name">{m.name || m.email}{!m.user_id && <span className="member-pending"> · invited</span>}</div>
              <div className="member-email">{m.email}</div>
            </div>
            <span className={`role-badge ${m.role}`}>{m.role}</span>
            {unlocked && m.user_id !== room.owner_id && (
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
          <input type="password" value={adminPass} onChange={(e) => setAdminPass(e.target.value)} placeholder="Enter admin passcode to manage" />
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
    </div>
  );
}
