import { useMemo, useState } from 'react';
import { belongsToToday } from '../lib/status';
import Icon from './Icon';
import RippleLogo from './RippleLogo';

const NAV = [
  { key: 'today', label: 'Today', icon: 'today' },
  { key: 'mytasks', label: 'My tasks', icon: 'mytasks' },
  { key: 'inbox', label: 'Inbox', icon: 'inbox' },
  { key: 'upcoming', label: 'Upcoming', icon: 'upcoming' },
];

const SECONDARY = [
  { key: 'notes', label: 'Notes', icon: 'notes' },
  { key: 'completed', label: 'Completed', icon: 'completed' },
];

const MORE = [
  { key: 'board', label: 'Board', icon: 'board' },
  { key: 'timeline', label: 'Timeline', icon: 'timeline' },
  { key: 'goals', label: 'Goals', icon: 'goals' },
  { key: 'habits', label: 'Habits', icon: 'habits' },
  { key: 'templates', label: 'Templates', icon: 'templates' },
  { key: 'analytics', label: 'Analytics', icon: 'analytics' },
];

const SYNC = {
  idle: ['#22c55e', 'Synced'], syncing: ['#3b82f6', 'Syncing…'],
  offline: ['#f59e0b', 'Offline'], error: ['#ef4444', 'Sync error'], unauthorized: ['#ef4444', 'Signing out…'],
};

export default function Sidebar({ store, view, onSelectView, query, onQuery, user, onSignOut, onOpenSettings, status = 'idle', pending = 0 }) {
  const { data } = store;
  const [moreOpen, setMoreOpen] = useState(false);

  const counts = useMemo(() => {
    const now = new Date();
    const active = data.tasks.filter((t) => !t.archived && !t.done);
    const byRoom = {};
    for (const t of active) if (t.team_id) byRoom[t.team_id] = (byRoom[t.team_id] || 0) + 1;
    return {
      inbox: active.filter((t) => !t.team_id && !t.project_id).length,
      today: active.filter((t) => belongsToToday(t, now)).length,
      mytasks: active.filter((t) => t.assignee_id === user?.id || t.user_id === user?.id).length,
      byRoom,
    };
  }, [data.tasks, user]);

  const is = (type, roomId) => view.type === type && (type !== 'room' || view.roomId === roomId);
  const rooms = (data.teams || []);

  return (
    <aside className="sidebar">
      <div className="sb-brand"><RippleLogo size={34} /></div>

      <div className="sb-search">
        <Icon name="search" size={14} />
        <input placeholder="Search" value={query} onChange={(e) => onQuery(e.target.value)} />
        <kbd>⌘K</kbd>
      </div>

      <nav className="sb-nav">
        {NAV.map((n) => (
          <button key={n.key} className={`sb-item ${is(n.key) ? 'on' : ''}`} onClick={() => onSelectView({ type: n.key })}>
            <Icon name={n.icon} className="sb-ico" />
            <span className="sb-label">{n.label}</span>
            {counts[n.key] > 0 && <span className="sb-count">{counts[n.key]}</span>}
          </button>
        ))}
      </nav>

      <div className="sb-section">
        <div className="sb-section-head">
          <button className="sb-section-link" onClick={() => onSelectView({ type: 'rooms' })}>Rooms</button>
          <button className="sb-add" onClick={() => onSelectView({ type: 'rooms', create: true })}><Icon name="plus" size={14} /></button>
        </div>
        {rooms.map((r) => (
          <button key={r.id} className={`sb-item ${is('room', r.id) ? 'on' : ''}`} onClick={() => onSelectView({ type: 'room', roomId: r.id })}>
            <Icon name="rooms" className="sb-ico" />
            <span className="sb-label">{r.name}</span>
            {counts.byRoom[r.id] > 0 && <span className="sb-count">{counts.byRoom[r.id]}</span>}
          </button>
        ))}
        {rooms.length === 0 && (
          <button className="sb-empty-link" onClick={() => onSelectView({ type: 'rooms', create: true })}>+ Create a room</button>
        )}
      </div>

      <nav className="sb-nav" style={{ marginTop: 12 }}>
        {SECONDARY.map((n) => (
          <button key={n.key} className={`sb-item ${is(n.key) ? 'on' : ''}`} onClick={() => onSelectView({ type: n.key })}>
            <Icon name={n.icon} className="sb-ico" />
            <span className="sb-label">{n.label}</span>
          </button>
        ))}
      </nav>

      <div className="sb-section">
        <div className="sb-section-head"><button className="sb-section-link" onClick={() => setMoreOpen((v) => !v)}>More</button></div>
        {moreOpen && MORE.map((n) => (
          <button key={n.key} className={`sb-item ${is(n.key) ? 'on' : ''}`} onClick={() => onSelectView({ type: n.key })}>
            <Icon name={n.icon} className="sb-ico" />
            <span className="sb-label">{n.label}</span>
          </button>
        ))}
      </div>

      <div className="sb-sync" title={pending ? `${pending} change(s) waiting to sync` : (SYNC[status] || SYNC.idle)[1]}>
        <span className="sb-sync-dot" style={{ background: (SYNC[status] || SYNC.idle)[0] }} />
        <span>{pending ? `${pending} pending…` : (SYNC[status] || SYNC.idle)[1]}</span>
      </div>
      <div className="sb-user">
        <span className="avatar">{(user?.name || user?.email || '?').slice(0, 1).toUpperCase()}</span>
        <span className="sb-username">{user?.name || user?.email}</span>
        <button className="sb-signout" title="Settings" onClick={onOpenSettings}><Icon name="settings" size={16} /></button>
        <button className="sb-signout" title="Sign out" onClick={onSignOut}><Icon name="signout" size={16} /></button>
      </div>
    </aside>
  );
}
