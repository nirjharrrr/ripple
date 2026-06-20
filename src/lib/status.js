// Task status + priority helpers — shared by the list, badges, and sorting.

export const PRIORITIES = ['high', 'normal', 'low'];
export const PRIORITY_RANK = { high: 2, normal: 1, low: 0 };
export const PRIORITY_LABEL = { high: 'High', normal: 'Medium', low: 'Low' };

export function priorityRank(p) {
  return PRIORITY_RANK[p] ?? 1;
}

// Workflow statuses (mockup: Not Started → In Progress → Waiting → Review → Completed)
export const STATUSES = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'review', label: 'Review' },
  { value: 'completed', label: 'Completed' },
];
export const STATUS_LABEL = STATUSES.reduce((m, s) => ((m[s.value] = s.label), m), {});

export const EFFORTS = [
  { value: '', label: '—' },
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
];

export const ESTIMATES = [
  { value: '', label: '—' },
  { value: '15m', label: '15 min' },
  { value: '30m', label: '30 min' },
  { value: '1h', label: '1 hour' },
  { value: '2h', label: '2 hours' },
  { value: '4h', label: '4 hours' },
];

// Default palette for new projects.
export const PROJECT_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#22c55e', '#f59e0b', '#ef4444', '#14b8a6', '#6366f1'];

// Reminder offsets (minutes before the deadline). 0 = at the deadline.
export const REMIND_OFFSETS = [
  { value: 0, label: 'At deadline' },
  { value: 15, label: '15 min before' },
  { value: 60, label: '1 hour before' },
  { value: 1440, label: '1 day before' },
];

export function offsetLabel(min) {
  const o = REMIND_OFFSETS.find((x) => x.value === Number(min));
  return o ? o.label : 'At deadline';
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function sameDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

// Status of a task for badges + filtering. Returns { key, label }.
//   done · overdue · today · pending · none
export function taskStatus(task, now = new Date()) {
  if (task.done) return { key: 'done', label: 'Done' };
  if (!task.due_at) return { key: 'none', label: '' };
  const due = new Date(task.due_at);
  if (isNaN(due.getTime())) return { key: 'none', label: '' };
  if (due.getTime() < now.getTime()) return { key: 'overdue', label: 'Overdue' };
  if (sameDay(due, now)) return { key: 'today', label: 'Due today' };
  return { key: 'pending', label: 'Pending' };
}

// Should this active task appear in the Today view?
//   - explicitly starred for today, OR
//   - due today, OR
//   - overdue (so nothing unfinished ever falls off the radar) ← carry-over
export function belongsToToday(task, now = new Date()) {
  if (task.is_today) return true;
  const st = taskStatus(task, now);
  return st.key === 'today' || st.key === 'overdue';
}

// Compute the actual reminder timestamp from a deadline + "before" offset.
export function computeRemindAt(dueISO, offsetMin) {
  if (!dueISO) return null;
  const due = new Date(dueISO);
  if (isNaN(due.getTime())) return null;
  return new Date(due.getTime() - Number(offsetMin || 0) * 60000).toISOString();
}

// Value for an <input type="datetime-local"> from an ISO string (local tz).
export function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ISO string from a datetime-local input value.
export function fromLocalInput(val) {
  if (!val) return null;
  const d = new Date(val);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}
