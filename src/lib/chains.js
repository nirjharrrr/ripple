// Ripple Chains — task dependency helpers.
// A task's `depends_on` points to its prerequisite. A task is "locked" until
// that prerequisite is done; completing the prerequisite unlocks it.

export function taskMap(tasks) {
  const m = new Map();
  tasks.forEach((t) => m.set(t.id, t));
  return m;
}

export function isLocked(task, m) {
  if (task.done || !task.depends_on) return false;
  const p = m.get(task.depends_on);
  return !!p && !p.done;
}

export function dependentsOf(id, tasks) {
  return tasks.filter((t) => t.depends_on === id && !t.archived);
}

// Group dependency-linked tasks into chains (connected components), each
// ordered root → leaf by depth.
export function buildChains(allTasks) {
  const tasks = allTasks.filter((t) => !t.archived);
  const m = taskMap(tasks);
  const inChain = new Set();
  tasks.forEach((t) => {
    if (t.depends_on && m.has(t.depends_on)) { inChain.add(t.id); inChain.add(t.depends_on); }
  });
  const nodes = tasks.filter((t) => inChain.has(t.id));
  if (!nodes.length) return [];

  const parent = {};
  nodes.forEach((n) => { parent[n.id] = n.id; });
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { parent[find(a)] = find(b); };
  nodes.forEach((t) => { if (t.depends_on && m.has(t.depends_on)) union(t.id, t.depends_on); });

  const depth = (t) => {
    let d = 0, cur = t; const seen = new Set();
    while (cur.depends_on && m.has(cur.depends_on) && !seen.has(cur.id)) { seen.add(cur.id); cur = m.get(cur.depends_on); d++; }
    return d;
  };

  const groups = {};
  nodes.forEach((n) => { const r = find(n.id); (groups[r] = groups[r] || []).push(n); });
  return Object.values(groups).map((g) => g.slice().sort((a, b) => depth(a) - depth(b)));
}

// Visual: a one-shot expanding ripple appended to an element (e.g. a checkbox)
// — only fires on the actual completion click, never on re-render.
export function rippleBurst(el) {
  if (!el) return;
  const s = document.createElement('span');
  s.className = 'ripple-burst';
  el.appendChild(s);
  setTimeout(() => s.remove(), 650);
}
