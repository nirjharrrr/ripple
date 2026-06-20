import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { currentUser, logout } from '../lib/api';
import { startReminderWatch } from '../lib/notify';
import { belongsToToday, priorityRank } from '../lib/status';
import { getPrefs, setPrefs } from '../lib/settings';
import Sidebar from './Sidebar';
import TaskList from './TaskList';
import DetailPanel from './DetailPanel';
import CommandPalette from './CommandPalette';
import FocusMode from './FocusMode';
import Analytics from './Analytics';
import CalendarView from './CalendarView';
import SettingsModal from './SettingsModal';
import NotesView from './NotesView';
import GoalsView from './GoalsView';
import HabitsView from './HabitsView';
import TemplatesView, { TEMPLATES, applyTemplate } from './TemplatesView';
import TimelineView from './TimelineView';
import RoomsIndex from './RoomsIndex';
import RoomView from './RoomView';
import MyTasksView from './MyTasksView';

const PLACEHOLDER = {};

const NAV_VIEWS = [
  { type: 'today', label: 'Today' }, { type: 'inbox', label: 'Inbox' },
  { type: 'upcoming', label: 'Upcoming' }, { type: 'mytasks', label: 'My tasks' },
  { type: 'calendar', label: 'Calendar' }, { type: 'notes', label: 'Notes' },
  { type: 'all', label: 'All tasks' }, { type: 'board', label: 'Board' },
  { type: 'completed', label: 'Completed' }, { type: 'analytics', label: 'Analytics' },
  { type: 'goals', label: 'Goals' }, { type: 'habits', label: 'Habits' },
  { type: 'templates', label: 'Templates' },
];

export default function Workspace({ onSignOut }) {
  const store = useStore();
  const { data } = store;
  const user = currentUser();
  const [view, setView] = useState({ type: 'today' });
  const [mode, setMode] = useState('list');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [focusId, setFocusId] = useState(null);
  const [sbOpen, setSbOpen] = useState(false);

  const tasksRef = useRef(data.tasks);
  tasksRef.current = data.tasks;
  useEffect(() => startReminderWatch(() => tasksRef.current), []);

  // an invalid/expired session: clear it and bounce to the login screen
  useEffect(() => {
    if (store.status === 'unauthorized') { logout().finally(onSignOut); }
  }, [store.status]); // eslint-disable-line

  function selectView(v) {
    setView(v);
    setMode(v.type === 'board' ? 'board' : v.type === 'calendar' ? 'calendar' : 'list');
    setSelectedId(null);
    setSbOpen(false);
  }
  async function handleSignOut() { await logout(); onSignOut(); }

  const cfg = useMemo(() => buildView(view, data, query), [view, data, query]);
  const selectedTask = data.tasks.find((t) => t.id === selectedId && !t.archived) || null;
  const focusTask = data.tasks.find((t) => t.id === focusId && !t.archived) || null;

  function createInView() {
    if (!cfg.newTaskDefaults) return;
    const t = store.addTask({ ...cfg.newTaskDefaults, title: 'New task' });
    setSelectedId(t.id);
  }

  // keyboard shortcuts
  useEffect(() => {
    function onKey(e) {
      const tag = (e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen((v) => !v); return; }
      if (typing) return;
      if (e.key === 'n') { e.preventDefault(); createInView(); }
      else if (e.key === 'f' && selectedId) { e.preventDefault(); setFocusId(selectedId); }
      else if (e.key === '/') { e.preventDefault(); document.querySelector('.sb-search input')?.focus(); }
      else if (e.key === 'Escape') { setSelectedId(null); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, cfg]); // eslint-disable-line

  const commands = useMemo(() => buildCommands({
    store, selectView, setSettingsOpen, createInView,
    selectedId, setFocusId, view,
  }), [store, selectedId, view, cfg]); // eslint-disable-line

  let mainContent;
  if (PLACEHOLDER[view.type]) mainContent = <section className="main"><div className="placeholder">{PLACEHOLDER[view.type]}</div></section>;
  else if (view.type === 'analytics') mainContent = <Analytics store={store} />;
  else if (view.type === 'notes') mainContent = <NotesView store={store} />;
  else if (view.type === 'goals') mainContent = <GoalsView store={store} onSelectTask={setSelectedId} />;
  else if (view.type === 'habits') mainContent = <HabitsView store={store} />;
  else if (view.type === 'templates') mainContent = <TemplatesView store={store} onSelectTask={setSelectedId} />;
  else if (view.type === 'timeline') mainContent = <TimelineView store={store} onSelect={setSelectedId} />;
  else if (view.type === 'mytasks') mainContent = <MyTasksView store={store} user={user} onSelect={setSelectedId} selectedId={selectedId} />;
  else if (view.type === 'rooms') mainContent = <RoomsIndex store={store} startCreating={view.create} onOpenRoom={(id) => selectView({ type: 'room', roomId: id })} />;
  else if (view.type === 'room') {
    const room = (data.teams || []).find((r) => r.id === view.roomId);
    mainContent = room
      ? <RoomView store={store} room={room} user={user} onSelect={setSelectedId} selectedId={selectedId} />
      : <section className="main"><div className="placeholder">Room not found.</div></section>;
  }
  else if (view.type === 'calendar' || mode === 'calendar') mainContent = <CalendarView store={store} onSelect={setSelectedId} />;
  else mainContent = (
    <TaskList
      store={store} tasks={cfg.tasks} title={cfg.title} subtitle={cfg.subtitle}
      groupBy={cfg.groupBy} mode={mode} onMode={setMode}
      onSelect={setSelectedId} selectedId={selectedId} newTaskDefaults={cfg.newTaskDefaults}
    />
  );

  return (
    <div className={`workspace ${selectedTask ? 'with-detail' : ''} ${sbOpen ? 'sb-open' : ''}`}>
      <div className="mobilebar">
        <button className="hamburger" onClick={() => setSbOpen((v) => !v)}>☰</button>
        <span className="mobilebar-title">{cfg.title || 'Ripple'}</span>
        <button className="hamburger" onClick={() => setPaletteOpen(true)}>🔍</button>
      </div>
      <div className="sb-scrim" onClick={() => setSbOpen(false)} />

      <Sidebar store={store} view={view} onSelectView={selectView} query={query} onQuery={setQuery}
        user={user} onSignOut={handleSignOut} onOpenSettings={() => setSettingsOpen(true)}
        status={store.status} pending={store.pendingWrites} />

      {mainContent}

      {selectedTask && <DetailPanel store={store} task={selectedTask} user={user} onClose={() => setSelectedId(null)} />}

      {paletteOpen && <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {focusTask && <FocusMode store={store} task={focusTask} onClose={() => setFocusId(null)} />}
    </div>
  );
}

function buildCommands({ store, selectView, setSettingsOpen, createInView, selectedId, setFocusId }) {
  const cmds = [
    { id: 'new-task', label: 'New task', hint: 'N', icon: '＋', run: createInView, keywords: 'create add' },
    { id: 'new-project', label: 'New project', icon: '📁', run: () => { const n = prompt('Project name'); if (n && n.trim()) store.addProject(n.trim()); }, keywords: 'create' },
    { id: 'settings', label: 'Open settings', icon: '⚙️', run: () => setSettingsOpen(true), keywords: 'theme preferences' },
  ];
  if (selectedId) cmds.push({ id: 'focus', label: 'Enter focus mode', hint: 'F', icon: '🎯', run: () => setFocusId(selectedId), keywords: 'pomodoro timer' });
  ['system', 'light', 'dark'].forEach((t) =>
    cmds.push({ id: 'theme-' + t, label: `Theme: ${t}`, icon: '🎨', run: () => setPrefs({ theme: t }), keywords: 'dark light appearance' }));
  NAV_VIEWS.forEach((v) =>
    cmds.push({ id: 'go-' + v.type, label: `Go to ${v.label}`, icon: '→', run: () => selectView({ type: v.type }), keywords: 'navigate view' }));
  store.data.projects.forEach((p) =>
    cmds.push({ id: 'proj-' + p.id, label: `Project: ${p.name}`, icon: '●', run: () => selectView({ type: 'project', projectId: p.id }), keywords: 'go open' }));
  TEMPLATES.forEach((t) =>
    cmds.push({ id: 'tmpl-' + t.name, label: `Template: ${t.name}`, icon: t.icon, run: () => applyTemplate(store, t), keywords: 'new from template checklist' }));
  return cmds;
}

function sortActive(list) {
  return [...list].sort((a, b) => {
    const pr = priorityRank(b.priority) - priorityRank(a.priority);
    if (pr) return pr;
    const ad = a.due_at ? new Date(a.due_at).getTime() : Infinity;
    const bd = b.due_at ? new Date(b.due_at).getTime() : Infinity;
    if (ad !== bd) return ad - bd;
    return a.position - b.position;
  });
}

function buildView(view, data, query) {
  const now = new Date();
  const q = query.trim().toLowerCase();
  const match = (t) => !q || t.title.toLowerCase().includes(q) || (t.notes || '').toLowerCase().includes(q) || (t.tags || '').toLowerCase().includes(q);
  const active = data.tasks.filter((t) => !t.archived && !t.done && match(t));

  switch (view.type) {
    case 'today': return { title: 'Today', subtitle: now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }), groupBy: 'priority', tasks: sortActive(active.filter((t) => belongsToToday(t, now))), newTaskDefaults: { is_today: true } };
    case 'inbox': return { title: 'Inbox', subtitle: 'Unsorted captures', groupBy: 'priority', tasks: sortActive(active.filter((t) => !t.project_id)), newTaskDefaults: { is_today: false } };
    case 'upcoming': return { title: 'Upcoming', subtitle: 'Scheduled ahead', groupBy: 'date', tasks: sortActive(active.filter((t) => t.due_at && new Date(t.due_at) > now)), newTaskDefaults: { is_today: false } };
    case 'mytasks': return { title: 'My tasks', subtitle: 'Everything assigned to you', groupBy: 'priority', tasks: sortActive(active), newTaskDefaults: {} };
    case 'all': return { title: 'All tasks', groupBy: 'priority', tasks: sortActive(active), newTaskDefaults: {} };
    case 'board': return { title: 'Board', groupBy: 'priority', tasks: sortActive(active), newTaskDefaults: {} };
    case 'calendar': return { title: 'Calendar', groupBy: 'priority', tasks: sortActive(active), newTaskDefaults: {} };
    case 'analytics': return { title: 'Analytics', groupBy: 'none', tasks: [], newTaskDefaults: null };
    case 'notes': return { title: 'Notes', groupBy: 'none', tasks: [], newTaskDefaults: null };
    case 'goals': return { title: 'Goals', groupBy: 'none', tasks: [], newTaskDefaults: null };
    case 'habits': return { title: 'Habits', groupBy: 'none', tasks: [], newTaskDefaults: null };
    case 'templates': return { title: 'Templates', groupBy: 'none', tasks: [], newTaskDefaults: null };
    case 'timeline': return { title: 'Timeline', groupBy: 'none', tasks: [], newTaskDefaults: null };
    case 'rooms': return { title: 'Rooms', groupBy: 'none', tasks: [], newTaskDefaults: null };
    case 'room': return { title: (data.teams || []).find((r) => r.id === view.roomId)?.name || 'Room', groupBy: 'none', tasks: [], newTaskDefaults: null };
    case 'completed': return { title: 'Completed', subtitle: 'Recently finished', groupBy: 'none', tasks: data.tasks.filter((t) => t.done && !t.archived && match(t)).sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')), newTaskDefaults: null };
    case 'project': { const p = data.projects.find((x) => x.id === view.projectId); return { title: p?.name || 'Project', subtitle: 'Project', groupBy: 'priority', tasks: sortActive(active.filter((t) => t.project_id === view.projectId)), newTaskDefaults: { project_id: view.projectId } }; }
    default: return { title: 'Tasks', groupBy: 'priority', tasks: sortActive(active), newTaskDefaults: {} };
  }
}
