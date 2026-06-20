import { useState } from 'react';

function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }

function streakOf(days) {
  const set = new Set(days);
  let s = 0;
  for (let i = 0; i < 365; i++) { if (set.has(daysAgo(i))) s++; else break; }
  return s;
}

export default function HabitsView({ store }) {
  const { habits } = store.data;
  const [name, setName] = useState('');
  const today = daysAgo(0);
  const last7 = Array.from({ length: 7 }, (_, i) => daysAgo(6 - i));

  function add(e) {
    e.preventDefault();
    const v = name.trim();
    if (v) store.addHabit(v);
    setName('');
  }

  return (
    <section className="main">
      <header className="main-head"><div><h1>Habits</h1><div className="main-sub">Small things, done daily</div></div></header>

      <form className="goal-add" onSubmit={add}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New habit — e.g. Read 20 min" />
        <button className="btn-primary" disabled={!name.trim()}>Add habit</button>
      </form>

      {habits.length === 0 && <div className="placeholder">No habits yet. Add one above.</div>}

      <div className="habit-list">
        {habits.map((h) => {
          const days = (h.log || '').split(',').map((s) => s.trim()).filter(Boolean);
          const set = new Set(days);
          const doneToday = set.has(today);
          const streak = streakOf(days);
          return (
            <div className="habit-card" key={h.id}>
              <button className={`check ${doneToday ? 'checked' : ''}`} onClick={() => store.toggleHabitToday(h.id)} />
              <div className="habit-main">
                <div className="habit-name">{h.name}</div>
                <div className="habit-week">
                  {last7.map((d) => (
                    <span key={d} className={`habit-dot ${set.has(d) ? 'on' : ''} ${d === today ? 'today' : ''}`} title={d} />
                  ))}
                </div>
              </div>
              <div className="habit-streak">🔥 {streak}</div>
              <button className="act danger small" onClick={() => store.deleteHabit(h.id)}>✕</button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
