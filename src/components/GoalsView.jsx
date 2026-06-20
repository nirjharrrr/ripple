import { useState } from 'react';

export default function GoalsView({ store, onSelectTask }) {
  const { goals, tasks } = store.data;
  const [name, setName] = useState('');

  function add(e) {
    e.preventDefault();
    const v = name.trim();
    if (v) store.addGoal(v);
    setName('');
  }

  return (
    <section className="main">
      <header className="main-head"><div><h1>Goals</h1><div className="main-sub">Outcomes your tasks ladder up to</div></div></header>

      <form className="goal-add" onSubmit={add}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New goal — e.g. Launch Ripple" />
        <button className="btn-primary" disabled={!name.trim()}>Add goal</button>
      </form>

      {goals.length === 0 && <div className="placeholder">No goals yet. Add one above, then link tasks to it from the task detail panel.</div>}

      <div className="goal-list">
        {goals.map((g) => {
          const linked = tasks.filter((t) => t.goal_id === g.id && !t.archived);
          const done = linked.filter((t) => t.done).length;
          const pct = linked.length ? Math.round((done / linked.length) * 100) : 0;
          return (
            <div className="goal-card" key={g.id}>
              <div className="goal-card-head">
                <h3>{g.title}</h3>
                <button className="act danger small" onClick={() => store.deleteGoal(g.id)}>✕</button>
              </div>
              <div className="goal-progress">
                <div className="goal-track"><div className="goal-fill" style={{ width: pct + '%' }} /></div>
                <span className="goal-pct">{done}/{linked.length} · {pct}%</span>
              </div>
              <div className="goal-tasks">
                {linked.map((t) => (
                  <button key={t.id} className={`goal-task ${t.done ? 'done' : ''}`} onClick={() => onSelectTask(t.id)}>
                    <span className={`check sm ${t.done ? 'checked' : ''}`} onClick={(e) => { e.stopPropagation(); store.toggleTask(t.id); }} />
                    {t.title}
                  </button>
                ))}
                {linked.length === 0 && <span className="dp-muted">No tasks linked yet.</span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
