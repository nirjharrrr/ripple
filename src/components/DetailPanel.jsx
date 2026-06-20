import { useEffect, useRef, useState } from 'react';
import { subtasksFor } from '../lib/store';
import {
  PRIORITIES, PRIORITY_LABEL, STATUSES, EFFORTS, ESTIMATES,
  toLocalInput, fromLocalInput, taskStatus,
} from '../lib/status';

export default function DetailPanel({ store, task, user, onClose }) {
  const [tab, setTab] = useState('details');
  const subs = subtasksFor(store.data, task.id);
  const project = store.data.projects.find((p) => p.id === task.project_id);
  const st = taskStatus(task);

  // reset to details tab when switching tasks
  const idRef = useRef(task.id);
  if (idRef.current !== task.id) { idRef.current = task.id; if (tab !== 'details') setTab('details'); }

  function set(patch) { store.updateTask(task.id, patch); }

  return (
    <aside className="detail-panel">
      <div className="dp-toolbar">
        <span className="dp-tools">⤴ 🔗 ⋯</span>
        <button className="dp-close" onClick={onClose}>✕</button>
      </div>

      <div className="dp-titlerow">
        <button className={`check ${task.done ? 'checked' : ''}`} onClick={() => store.toggleTask(task.id)} />
        <TitleEdit task={task} set={set} />
      </div>

      <div className="dp-pillrow">
        <select className="dp-projsel" value={task.project_id || ''} onChange={(e) => set({ project_id: e.target.value })}>
          <option value="">No project</option>
          {store.data.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div className="dp-summary">
        <span className="dp-sum-item">📅 {task.due_at ? new Date(task.due_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'No date'}</span>
        <span className="dp-sum-item">🕐 {task.due_at ? new Date(task.due_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—'}</span>
        <span className={`dp-sum-item prio-${task.priority}`}>↑ {PRIORITY_LABEL[task.priority]} priority</span>
      </div>

      <div className="dp-tabs">
        {['details', 'subtasks', 'comments', 'activity'].map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}{t === 'subtasks' && subs.length ? ` ${subs.length}` : ''}
          </button>
        ))}
      </div>

      <div className="dp-body">
        {tab === 'details' && (
          <>
            <textarea
              className="dp-desc"
              placeholder="Add a description…"
              defaultValue={task.notes || ''}
              key={task.id}
              onBlur={(e) => { if (e.target.value !== (task.notes || '')) set({ notes: e.target.value }); }}
            />

            <Subtasks store={store} task={task} subs={subs} />

            <Field label="Status">
              <select value={task.status || 'not_started'} onChange={(e) => set({ status: e.target.value })}>
                {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="Assignee">
              <AssigneeSelect store={store} task={task} user={user} set={set} />
            </Field>
            <Field label="Due date">
              <input type="datetime-local" value={toLocalInput(task.due_at)} onChange={(e) => set({ due_at: fromLocalInput(e.target.value) })} />
            </Field>
            <Field label="Priority">
              <select value={task.priority || 'normal'} onChange={(e) => set({ priority: e.target.value })}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </select>
            </Field>
            <Field label="Goal">
              <select value={task.goal_id || ''} onChange={(e) => set({ goal_id: e.target.value })}>
                <option value="">No goal</option>
                {store.data.goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
              </select>
            </Field>
            <Field label="Effort">
              <select value={task.effort || ''} onChange={(e) => set({ effort: e.target.value })}>
                {EFFORTS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
              </select>
            </Field>
            <Field label="Estimate">
              <select value={task.estimate || ''} onChange={(e) => set({ estimate: e.target.value })}>
                {ESTIMATES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
              </select>
            </Field>
            <Field label="Tags">
              <input
                className="dp-tags"
                placeholder="comma, separated"
                defaultValue={task.tags || ''}
                key={'tags' + task.id}
                onBlur={(e) => { if (e.target.value !== (task.tags || '')) set({ tags: e.target.value }); }}
              />
            </Field>
            <LinkAttachments task={task} set={set} />
          </>
        )}

        {tab === 'subtasks' && <Subtasks store={store} task={task} subs={subs} expanded />}

        {tab === 'comments' && <Comments store={store} task={task} user={user} />}
        {tab === 'activity' && (
          <div className="dp-activity">
            <div>🟢 Created {new Date(task.created_at).toLocaleString()}</div>
            {task.updated_at && <div>✏️ Last updated {new Date(task.updated_at).toLocaleString()}</div>}
            {task.done && <div>✅ Completed</div>}
          </div>
        )}
      </div>
    </aside>
  );
}

function Field({ label, children }) {
  return (
    <div className="dp-field">
      <span className="dp-field-label">{label}</span>
      <span className="dp-field-val">{children}</span>
    </div>
  );
}

function TitleEdit({ task, set }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const ref = useRef(null);
  useEffect(() => { if (editing && ref.current) ref.current.select(); }, [editing]);
  useEffect(() => { setDraft(task.title); }, [task.id, task.title]);

  function commit() {
    const v = draft.trim();
    if (v && v !== task.title) set({ title: v });
    else setDraft(task.title);
    setEditing(false);
  }
  return editing ? (
    <input ref={ref} className="dp-title-edit" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(task.title); setEditing(false); } }} />
  ) : (
    <h2 className={`dp-title ${task.done ? 'done' : ''}`} onClick={() => { setDraft(task.title); setEditing(true); }}>{task.title}</h2>
  );
}

function AssigneeSelect({ store, task, user, set }) {
  const members = [];
  const seen = new Set();
  for (const m of store.data.memberships || []) {
    if (m.user_id && !seen.has(m.user_id)) { seen.add(m.user_id); members.push(m); }
  }
  if (user && !seen.has(user.id)) members.unshift({ user_id: user.id, name: user.name, email: user.email, team_id: '' });

  // No team yet → just show the current user (nobody to assign to)
  if (!(store.data.teams || []).length) {
    return <span className="dp-assignee"><span className="avatar sm">{(user?.name || '?').slice(0, 1).toUpperCase()}</span> {user?.name || user?.email}</span>;
  }

  function onChange(e) {
    const uid = e.target.value;
    if (!uid) { set({ assignee_id: '' }); return; }
    const m = members.find((x) => x.user_id === uid);
    set({ assignee_id: uid, team_id: m?.team_id || task.team_id || '' });
  }

  return (
    <select value={task.assignee_id || ''} onChange={onChange}>
      <option value="">Unassigned</option>
      {members.map((m) => (
        <option key={m.user_id} value={m.user_id}>{(m.name || m.email)}{m.user_id === user?.id ? ' (you)' : ''}</option>
      ))}
    </select>
  );
}

function LinkAttachments({ task, set }) {
  const [url, setUrl] = useState('');
  const links = (task.links || '').split('\n').map((s) => s.trim()).filter(Boolean);

  function add(e) {
    e.preventDefault();
    let v = url.trim();
    if (!v) return;
    if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
    set({ links: [...links, v].join('\n') });
    setUrl('');
  }
  function remove(i) { set({ links: links.filter((_, j) => j !== i).join('\n') }); }

  return (
    <div className="dp-links">
      <div className="dp-field-label" style={{ marginBottom: 6 }}>Attachments (links)</div>
      {links.map((l, i) => (
        <div className="dp-link" key={i}>
          <a href={l} target="_blank" rel="noreferrer" title={l}>🔗 {prettyUrl(l)}</a>
          <button className="dp-sub-del" onClick={() => remove(i)}>✕</button>
        </div>
      ))}
      <form className="dp-link-add" onSubmit={add}>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a link (Drive, Figma, doc…)" />
      </form>
      <div className="dp-muted tiny">Direct file uploads need Google Drive — paste a shared link instead.</div>
    </div>
  );
}

function prettyUrl(u) {
  try { const x = new URL(u); return x.hostname.replace(/^www\./, '') + (x.pathname !== '/' ? x.pathname : ''); }
  catch { return u; }
}

function Comments({ store, task, user }) {
  const [text, setText] = useState('');
  const list = store.data.comments
    .filter((c) => c.task_id === task.id)
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));

  function send(e) {
    e.preventDefault();
    const v = text.trim();
    if (!v) return;
    store.addComment(task.id, v, user?.name || user?.email);
    setText('');
  }

  return (
    <div className="dp-comments">
      {list.length === 0 && <div className="dp-muted">No comments yet.</div>}
      {list.map((c) => (
        <div className="dp-comment" key={c.id}>
          <span className="avatar sm">{(c.author || '?').slice(0, 1).toUpperCase()}</span>
          <div className="dp-comment-body">
            <div className="dp-comment-head"><b>{c.author || 'You'}</b> <span>{new Date(c.created_at).toLocaleString()}</span>
              <button className="dp-sub-del" onClick={() => store.deleteComment(c.id)}>✕</button>
            </div>
            <div className="dp-comment-text">{c.body}</div>
          </div>
        </div>
      ))}
      <form className="dp-comment-add" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment…" />
        <button className="btn-primary" disabled={!text.trim()}>Send</button>
      </form>
    </div>
  );
}

function Subtasks({ store, task, subs, expanded }) {
  const [text, setText] = useState('');
  function add(e) {
    e.preventDefault();
    const v = text.trim();
    if (!v) return;
    store.addSubtask(task.id, v);
    setText('');
  }
  return (
    <div className={`dp-subs ${expanded ? 'exp' : ''}`}>
      {!expanded && <div className="dp-subs-label">Subtasks</div>}
      {subs.map((s) => (
        <div key={s.id} className={`dp-sub ${s.done ? 'done' : ''}`}>
          <button className={`check sm ${s.done ? 'checked' : ''}`} onClick={() => store.toggleSubtask(s.id)} />
          <span className="dp-sub-title" onClick={() => { const v = prompt('Edit subtask', s.title); if (v && v.trim()) store.updateSubtask(s.id, { title: v.trim() }); }}>{s.title}</span>
          <button className="dp-sub-del" onClick={() => store.deleteSubtask(s.id)}>✕</button>
        </div>
      ))}
      <form className="dp-sub-add" onSubmit={add}>
        <span>＋</span>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add subtask" />
      </form>
    </div>
  );
}
