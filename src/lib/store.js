// Ripple store — a small React hook that owns all task/subtask state.
// Every mutation updates local state + cache immediately (optimistic), then
// queues a write to the Sheet. The UI never waits on the network.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  readCache, writeCache, pull, flush, isConfigured,
  saveTask, removeTask, saveSubtask, removeSubtask,
  saveProject, removeProject, saveNote, removeNote,
  saveGoal, removeGoal, saveHabit, removeHabit,
  saveComment, removeComment,
  saveDecision, removeDecision, saveDiscussion, removeDiscussion,
  saveFile, removeFile, queueLength,
  saveMessage, removeMessage, saveAssignmentNotice, currentUser, setRoomMute,
} from './api';
import { computeRemindAt } from './status';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
const nowISO = () => new Date().toISOString();

export function useStore() {
  const [data, setData] = useState(() => readCache());
  const [status, setStatus] = useState('idle'); // idle | syncing | offline | error
  const dataRef = useRef(data);
  dataRef.current = data;

  // persist + update in one place
  const commit = useCallback((next) => {
    writeCache(next);
    setData(next);
  }, []);

  // initial + periodic pull from the Sheet
  const refresh = useCallback(async () => {
    if (!isConfigured() || !navigator.onLine) { setStatus('offline'); return; }
    setStatus('syncing');
    try {
      await flush();                 // push any pending local writes first
      const fresh = await pull();    // then pull authoritative state
      commit(fresh);
      setStatus('idle');
    } catch (e) {
      // an expired/invalid session must surface, not fail silently
      setStatus(/unauthorized/i.test(String(e && e.message)) ? 'unauthorized' : 'error');
    }
  }, [commit]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 20000); // live-ish sync across devices
    const onOnline = () => refresh();
    window.addEventListener('online', onOnline);
    return () => { clearInterval(id); window.removeEventListener('online', onOnline); };
  }, [refresh]);

  // ---- task actions --------------------------------------------------------
  const addTask = useCallback((input) => {
    const {
      title, due_at = null, remind_offset = 0, recurrence = null,
      priority = 'normal', is_today = true, notes = '',
      project_id = '', tags = '', status = 'not_started', effort = '', estimate = '', goal_id = '', links = '',
      assignee_id = '', team_id = '', depends_on = '',
    } = input;
    const task = {
      id: uid(), title, notes, done: false, is_today,
      due_at, remind_offset, remind_at: computeRemindAt(due_at, remind_offset),
      recurrence, reminded: false, priority, archived: false,
      project_id, tags, status, effort, estimate, goal_id, links,
      assignee_id, team_id, depends_on,
      position: Date.now(), created_at: nowISO(), updated_at: nowISO(),
    };
    const next = { ...dataRef.current, tasks: [...dataRef.current.tasks, task] };
    commit(next);
    saveTask(task);
    return task;
  }, [commit]);

  const updateTask = useCallback((id, patch) => {
    let updated;
    const tasks = dataRef.current.tasks.map((t) => {
      if (t.id !== id) return t;
      updated = { ...t, ...patch, updated_at: nowISO() };
      // recompute the reminder whenever the deadline or offset changes
      if ('due_at' in patch || 'remind_offset' in patch) {
        updated.remind_at = computeRemindAt(updated.due_at, updated.remind_offset);
        updated.reminded = false; // re-arm
      }
      // keep done <-> status in lockstep
      if ('done' in patch) {
        updated.status = patch.done ? 'completed' : (t.status === 'completed' ? 'not_started' : t.status);
      } else if ('status' in patch) {
        updated.done = patch.status === 'completed';
      }
      return updated;
    });
    commit({ ...dataRef.current, tasks });
    if (updated) saveTask(updated);
  }, [commit]);

  // Assign (or reassign) a task and notify the new assignee — unless it's you.
  const assignTask = useCallback((taskId, assigneeId, team_id) => {
    const prev = dataRef.current.tasks.find((t) => t.id === taskId)?.assignee_id || '';
    updateTask(taskId, { assignee_id: assigneeId, ...(team_id ? { team_id } : {}) });
    const me = currentUser();
    if (assigneeId && assigneeId !== prev && assigneeId !== me?.id) saveAssignmentNotice(taskId, assigneeId);
  }, [updateTask]);

  const deleteTask = useCallback((id) => {
    const task = dataRef.current.tasks.find((t) => t.id === id);
    const subs = dataRef.current.subtasks.filter((s) => s.task_id === id);
    const tasks = dataRef.current.tasks.filter((t) => t.id !== id);
    const subtasks = dataRef.current.subtasks.filter((s) => s.task_id !== id);
    commit({ tasks, subtasks });
    removeTask(id);
    return { task, subs }; // snapshot so the caller can offer Undo
  }, [commit]);

  // Restore a previously deleted task (+ its subtasks).
  const restoreTask = useCallback((snapshot) => {
    if (!snapshot || !snapshot.task) return;
    const cur = dataRef.current;
    commit({
      tasks: [...cur.tasks, snapshot.task],
      subtasks: [...cur.subtasks, ...(snapshot.subs || [])],
    });
    saveTask(snapshot.task);
    (snapshot.subs || []).forEach(saveSubtask);
  }, [commit]);

  const toggleTask = useCallback((id) => {
    const t = dataRef.current.tasks.find((x) => x.id === id);
    if (t) updateTask(id, { done: !t.done });
  }, [updateTask]);

  const toggleToday = useCallback((id) => {
    const t = dataRef.current.tasks.find((x) => x.id === id);
    if (t) updateTask(id, { is_today: !t.is_today });
  }, [updateTask]);

  // Archive every completed (not-yet-archived) task — "clear completed".
  const archiveCompleted = useCallback(() => {
    const cur = dataRef.current;
    const changed = [];
    const tasks = cur.tasks.map((t) => {
      if (t.done && !t.archived) {
        const u = { ...t, archived: true, updated_at: nowISO() };
        changed.push(u);
        return u;
      }
      return t;
    });
    commit({ ...cur, tasks });
    changed.forEach(saveTask);
    return changed.length;
  }, [commit]);

  // Move a task up/down by swapping its position with a neighbour.
  const moveTask = useCallback((id, neighbourId) => {
    const cur = dataRef.current;
    const a = cur.tasks.find((t) => t.id === id);
    const b = cur.tasks.find((t) => t.id === neighbourId);
    if (!a || !b) return;
    const ap = a.position, bp = b.position;
    const tasks = cur.tasks.map((t) => {
      if (t.id === a.id) return { ...t, position: bp, updated_at: nowISO() };
      if (t.id === b.id) return { ...t, position: ap, updated_at: nowISO() };
      return t;
    });
    commit({ ...cur, tasks });
    saveTask(tasks.find((t) => t.id === a.id));
    saveTask(tasks.find((t) => t.id === b.id));
  }, [commit]);

  // ---- subtask actions -----------------------------------------------------
  const addSubtask = useCallback((task_id, title) => {
    const sub = { id: uid(), task_id, title, done: false, position: Date.now(), created_at: nowISO() };
    commit({ ...dataRef.current, subtasks: [...dataRef.current.subtasks, sub] });
    saveSubtask(sub);
  }, [commit]);

  const updateSubtask = useCallback((id, patch) => {
    let updated;
    const subtasks = dataRef.current.subtasks.map((s) => {
      if (s.id !== id) return s;
      updated = { ...s, ...patch };
      return updated;
    });
    commit({ ...dataRef.current, subtasks });
    if (updated) saveSubtask(updated);
  }, [commit]);

  const toggleSubtask = useCallback((id) => {
    const s = dataRef.current.subtasks.find((x) => x.id === id);
    if (s) updateSubtask(id, { done: !s.done });
  }, [updateSubtask]);

  const deleteSubtask = useCallback((id) => {
    const subtasks = dataRef.current.subtasks.filter((s) => s.id !== id);
    commit({ ...dataRef.current, subtasks });
    removeSubtask(id);
  }, [commit]);

  // ---- project actions -----------------------------------------------------
  const addProject = useCallback((name, color = '#3b82f6', team_id = '') => {
    const project = {
      id: uid(), name, color, team_id, members: '',
      position: Date.now(), created_at: nowISO(),
    };
    commit({ ...dataRef.current, projects: [...dataRef.current.projects, project] });
    saveProject(project);
    return project;
  }, [commit]);

  const updateProject = useCallback((id, patch) => {
    let updated;
    const projects = dataRef.current.projects.map((p) => {
      if (p.id !== id) return p;
      updated = { ...p, ...patch };
      return updated;
    });
    commit({ ...dataRef.current, projects });
    if (updated) saveProject(updated);
  }, [commit]);

  const deleteProject = useCallback((id) => {
    // detach tasks from the project, then remove it
    const tasks = dataRef.current.tasks.map((t) => (t.project_id === id ? { ...t, project_id: '' } : t));
    const projects = dataRef.current.projects.filter((p) => p.id !== id);
    commit({ ...dataRef.current, tasks, projects });
    removeProject(id);
    tasks.filter((t) => t.project_id === '' && dataRef.current.tasks.find((o) => o.id === t.id)?.project_id === id)
      .forEach(saveTask);
  }, [commit]);

  // ---- notes ---------------------------------------------------------------
  const addNote = useCallback((title = 'Untitled', body = '', team_id = '') => {
    const note = { id: uid(), title, body, team_id, position: Date.now(), created_at: nowISO(), updated_at: nowISO() };
    commit({ ...dataRef.current, notes: [...dataRef.current.notes, note] });
    saveNote(note);
    return note;
  }, [commit]);
  const updateNote = useCallback((id, patch) => {
    let u;
    const notes = dataRef.current.notes.map((n) => (n.id === id ? (u = { ...n, ...patch, updated_at: nowISO() }) : n));
    commit({ ...dataRef.current, notes });
    if (u) saveNote(u);
  }, [commit]);
  const deleteNote = useCallback((id) => {
    commit({ ...dataRef.current, notes: dataRef.current.notes.filter((n) => n.id !== id) });
    removeNote(id);
  }, [commit]);

  // ---- goals ---------------------------------------------------------------
  const addGoal = useCallback((title, description = '') => {
    const goal = { id: uid(), title, description, created_at: nowISO() };
    commit({ ...dataRef.current, goals: [...dataRef.current.goals, goal] });
    saveGoal(goal);
    return goal;
  }, [commit]);
  const updateGoal = useCallback((id, patch) => {
    let u;
    const goals = dataRef.current.goals.map((g) => (g.id === id ? (u = { ...g, ...patch }) : g));
    commit({ ...dataRef.current, goals });
    if (u) saveGoal(u);
  }, [commit]);
  const deleteGoal = useCallback((id) => {
    const tasks = dataRef.current.tasks.map((t) => (t.goal_id === id ? { ...t, goal_id: '' } : t));
    commit({ ...dataRef.current, tasks, goals: dataRef.current.goals.filter((g) => g.id !== id) });
    removeGoal(id);
  }, [commit]);

  // ---- habits --------------------------------------------------------------
  const addHabit = useCallback((name) => {
    const habit = { id: uid(), name, log: '', position: Date.now(), created_at: nowISO() };
    commit({ ...dataRef.current, habits: [...dataRef.current.habits, habit] });
    saveHabit(habit);
    return habit;
  }, [commit]);
  const toggleHabitToday = useCallback((id) => {
    const today = new Date().toISOString().slice(0, 10);
    let u;
    const habits = dataRef.current.habits.map((h) => {
      if (h.id !== id) return h;
      const days = (h.log || '').split(',').map((s) => s.trim()).filter(Boolean);
      const has = days.includes(today);
      const next = has ? days.filter((d) => d !== today) : [...days, today];
      return (u = { ...h, log: next.join(',') });
    });
    commit({ ...dataRef.current, habits });
    if (u) saveHabit(u);
  }, [commit]);
  const deleteHabit = useCallback((id) => {
    commit({ ...dataRef.current, habits: dataRef.current.habits.filter((h) => h.id !== id) });
    removeHabit(id);
  }, [commit]);

  // ---- comments ------------------------------------------------------------
  const addComment = useCallback((task_id, body, author) => {
    const comment = { id: uid(), task_id, author: author || '', body, created_at: nowISO() };
    commit({ ...dataRef.current, comments: [...dataRef.current.comments, comment] });
    saveComment(comment);
    return comment;
  }, [commit]);
  const deleteComment = useCallback((id) => {
    commit({ ...dataRef.current, comments: dataRef.current.comments.filter((c) => c.id !== id) });
    removeComment(id);
  }, [commit]);

  // ---- room sub-entities (decisions / discussions / files) -----------------
  const addDecision = useCallback((team_id, title, body, author) => {
    const d = { id: uid(), team_id, title, body, author: author || '', created_at: nowISO() };
    commit({ ...dataRef.current, decisions: [...dataRef.current.decisions, d] });
    saveDecision(d);
    return d;
  }, [commit]);
  const deleteDecision = useCallback((id) => {
    commit({ ...dataRef.current, decisions: dataRef.current.decisions.filter((d) => d.id !== id) });
    removeDecision(id);
  }, [commit]);

  const addDiscussion = useCallback((team_id, body, author, parent_id = '') => {
    const d = { id: uid(), team_id, parent_id, body, author: author || '', created_at: nowISO() };
    commit({ ...dataRef.current, discussions: [...dataRef.current.discussions, d] });
    saveDiscussion(d);
    return d;
  }, [commit]);
  const deleteDiscussion = useCallback((id) => {
    // remove the thread and its replies
    const discussions = dataRef.current.discussions.filter((d) => d.id !== id && d.parent_id !== id);
    commit({ ...dataRef.current, discussions });
    removeDiscussion(id);
  }, [commit]);

  const addFile = useCallback((team_id, name, url) => {
    const f = { id: uid(), team_id, name, url, created_at: nowISO() };
    commit({ ...dataRef.current, files: [...dataRef.current.files, f] });
    saveFile(f);
    return f;
  }, [commit]);
  const deleteFile = useCallback((id) => {
    commit({ ...dataRef.current, files: dataRef.current.files.filter((f) => f.id !== id) });
    removeFile(id);
  }, [commit]);

  // ---- room chat -----------------------------------------------------------
  const addMessage = useCallback((team_id, body, author) => {
    const m = { id: uid(), team_id, author: author || '', body, created_at: nowISO() };
    commit({ ...dataRef.current, messages: [...dataRef.current.messages, m] });
    saveMessage(m);
    return m;
  }, [commit]);
  const deleteMessage = useCallback((id) => {
    commit({ ...dataRef.current, messages: dataRef.current.messages.filter((m) => m.id !== id) });
    removeMessage(id);
  }, [commit]);
  // Mute/unmute a room's chat notifications for me — optimistic, then persist.
  const muteRoom = useCallback((team_id, muted) => {
    const me = currentUser();
    const memberships = dataRef.current.memberships.map((m) =>
      (m.team_id === team_id && (m.user_id === me?.id)) ? { ...m, muted: muted ? 'true' : '' } : m);
    commit({ ...dataRef.current, memberships });
    setRoomMute(team_id, muted).catch(() => { /* next full sync reconciles */ });
  }, [commit]);

  // Merge freshly-polled messages into the cache without dropping optimistic ones.
  const mergeMessages = useCallback((incoming) => {
    if (!incoming || !incoming.length) return;
    const cur = dataRef.current;
    const have = new Set(cur.messages.map((m) => m.id));
    const fresh = incoming.filter((m) => !have.has(m.id));
    if (!fresh.length) return;
    commit({ ...cur, messages: [...cur.messages, ...fresh] });
  }, [commit]);

  return {
    data, status, pendingWrites: queueLength(),
    refresh,
    addTask, updateTask, deleteTask, restoreTask, assignTask,
    toggleTask, toggleToday, archiveCompleted, moveTask,
    addSubtask, updateSubtask, toggleSubtask, deleteSubtask,
    addProject, updateProject, deleteProject,
    addNote, updateNote, deleteNote,
    addGoal, updateGoal, deleteGoal,
    addHabit, toggleHabitToday, deleteHabit,
    addComment, deleteComment,
    addDecision, deleteDecision,
    addDiscussion, deleteDiscussion,
    addFile, deleteFile,
    addMessage, deleteMessage, mergeMessages, muteRoom,
  };
}

export function subtasksFor(data, taskId) {
  return data.subtasks
    .filter((s) => s.task_id === taskId)
    .sort((a, b) => a.position - b.position);
}
