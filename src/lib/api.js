// Ripple data layer — talks to the Google Apps Script web app (your Sheet).
//
// Design goals:
//  - Offline-first: reads come from a local cache instantly; writes are queued
//    in localStorage and flushed to the Sheet when online. Nothing is lost if
//    you add a task on the subway.
//  - No preflight: Apps Script web apps reject CORS preflight, so we POST as
//    text/plain (a "simple request") and put JSON in the body.

const API_URL = import.meta.env.VITE_RIPPLE_API_URL || '';
const APP_KEY = import.meta.env.VITE_RIPPLE_TOKEN || ''; // shared gate, not per-user

const CACHE_KEY = 'ripple_cache_v1';
const QUEUE_KEY = 'ripple_queue_v1';
const SESSION_KEY = 'ripple_session_v1';

// Is the backend URL wired up at all?
export function isConfigured() {
  return Boolean(API_URL);
}

// --- session ----------------------------------------------------------------
export function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}
function setSession(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
function clearSession() { localStorage.removeItem(SESSION_KEY); }

export function isLoggedIn() {
  const s = getSession();
  return Boolean(API_URL && s && s.token);
}
export function currentUser() {
  const s = getSession();
  return s ? s.user : null;
}

// --- low-level calls --------------------------------------------------------
async function rawCall(body) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
    redirect: 'follow',
  });
  const out = await res.json();
  if (!out.ok) throw new Error(out.error || 'request failed');
  return out.data;
}

// authenticated call — attaches the current session token
async function call(body) {
  const s = getSession();
  return rawCall({ ...body, token: s ? s.token : '' });
}

// --- auth -------------------------------------------------------------------
export async function login(email, password) {
  const data = await rawCall({ action: 'login', appKey: APP_KEY, email, password });
  setSession(data);
  return data;
}
export async function register(name, email, password) {
  const data = await rawCall({ action: 'register', appKey: APP_KEY, name, email, password });
  setSession(data);
  return data;
}
export async function savePushSubscription(sub) {
  return call({ action: 'savePushSub', sub });
}

export async function logout() {
  try { await call({ action: 'logout' }); } catch { /* ignore */ }
  clearSession();
  localStorage.removeItem(CACHE_KEY); // don't leave one user's tasks for the next
  localStorage.removeItem(QUEUE_KEY);
}

// Permanently delete the signed-in account + all its data, then wipe local state.
export async function deleteAccount() {
  await call({ action: 'deleteAccount' }); // throws if it fails — caller surfaces it
  clearSession();
  localStorage.removeItem(CACHE_KEY);
  localStorage.removeItem(QUEUE_KEY);
}

// --- local cache ------------------------------------------------------------
const EMPTY = { tasks: [], subtasks: [], projects: [], notes: [], goals: [], habits: [], comments: [], teams: [], memberships: [], invites: [], decisions: [], discussions: [], files: [], messages: [] };

export function readCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY)) || {};
    return { ...EMPTY, ...c };
  } catch {
    return { ...EMPTY };
  }
}

export function writeCache(data) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(data));
}

// --- write queue ------------------------------------------------------------
function readQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY)) || []; } catch { return []; }
}
function writeQueue(q) { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }

export function queueLength() { return readQueue().length; }

// Enqueue a write and try to flush. Caller has already updated the cache
// optimistically, so the UI is instant regardless of network.
export function enqueue(body) {
  const q = readQueue();
  q.push(body);
  writeQueue(q);
  flush();
}

let flushing = false;
export async function flush() {
  if (flushing || !isConfigured() || !navigator.onLine) return;
  flushing = true;
  try {
    let q = readQueue();
    while (q.length) {
      await call(q[0]);
      q.shift();
      writeQueue(q);
    }
  } catch {
    // leave remaining items queued; we'll retry on next flush/online event
  } finally {
    flushing = false;
  }
}

// --- high level -------------------------------------------------------------
// Pull the authoritative state from the Sheet and refresh the cache.
export async function pull() {
  const data = await call({ action: 'list' });
  const normalized = {
    tasks: (data.tasks || []).map(normalizeTask),
    subtasks: (data.subtasks || []).map(normalizeSub),
    projects: (data.projects || []).map(normalizeProject),
    notes: (data.notes || []).map((n) => ({ ...n, position: Number(n.position) || 0 })),
    goals: data.goals || [],
    habits: data.habits || [],
    comments: data.comments || [],
    teams: data.teams || [],
    memberships: data.memberships || [],
    invites: data.invites || [],
    decisions: data.decisions || [],
    discussions: data.discussions || [],
    files: data.files || [],
    messages: data.messages || [],
  };
  writeCache(normalized);
  return normalized;
}

// --- teams / collaboration (authenticated, immediate) ----------------------
export async function createTeam(name, adminPass) { return call({ action: 'createTeam', name, adminPass }); }
export async function verifyAdmin(team_id, adminPass) { return call({ action: 'verifyAdmin', team_id, adminPass }); }
export async function addMember(team_id, adminPass, email) { return call({ action: 'addMember', team_id, adminPass, email }); }
export async function removeMember(team_id, adminPass, membership_id) { return call({ action: 'removeMember', team_id, adminPass, membership_id }); }
export async function setRole(team_id, adminPass, membership_id, role) { return call({ action: 'setRole', team_id, adminPass, membership_id, role }); }
export async function setRoomMute(team_id, muted) { return call({ action: 'setMute', team_id, muted }); }
export async function acceptInvite(invite_token) { return call({ action: 'acceptInvite', invite_token }); }
export async function declineInvite(invite_token) { return call({ action: 'declineInvite', invite_token }); }
// Fast-poll a room's messages created after `since` (ISO) — used while the Chat tab is open.
export async function fetchRoomMessages(team_id, since) { return call({ action: 'roomMessages', team_id, since }); }

export async function ping() {
  return call({ action: 'ping' });
}

export function saveTask(task) { enqueue({ action: 'upsertTask', task }); }
export function removeTask(id) { enqueue({ action: 'deleteTask', id }); }
export function saveSubtask(subtask) { enqueue({ action: 'upsertSubtask', subtask }); }
export function removeSubtask(id) { enqueue({ action: 'deleteSubtask', id }); }
export function saveProject(project) { enqueue({ action: 'upsertProject', project }); }
export function removeProject(id) { enqueue({ action: 'deleteProject', id }); }
export function saveNote(note) { enqueue({ action: 'upsertNote', note }); }
export function removeNote(id) { enqueue({ action: 'deleteNote', id }); }
export function saveGoal(goal) { enqueue({ action: 'upsertGoal', goal }); }
export function removeGoal(id) { enqueue({ action: 'deleteGoal', id }); }
export function saveHabit(habit) { enqueue({ action: 'upsertHabit', habit }); }
export function removeHabit(id) { enqueue({ action: 'deleteHabit', id }); }
export function saveComment(comment) { enqueue({ action: 'upsertComment', comment }); }
export function removeComment(id) { enqueue({ action: 'deleteComment', id }); }
export function saveDecision(decision) { enqueue({ action: 'upsertDecision', decision }); }
export function removeDecision(id) { enqueue({ action: 'deleteDecision', id }); }
export function saveDiscussion(discussion) { enqueue({ action: 'upsertDiscussion', discussion }); }
export function removeDiscussion(id) { enqueue({ action: 'deleteDiscussion', id }); }
export function saveFile(file) { enqueue({ action: 'upsertFile', file }); }
export function removeFile(id) { enqueue({ action: 'deleteFile', id }); }
export function saveMessage(message) { enqueue({ action: 'upsertMessage', message }); }
export function removeMessage(id) { enqueue({ action: 'deleteMessage', id }); }
// Queued so it runs AFTER the task upsert that triggered it (preserves order).
export function saveAssignmentNotice(task_id, assignee_id) { enqueue({ action: 'notifyAssignment', task_id, assignee_id }); }

// Sheets store booleans as strings sometimes — coerce to real types.
function normalizeTask(t) {
  return {
    ...t,
    done: t.done === true || t.done === 'true',
    is_today: t.is_today === true || t.is_today === 'true',
    reminded: t.reminded === true || t.reminded === 'true',
    archived: t.archived === true || t.archived === 'true',
    position: Number(t.position) || 0,
    remind_at: t.remind_at || null,
    due_at: t.due_at || null,
    remind_offset: Number(t.remind_offset) || 0,
    priority: t.priority || 'normal',
    recurrence: t.recurrence || null,
    project_id: t.project_id || '',
    tags: t.tags || '',
    status: t.status || (t.done === true || t.done === 'true' ? 'completed' : 'not_started'),
    effort: t.effort || '',
    estimate: t.estimate || '',
    goal_id: t.goal_id || '',
    links: t.links || '',
    depends_on: t.depends_on || '',
  };
}

function normalizeProject(p) {
  return {
    ...p,
    position: Number(p.position) || 0,
    color: p.color || '#6b7280',
  };
}
function normalizeSub(s) {
  return {
    ...s,
    done: s.done === true || s.done === 'true',
    position: Number(s.position) || 0,
  };
}

// flush whenever connectivity returns
if (typeof window !== 'undefined') {
  window.addEventListener('online', flush);
}
