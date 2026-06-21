import { useRef, useState } from 'react';
import { parseQuickAdd } from '../lib/parse';
import { subtasksFor } from '../lib/store';
import { rippleBurst } from '../lib/chains';
import { PRIORITY_LABEL, STATUSES, STATUS_LABEL } from '../lib/status';

const PRIORITY_ORDER = ['high', 'normal', 'low'];

export default function TaskList({ store, tasks, title, subtitle, groupBy, mode, onMode, onSelect, selectedId, newTaskDefaults }) {
  return (
    <section className="main">
      <header className="main-head">
        <div>
          <h1>{title}</h1>
          {subtitle && <div className="main-sub">{subtitle}</div>}
        </div>
        <div className="view-toggle">
          <button className={mode === 'list' ? 'on' : ''} onClick={() => onMode('list')}>≣ List</button>
          <button className={mode === 'board' ? 'on' : ''} onClick={() => onMode('board')}>▤ Board</button>
          <button className={mode === 'calendar' ? 'on' : ''} onClick={() => onMode('calendar')}>📆 Calendar</button>
        </div>
      </header>

      {mode === 'calendar' ? (
        <Placeholder label="Calendar view is coming in the next phase." />
      ) : mode === 'board' ? (
        <Board store={store} tasks={tasks} onSelect={onSelect} selectedId={selectedId} newTaskDefaults={newTaskDefaults} />
      ) : groupBy === 'priority' ? (
        <ListByPriority store={store} tasks={tasks} onSelect={onSelect} selectedId={selectedId} newTaskDefaults={newTaskDefaults} />
      ) : groupBy === 'date' ? (
        <ListByDate store={store} tasks={tasks} onSelect={onSelect} selectedId={selectedId} />
      ) : (
        <FlatList store={store} tasks={tasks} onSelect={onSelect} selectedId={selectedId} />
      )}
    </section>
  );
}

function Placeholder({ label }) {
  return <div className="placeholder">{label}</div>;
}

function ListByPriority({ store, tasks, onSelect, selectedId, newTaskDefaults }) {
  return (
    <div className="groups">
      {PRIORITY_ORDER.map((p) => {
        const group = tasks.filter((t) => (t.priority || 'normal') === p);
        return (
          <Group
            key={p}
            label={`${PRIORITY_LABEL[p]} priority`}
            tone={p}
            tasks={group}
            store={store}
            onSelect={onSelect}
            selectedId={selectedId}
            addDefaults={{ ...newTaskDefaults, priority: p }}
          />
        );
      })}
    </div>
  );
}

function ListByDate({ store, tasks, onSelect, selectedId }) {
  const now = new Date();
  const startOfTomorrow = new Date(now); startOfTomorrow.setHours(0, 0, 0, 0); startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const endOfWeek = new Date(startOfTomorrow); endOfWeek.setDate(endOfWeek.getDate() + 6);
  const endOfNextWeek = new Date(endOfWeek); endOfNextWeek.setDate(endOfNextWeek.getDate() + 7);
  const buckets = { Tomorrow: [], 'This week': [], 'Next week': [], Later: [] };
  for (const t of tasks) {
    const d = t.due_at ? new Date(t.due_at) : null;
    if (!d) { buckets.Later.push(t); continue; }
    if (d < endOfWeek && d.toDateString() === startOfTomorrow.toDateString()) buckets.Tomorrow.push(t);
    else if (d < endOfWeek) buckets['This week'].push(t);
    else if (d < endOfNextWeek) buckets['Next week'].push(t);
    else buckets.Later.push(t);
  }
  return (
    <div className="groups">
      {Object.entries(buckets).map(([label, list]) =>
        list.length ? (
          <Group key={label} label={label} tone="normal" tasks={list} store={store} onSelect={onSelect} selectedId={selectedId} />
        ) : null
      )}
    </div>
  );
}

function FlatList({ store, tasks, onSelect, selectedId }) {
  if (!tasks.length) return <div className="placeholder">Nothing here yet.</div>;
  return (
    <div className="flat">
      {tasks.map((t) => <TaskRow key={t.id} task={t} store={store} onSelect={onSelect} selectedId={selectedId} />)}
    </div>
  );
}

function Group({ label, tone, tasks, store, onSelect, selectedId, addDefaults }) {
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');

  function submit(e) {
    e.preventDefault();
    const v = text.trim();
    if (!v) { setAdding(false); return; }
    const parsed = parseQuickAdd(v);
    store.addTask({ ...addDefaults, title: parsed.title, due_at: parsed.due_at, recurrence: parsed.recurrence });
    setText('');
  }

  return (
    <div className="group">
      <button className={`group-head tone-${tone}`} onClick={() => setOpen((v) => !v)}>
        <span className="caret">{open ? '▾' : '▸'}</span> {label}
      </button>
      {open && (
        <div className="group-body">
          {tasks.map((t) => <TaskRow key={t.id} task={t} store={store} onSelect={onSelect} selectedId={selectedId} />)}
          {addDefaults && (
            adding ? (
              <form className="newrow" onSubmit={submit}>
                <input autoFocus value={text} onChange={(e) => setText(e.target.value)} onBlur={() => !text && setAdding(false)} placeholder="Task name…  (try “review deck friday 3pm”)" />
              </form>
            ) : (
              <button className="newrow-btn" onClick={() => setAdding(true)}>＋ New task</button>
            )
          )}
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, store, onSelect, selectedId }) {
  const subs = subtasksFor(store.data, task.id);
  const project = store.data.projects.find((p) => p.id === task.project_id);
  const time = task.due_at ? new Date(task.due_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;
  const tags = (task.tags || '').split(',').map((s) => s.trim()).filter(Boolean);
  const prereq = task.depends_on ? store.data.tasks.find((p) => p.id === task.depends_on) : null;
  const locked = prereq && !prereq.done && !task.done;

  // swipe: right = complete, left = snooze to tomorrow (touch devices)
  const [dx, setDx] = useState(0);
  const sx = useRef(null), moved = useRef(false);
  const tStart = (e) => { sx.current = e.touches[0].clientX; moved.current = false; };
  const tMove = (e) => { if (sx.current == null) return; const d = e.touches[0].clientX - sx.current; if (Math.abs(d) > 8) moved.current = true; setDx(Math.max(-120, Math.min(120, d))); };
  const tEnd = () => {
    const d = dx; sx.current = null; setDx(0);
    if (d > 60 && !task.done) store.toggleTask(task.id);
    else if (d < -60) { const n = new Date(); n.setDate(n.getDate() + 1); n.setHours(9, 0, 0, 0); store.updateTask(task.id, { due_at: n.toISOString(), is_today: false }); }
  };

  return (
    <div className={`row ${selectedId === task.id ? 'sel' : ''} ${task.done ? 'done' : ''} ${locked ? 'locked' : ''}`}
      style={dx ? { transform: `translateX(${dx}px)`, transition: 'none' } : undefined}
      onTouchStart={tStart} onTouchMove={tMove} onTouchEnd={tEnd}
      onClick={() => { if (moved.current) { moved.current = false; return; } onSelect(task.id); }}>
      <button
        className={`check ${task.done ? 'checked' : ''}`}
        onClick={(e) => { e.stopPropagation(); if (!task.done) rippleBurst(e.currentTarget); store.toggleTask(task.id); }}
      />
      <span className="row-title">{task.title}</span>
      {locked && <span className="lock-chip" title={`Locked until “${prereq.title}” is done`}>🔒</span>}
      {project && <span className="proj-chip" style={{ '--c': project.color }}>{project.name}</span>}
      {tags.map((t) => <span key={t} className="tag-chip">{t}</span>)}
      <span className="row-spacer" />
      {subs.length > 0 && <span className="row-meta">☑ {subs.filter((s) => s.done).length}/{subs.length}</span>}
      {time && <span className="row-meta">{time}</span>}
      <Assignee store={store} task={task} />
    </div>
  );
}

function Assignee({ store, task }) {
  if (!task.assignee_id) return <span className="row-avatar empty" />;
  const m = (store.data.memberships || []).find((x) => x.user_id === task.assignee_id);
  const label = m ? (m.name || m.email) : '?';
  return <span className="row-avatar" title={label}>{label.slice(0, 1).toUpperCase()}</span>;
}

function Board({ store, tasks, onSelect, selectedId }) {
  return (
    <div className="board">
      {STATUSES.map((col) => {
        const list = tasks.filter((t) => (t.status || 'not_started') === col.value);
        return (
          <div className="board-col" key={col.value}>
            <div className="board-col-head">{col.label} <span>{list.length}</span></div>
            <div className="board-col-body">
              {list.map((t) => {
                const project = store.data.projects.find((p) => p.id === t.project_id);
                return (
                  <div key={t.id} className={`board-card ${selectedId === t.id ? 'sel' : ''}`} onClick={() => onSelect(t.id)}>
                    <div className="board-card-title">{t.title}</div>
                    {project && <span className="proj-chip" style={{ '--c': project.color }}>{project.name}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export { STATUS_LABEL };
