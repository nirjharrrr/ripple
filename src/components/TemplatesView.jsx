export const TEMPLATES = [
  { name: 'Content Creation', icon: '✍️', subtasks: ['Research', 'Outline', 'Draft', 'Design', 'Review', 'Publish'] },
  { name: 'Product Launch', icon: '🚀', subtasks: ['Planning', 'Development', 'Testing', 'Marketing', 'Launch', 'Retro'] },
  { name: 'Weekly Review', icon: '🗓️', subtasks: ['Review last week', 'Clear inbox', 'Plan top 3', 'Schedule deep work'] },
  { name: 'Bug Fix', icon: '🐞', subtasks: ['Reproduce', 'Diagnose', 'Fix', 'Add test', 'Verify', 'Ship'] },
  { name: 'Meeting Prep', icon: '👥', subtasks: ['Agenda', 'Pre-read', 'Notes doc', 'Action items'] },
];

export function applyTemplate(store, tmpl, defaults = {}) {
  const task = store.addTask({ ...defaults, title: tmpl.name, is_today: true });
  tmpl.subtasks.forEach((s) => store.addSubtask(task.id, s));
  return task;
}

export default function TemplatesView({ store, onSelectTask }) {
  function use(tmpl) {
    const t = applyTemplate(store, tmpl);
    onSelectTask(t.id);
  }
  return (
    <section className="main">
      <header className="main-head"><div><h1>Templates</h1><div className="main-sub">Start a task with a ready-made checklist</div></div></header>
      <div className="tmpl-grid">
        {TEMPLATES.map((t) => (
          <div className="tmpl-card" key={t.name}>
            <div className="tmpl-icon">{t.icon}</div>
            <div className="tmpl-name">{t.name}</div>
            <ul className="tmpl-subs">{t.subtasks.map((s) => <li key={s}>{s}</li>)}</ul>
            <button className="btn-primary" onClick={() => use(t)}>Use template</button>
          </div>
        ))}
      </div>
    </section>
  );
}
