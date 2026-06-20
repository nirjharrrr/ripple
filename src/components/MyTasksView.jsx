import { useState } from 'react';

const PRIO_DOT = { high: 'var(--high)', normal: 'var(--med)', low: 'var(--low)' };

export default function MyTasksView({ store, user, onSelect, selectedId }) {
  const now = new Date();
  const startToday = new Date(now); startToday.setHours(0, 0, 0, 0);

  const mine = store.data.tasks.filter((t) => !t.archived && (t.assignee_id === user?.id || t.user_id === user?.id));

  const sections = { Today: [], Overdue: [], Upcoming: [], Completed: [] };
  for (const t of mine) {
    if (t.done) { sections.Completed.push(t); continue; }
    const due = t.due_at ? new Date(t.due_at) : null;
    if (due && due < now) sections.Overdue.push(t);
    else if (t.is_today || (due && due.toDateString() === now.toDateString())) sections.Today.push(t);
    else if (due && due > startToday) sections.Upcoming.push(t);
    else sections.Today.push(t); // no date, flagged-ish → keep in Today bucket
  }
  sections.Completed.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));

  return (
    <section className="main">
      <header className="main-head">
        <div><h1>My tasks</h1><div className="main-sub">Everything assigned to you, across every room</div></div>
      </header>

      {['Overdue', 'Today', 'Upcoming', 'Completed'].map((key) => {
        const list = sections[key];
        if (!list.length) return null;
        return (
          <div className="mt-section" key={key}>
            <div className={`mt-head ${key === 'Overdue' ? 'overdue' : ''}`}>{key} <span>{list.length}</span></div>
            {list.slice(0, key === 'Completed' ? 20 : 999).map((t) => (
              <Row key={t.id} t={t} store={store} onSelect={onSelect} selectedId={selectedId} />
            ))}
          </div>
        );
      })}
      {mine.length === 0 && <div className="placeholder">No tasks assigned to you yet.</div>}
    </section>
  );
}

function Row({ t, store, onSelect, selectedId }) {
  const room = store.data.teams?.find((r) => r.id === t.team_id);
  const time = t.due_at ? new Date(t.due_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : null;
  return (
    <div className={`row ${selectedId === t.id ? 'sel' : ''} ${t.done ? 'done' : ''}`} onClick={() => onSelect(t.id)}>
      <button className={`check ${t.done ? 'checked' : ''}`} onClick={(e) => { e.stopPropagation(); store.toggleTask(t.id); }} />
      {!t.done && <span className="prio-dot" style={{ background: PRIO_DOT[t.priority] || 'var(--med)' }} />}
      <span className="row-title">{t.title}</span>
      {room && <span className="room-source"><span className="rs-dot" />{room.name}</span>}
      <span className="row-spacer" />
      {time && <span className="row-meta">{time}</span>}
    </div>
  );
}
