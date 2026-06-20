import { useMemo } from 'react';

export default function Analytics({ store }) {
  const stats = useMemo(() => compute(store.data.tasks), [store.data.tasks]);

  return (
    <section className="main">
      <header className="main-head"><div><h1>Analytics</h1><div className="main-sub">Your productivity at a glance</div></div></header>

      <div className="stat-grid">
        <Stat label="Completed" value={stats.completed} />
        <Stat label="Active" value={stats.active} />
        <Stat label="Completion rate" value={stats.rate + '%'} />
        <Stat label="Current streak" value={stats.streak + (stats.streak === 1 ? ' day' : ' days')} />
      </div>

      <h3 className="an-h">Completed — last 14 days</h3>
      <div className="bars">
        {stats.daily.map((d) => (
          <div className="bar-col" key={d.key} title={`${d.label}: ${d.count}`}>
            <div className="bar" style={{ height: Math.max(4, d.count * 22) + 'px' }} />
            <span className="bar-lbl">{d.label}</span>
          </div>
        ))}
      </div>

      <h3 className="an-h">By priority (active)</h3>
      <div className="an-rows">
        {stats.byPriority.map((p) => (
          <div className="an-row" key={p.key}>
            <span className="an-row-lbl">{p.label}</span>
            <div className="an-track"><div className={`an-fill p-${p.key}`} style={{ width: (stats.active ? (p.count / stats.active) * 100 : 0) + '%' }} /></div>
            <span className="an-row-val">{p.count}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Stat({ label, value }) {
  return <div className="stat"><div className="stat-val">{value}</div><div className="stat-lbl">{label}</div></div>;
}

function compute(tasks) {
  const live = tasks.filter((t) => !t.archived);
  const completed = live.filter((t) => t.done);
  const active = live.filter((t) => !t.done);
  const rate = live.length ? Math.round((completed.length / live.length) * 100) : 0;

  // completed per day for the last 14 days (by updated_at when done)
  const days = [];
  const base = new Date(); base.setHours(0, 0, 0, 0);
  for (let i = 13; i >= 0; i--) {
    const d = new Date(base); d.setDate(d.getDate() - i);
    const key = d.toDateString();
    const count = completed.filter((t) => t.updated_at && new Date(t.updated_at).toDateString() === key).length;
    days.push({ key, count, label: d.toLocaleDateString([], { weekday: 'narrow' }) });
  }

  // streak: consecutive days (ending today) with >=1 completion
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) { if (days[i].count > 0) streak++; else break; }

  const byPriority = ['high', 'normal', 'low'].map((k) => ({
    key: k, label: { high: 'High', normal: 'Medium', low: 'Low' }[k],
    count: active.filter((t) => (t.priority || 'normal') === k).length,
  }));

  return { completed: completed.length, active: active.length, rate, streak, daily: days, byPriority };
}
