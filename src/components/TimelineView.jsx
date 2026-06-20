const DAY = 86400000;

export default function TimelineView({ store, onSelect }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tasks = store.data.tasks
    .filter((t) => !t.archived && t.due_at)
    .sort((a, b) => new Date(a.due_at) - new Date(b.due_at));

  if (!tasks.length) {
    return (
      <section className="main">
        <header className="main-head"><div><h1>Timeline</h1><div className="main-sub">Tasks across time</div></div></header>
        <div className="placeholder">No scheduled tasks yet. Give tasks a due date to see them here.</div>
      </section>
    );
  }

  const start = today.getTime();
  let end = Math.max(...tasks.map((t) => new Date(t.due_at).getTime()));
  end = Math.min(end, start + 90 * DAY);
  if (end - start < 20 * DAY) end = start + 20 * DAY;
  const span = end - start;
  const pct = (ms) => `${Math.max(0, Math.min(100, ((ms - start) / span) * 100))}%`;

  // weekly tick marks
  const ticks = [];
  for (let t = start; t <= end; t += 7 * DAY) ticks.push(t);

  return (
    <section className="main">
      <header className="main-head"><div><h1>Timeline</h1><div className="main-sub">Tasks across time · today → {new Date(end).toLocaleDateString([], { month: 'short', day: 'numeric' })}</div></div></header>

      <div className="tl">
        <div className="tl-axis">
          {ticks.map((t) => (
            <span key={t} className="tl-tick" style={{ left: pct(t) }}>{new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
          ))}
          <span className="tl-today" style={{ left: pct(start) }} />
        </div>

        {tasks.map((t) => {
          const due = new Date(t.due_at).getTime();
          const created = t.created_at ? new Date(t.created_at).getTime() : due;
          const barStart = Math.max(start, Math.min(created, due));
          const overdue = due < today.getTime() && !t.done;
          const project = store.data.projects.find((p) => p.id === t.project_id);
          const color = project?.color || 'var(--accent)';
          const left = ((barStart - start) / span) * 100;
          const width = Math.max(1.5, ((due - barStart) / span) * 100);
          return (
            <div className="tl-row" key={t.id} onClick={() => onSelect(t.id)}>
              <div className="tl-label" title={t.title}>{t.title}</div>
              <div className="tl-track">
                <div className={`tl-bar ${t.done ? 'done' : ''} ${overdue ? 'overdue' : ''}`}
                  style={{ left: left + '%', width: width + '%', '--c': color }}>
                  <span className="tl-bar-dot" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
