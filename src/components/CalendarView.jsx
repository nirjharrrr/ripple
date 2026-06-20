import { useState } from 'react';
import { getPrefs } from '../lib/settings';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function CalendarView({ store, onSelect }) {
  const weekStart = getPrefs().weekStart; // 0 Sun, 1 Mon
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() - weekStart + 7) % 7;
  const gridStart = new Date(first); gridStart.setDate(first.getDate() - startOffset);

  const tasks = store.data.tasks.filter((t) => !t.archived && t.due_at);
  const byDay = {};
  for (const t of tasks) {
    const k = new Date(t.due_at).toDateString();
    (byDay[k] = byDay[k] || []).push(t);
  }

  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart); d.setDate(gridStart.getDate() + i);
    cells.push(d);
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const orderedNames = [...dayNames.slice(weekStart), ...dayNames.slice(0, weekStart)];

  return (
    <section className="main">
      <header className="main-head">
        <div><h1>Calendar</h1><div className="main-sub">{MONTHS[month]} {year}</div></div>
        <div className="cal-nav">
          <button onClick={() => setCursor(new Date(year, month - 1, 1))}>‹</button>
          <button onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}>Today</button>
          <button onClick={() => setCursor(new Date(year, month + 1, 1))}>›</button>
        </div>
      </header>

      <div className="cal-grid">
        {orderedNames.map((n) => <div key={n} className="cal-dow">{n}</div>)}
        {cells.map((d) => {
          const inMonth = d.getMonth() === month;
          const isToday = d.getTime() === today.getTime();
          const items = byDay[d.toDateString()] || [];
          return (
            <div key={d.toISOString()} className={`cal-cell ${inMonth ? '' : 'dim'} ${isToday ? 'today' : ''}`}>
              <div className="cal-date">{d.getDate()}</div>
              <div className="cal-items">
                {items.slice(0, 4).map((t) => {
                  const proj = store.data.projects.find((p) => p.id === t.project_id);
                  return (
                    <button key={t.id} className={`cal-item ${t.done ? 'done' : ''}`} style={{ '--c': proj?.color || 'var(--accent)' }} onClick={() => onSelect(t.id)}>
                      {t.title}
                    </button>
                  );
                })}
                {items.length > 4 && <span className="cal-more">+{items.length - 4} more</span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
