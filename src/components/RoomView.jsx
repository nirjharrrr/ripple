import { useEffect, useRef, useState } from 'react';
import { verifyAdmin, addMember, removeMember, setRole, fetchRoomMessages, uploadFile } from '../lib/api';
import { markRoomRead } from '../lib/chat';
import { renderMarkdown } from '../lib/markdown';
import TaskList from './TaskList';
import Icon from './Icon';

const TABS = ['Overview', 'Tasks', 'Chat', 'Notes', 'Decisions', 'Files', 'Members'];

export default function RoomView({ store, room, user, onSelect, selectedId }) {
  const [tab, setTab] = useState('Overview');
  const [mode, setMode] = useState('list');

  const roomTasks = store.data.tasks.filter((t) => t.team_id === room.id && !t.archived);
  const open = roomTasks.filter((t) => !t.done);
  const done = roomTasks.filter((t) => t.done);
  const members = (store.data.memberships || []).filter((m) => m.team_id === room.id);
  const decisions = (store.data.decisions || []).filter((d) => d.team_id === room.id);
  const files = (store.data.files || []).filter((f) => f.team_id === room.id);
  const messages = (store.data.messages || []).filter((m) => m.team_id === room.id);
  const lastActivity = roomTasks.map((t) => t.updated_at).filter(Boolean).sort().slice(-1)[0];

  return (
    <section className="main room">
      <header className="room-head">
        <div className="room-title"><span className="room-badge"><Icon name="rooms" size={18} /></span><h1>{room.name}</h1></div>
        <div className="room-tabs">
          {TABS.map((t) => {
            const n = t === 'Members' ? members.length : t === 'Decisions' ? decisions.length : t === 'Files' ? files.length : t === 'Chat' ? messages.length : 0;
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
            <button onClick={() => setTab('Chat')}><Icon name="team" size={15} /> Open chat</button>
            <button onClick={() => setTab('Decisions')}><Icon name="completed" size={15} /> Log decision</button>
          </div>

          <h3 className="an-h">Room summary</h3>
          <div className="room-summary">
            <div className="rs-row"><b>{open.length}</b> open task{open.length === 1 ? '' : 's'}{open.length > 0 && <span className="rs-list"> — {open.slice(0, 5).map((t) => t.title).join(', ')}{open.length > 5 ? '…' : ''}</span>}</div>
            <div className="rs-row"><b>{done.length}</b> completed</div>
            <div className="rs-row"><b>{decisions.length}</b> decision{decisions.length === 1 ? '' : 's'} logged · <b>{messages.length}</b> chat message{messages.length === 1 ? '' : 's'} · <b>{files.length}</b> file{files.length === 1 ? '' : 's'}</div>
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
      {tab === 'Chat' && <RoomChat store={store} room={room} user={user} members={members} messages={messages} />}
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
          {openId === n.id && <RoomNoteBody note={n} store={store} />}
        </div>
      ))}
    </div>
  );
}

function RoomNoteBody({ note, store }) {
  const [body, setBody] = useState(note.body || '');
  const [editing, setEditing] = useState(!(note.body || '').trim());
  function saveBody() { if (body !== (note.body || '')) store.updateNote(note.id, { body }); }
  return (
    <div className="room-note-body">
      <div className="note-edit-toolbar">
        <input className="note-title-input" defaultValue={note.title} onBlur={(e) => e.target.value !== note.title && store.updateNote(note.id, { title: e.target.value })} placeholder="Title" />
        <div className="seg note-seg">
          <button className={editing ? 'on' : ''} onClick={() => setEditing(true)}>Write</button>
          <button className={!editing ? 'on' : ''} onClick={() => { saveBody(); setEditing(false); }}>Preview</button>
        </div>
      </div>
      {editing ? (
        <textarea className="note-body-input" value={body} onChange={(e) => setBody(e.target.value)} onBlur={saveBody} placeholder="Write… (Markdown — # headings, - lists, **bold**, [link](url))" />
      ) : (
        <div className="note-rendered md" onClick={() => setEditing(true)} dangerouslySetInnerHTML={{ __html: renderMarkdown(body) || '<p class="dp-muted">Nothing yet — click to write.</p>' }} />
      )}
    </div>
  );
}

/* ---------- Chat ---------- */
function RoomChat({ store, room, user, members, messages }) {
  const [text, setText] = useState('');
  const author = user?.name || user?.email;
  const myMembership = members.find((m) => m.user_id === user?.id);
  const muted = String(myMembership?.muted) === 'true';
  const sorted = [...messages].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  const endRef = useRef(null);
  const lastSeen = useRef('');
  const inputRef = useRef(null);
  const [mention, setMention] = useState(null); // { query, index } while typing "@…"

  // members you can @-mention (accepted, have an account)
  const mentionMembers = members.filter((m) => m.user_id);
  const mentionToken = (m) => (m.name ? m.name.replace(/\s+/g, '') : (m.email || '').split('@')[0]);
  const suggestions = mention
    ? mentionMembers.filter((m) => {
        const name = (m.name || '').toLowerCase().replace(/\s+/g, '');
        const local = (m.email || '').toLowerCase().split('@')[0];
        return name.startsWith(mention.query) || local.startsWith(mention.query);
      }).slice(0, 6)
    : [];
  const activeIdx = mention ? Math.min(mention.index, Math.max(0, suggestions.length - 1)) : 0;

  // fast-poll this room's messages while the Chat tab is open (~3.5s)
  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const since = store.data.messages.filter((m) => m.team_id === room.id)
          .map((m) => m.created_at).sort().slice(-1)[0] || '';
        const r = await fetchRoomMessages(room.id, since);
        if (alive && r && r.messages) store.mergeMessages(r.messages);
      } catch { /* offline — the 20s full sync will catch up */ }
    }
    const id = setInterval(poll, 3500);
    poll();
    return () => { alive = false; clearInterval(id); };
  }, [room.id]); // eslint-disable-line

  // mark read + keep scrolled to the newest message
  useEffect(() => {
    const newest = sorted.length ? sorted[sorted.length - 1].created_at : '';
    if (newest !== lastSeen.current) {
      lastSeen.current = newest;
      markRoomRead(room.id, newest || new Date().toISOString());
      endRef.current?.scrollIntoView({ block: 'end' });
    }
  }); // run every render; cheap guard above prevents churn

  function send(e) {
    e.preventDefault();
    const v = text.trim();
    if (!v) return;
    store.addMessage(room.id, v, author);
    setText('');
    setMention(null);
  }

  function onChange(e) {
    const v = e.target.value;
    setText(v);
    const caret = e.target.selectionStart ?? v.length;
    const m = v.slice(0, caret).match(/@([\p{L}0-9._-]*)$/u); // active "@token" right before the caret
    setMention(m ? { query: m[1].toLowerCase(), index: 0 } : null);
  }

  function applyMention(m) {
    const input = inputRef.current;
    const caret = input ? (input.selectionStart ?? text.length) : text.length;
    const before = text.slice(0, caret).replace(/@([\p{L}0-9._-]*)$/u, '@' + mentionToken(m) + ' ');
    const next = before + text.slice(caret);
    setText(next);
    setMention(null);
    requestAnimationFrame(() => { if (input) { input.focus(); input.setSelectionRange(before.length, before.length); } });
  }

  function onKeyDown(e) {
    if (!suggestions.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setMention((s) => ({ ...s, index: (activeIdx + 1) % suggestions.length })); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setMention((s) => ({ ...s, index: (activeIdx - 1 + suggestions.length) % suggestions.length })); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); applyMention(suggestions[activeIdx]); }
    else if (e.key === 'Escape') { setMention(null); }
  }

  const mentionables = mentionMembers.map(mentionToken).filter(Boolean);

  return (
    <div className="chat">
      <div className="chat-bar">
        <span className="chat-bar-label">{muted ? 'Notifications muted for this room' : 'You’re notified on @mentions'}</span>
        <button className={`chat-mute ${muted ? 'on' : ''}`} onClick={() => store.muteRoom(room.id, !muted)} title={muted ? 'Unmute this room' : 'Mute @mention notifications'}>
          <Icon name={muted ? 'belloff' : 'bell'} size={15} /> {muted ? 'Muted' : 'Mute'}
        </button>
      </div>
      <div className="chat-stream">
        {sorted.length === 0 && <div className="placeholder">No messages yet. Say hello 👋</div>}
        {sorted.map((m, i) => {
          const mine = m.user_id === user?.id || (!m.user_id && m.author === author);
          const prev = sorted[i - 1];
          const grouped = prev && prev.author === m.author && (new Date(m.created_at) - new Date(prev.created_at)) < 4 * 60000;
          return (
            <div key={m.id} className={`chat-msg ${mine ? 'mine' : ''} ${grouped ? 'grouped' : ''}`}>
              {!grouped && <span className="avatar sm chat-av">{(m.author || '?').slice(0, 1).toUpperCase()}</span>}
              <div className="chat-bubble-wrap">
                {!grouped && <div className="chat-meta"><b>{m.author || 'Someone'}</b> <span>{when(m.created_at)}</span></div>}
                <div className="chat-bubble">{renderBody(m.body)}{mine && <button className="chat-del" title="Delete" onClick={() => store.deleteMessage(m.id)}>✕</button>}</div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form className="chat-input" onSubmit={send}>
        {suggestions.length > 0 && (
          <div className="mention-pop">
            {suggestions.map((m, i) => (
              <button type="button" key={m.user_id} className={`mention-opt ${i === activeIdx ? 'on' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); applyMention(m); }}>
                <span className="avatar sm">{(m.name || m.email || '?').slice(0, 1).toUpperCase()}</span>
                <span className="mention-name">{m.name || m.email}</span>
                <span className="mention-handle">@{mentionToken(m)}</span>
              </button>
            ))}
          </div>
        )}
        <input ref={inputRef} value={text} onChange={onChange} onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setMention(null), 120)} placeholder="Message the room…  (@name to notify)" />
        <button className="btn-primary" disabled={!text.trim()}><Icon name="upcoming" size={16} /></button>
      </form>
      {mentionables.length > 0 && <div className="chat-hint">Tip: type <b>@{mentionables[0]}</b> to notify a teammate by email + push.</div>}
    </div>
  );
}

// Highlight @mentions in a message body.
function renderBody(body) {
  const parts = String(body || '').split(/(@[a-z0-9._-]+)/gi);
  return parts.map((p, i) => (/^@[a-z0-9._-]+$/i.test(p) ? <span key={i} className="chat-mention">{p}</span> : p));
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

/* ---------- Files (upload to Drive, or paste a link) ---------- */
const MAX_UPLOAD = 8 * 1024 * 1024; // 8 MB — keeps the base64 POST within Apps Script limits

function RoomFiles({ store, room }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState('');   // current upload filename
  const [err, setErr] = useState('');
  const fileRef = useRef(null);
  const files = store.data.files.filter((f) => f.team_id === room.id).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  function add(e) {
    e.preventDefault(); let u = url.trim(); if (!u) return;
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    store.addFile(room.id, name.trim() || u, u); setName(''); setUrl('');
  }
  async function onPick(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setErr('');
    if (file.size > MAX_UPLOAD) { setErr(`“${file.name}” is ${(file.size / 1048576).toFixed(1)} MB — uploads are capped at 8 MB. Paste a link instead.`); return; }
    setBusy(file.name);
    try {
      const dataBase64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onerror = () => reject(new Error('could not read file'));
        r.onload = () => resolve(String(r.result).split(',')[1] || '');
        r.readAsDataURL(file);
      });
      const res = await uploadFile(room.id, file.name, dataBase64, file.type);
      if (res && res.url) store.addFile(room.id, res.name || file.name, res.url);
      else setErr('Upload failed — the room owner may need to authorize Drive.');
    } catch (e2) {
      setErr(String(e2.message || e2).replace(/^Error:\s*/, ''));
    } finally { setBusy(''); }
  }
  return (
    <div className="room-pane">
      <div className="file-actions">
        <button className="btn-primary" onClick={() => fileRef.current?.click()} disabled={!!busy}>
          <Icon name="plus" size={14} /> {busy ? `Uploading ${busy}…` : 'Upload file'}
        </button>
        <input ref={fileRef} type="file" hidden onChange={onPick} />
        <span className="file-or">or paste a link</span>
      </div>
      <form className="file-new" onSubmit={add}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Label (optional)" />
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a link (Drive, Figma, doc…)" />
        <button className="btn-ghost" disabled={!url.trim()}>Add link</button>
      </form>
      {err && <div className="auth-error">{err}</div>}
      {files.length === 0 && <div className="placeholder">No files yet. Upload a file (≤8 MB) or paste a shared link.</div>}
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
              <div className="member-name">{m.name || m.email}{m.status === 'pending' && <span className="member-pending"> · pending</span>}</div>
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
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Invite by email — they’ll get an accept link" />
          <button className="btn-primary">Send invite</button>
          {msg && <span className="team-msg">{msg}</span>}
          {err && <span className="team-err">{err}</span>}
        </form>
      )}
    </div>
  );
}
