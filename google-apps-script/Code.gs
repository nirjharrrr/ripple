/**
 * Ripple — free backend on Google Apps Script + Google Sheets.
 *
 * This single file is your entire server. It turns a Google Sheet into:
 *   1. A synced database the Ripple app reads/writes (laptop + phone share it)
 *   2. A reminder engine that emails you when a task is due (even when every
 *      device is closed), runs every minute via a time-based trigger.
 *
 * SETUP (one time, ~5 min) — see google-apps-script/README.md for the walk-through.
 *   1. Create a blank Google Sheet.
 *   2. Extensions → Apps Script. Delete the sample, paste this whole file.
 *   3. Set SECRET_TOKEN below to a long random string of your choosing.
 *   4. Run `setup` once (grant permissions) — creates the tabs + reminder trigger.
 *   5. Deploy → New deployment → Web app → Execute as: Me,
 *      Who has access: Anyone → Deploy. Copy the /exec URL.
 *   6. Put that URL + the same SECRET_TOKEN into the app's .env.local.
 */

// Secrets are stored in Script Properties (Project Settings → Script Properties),
// never in this file — so this code is safe to publish. Keys: SECRET_TOKEN (the
// shared app key, must match VITE_RIPPLE_TOKEN in the frontend) and PUSH_SECRET
// (must match the Netlify function's PUSH_SECRET env var). Set them once via the
// editor, or the one-time `bootstrap` action.
var SECRET_TOKEN = PropertiesService.getScriptProperties().getProperty('SECRET_TOKEN') || '';
var PUSH_SECRET = PropertiesService.getScriptProperties().getProperty('PUSH_SECRET') || '';

// Where reminder emails are sent. Leave blank to use the account's own email.
var REMINDER_EMAIL = '';

// Web Push: the reminder trigger forwards due reminders to this Netlify function,
// which signs + sends them with VAPID (Apps Script can't do ECDSA).
var SEND_PUSH_URL = 'https://ripple-b0912a.netlify.app/.netlify/functions/send-push';

// Where the app lives — used to build invite accept links in emails.
var APP_URL = 'https://ripple-b0912a.netlify.app';

var TASK_SHEET = 'Tasks';
var SUB_SHEET = 'Subtasks';
var USER_SHEET = 'Users';
var SESSION_SHEET = 'Sessions';
var PROJECT_SHEET = 'Projects';
var NOTE_SHEET = 'Notes';
var GOAL_SHEET = 'Goals';
var HABIT_SHEET = 'Habits';
var COMMENT_SHEET = 'Comments';
// New columns are appended at the end so existing sheets migrate cleanly —
// re-run setup() once after updating. `user_id` scopes every row to its owner.
var TASK_COLS = ['id', 'title', 'notes', 'done', 'is_today', 'remind_at',
                 'recurrence', 'position', 'reminded', 'created_at', 'updated_at',
                 'due_at', 'remind_offset', 'priority', 'archived', 'user_id',
                 'project_id', 'tags', 'status', 'effort', 'estimate', 'goal_id', 'links',
                 'assignee_id', 'team_id', 'depends_on'];
var SUB_COLS = ['id', 'task_id', 'title', 'done', 'position', 'created_at', 'user_id'];
var USER_COLS = ['id', 'name', 'email', 'pass_hash', 'salt', 'created_at'];
var SESSION_COLS = ['token', 'user_id', 'created_at'];
var PROJECT_COLS = ['id', 'name', 'color', 'position', 'created_at', 'user_id', 'team_id', 'members'];
var NOTE_COLS = ['id', 'title', 'body', 'position', 'created_at', 'updated_at', 'user_id', 'team_id'];
var GOAL_COLS = ['id', 'title', 'description', 'created_at', 'user_id'];
var HABIT_COLS = ['id', 'name', 'log', 'position', 'created_at', 'user_id'];
var COMMENT_COLS = ['id', 'task_id', 'author', 'body', 'created_at', 'user_id'];
var PUSHSUB_SHEET = 'PushSubs';
var PUSHSUB_COLS = ['id', 'user_id', 'endpoint', 'p256dh', 'auth', 'created_at'];
var TEAM_SHEET = 'Teams';
var TEAM_COLS = ['id', 'name', 'owner_id', 'admin_pass_hash', 'salt', 'created_at'];
var MEMBER_SHEET = 'Memberships';
// status: 'accepted' (full member) | 'pending' (invited, not yet joined).
// invite_token gates the email accept link; invited_by/invited_at are for display.
var MEMBER_COLS = ['id', 'team_id', 'user_id', 'email', 'name', 'role', 'created_at',
                   'status', 'invite_token', 'invited_by', 'invited_at', 'muted'];
// Room (= team) sub-entities
var DECISION_SHEET = 'Decisions';
var DECISION_COLS = ['id', 'team_id', 'title', 'body', 'author', 'created_at', 'user_id'];
var DISCUSSION_SHEET = 'Discussions';
var DISCUSSION_COLS = ['id', 'team_id', 'parent_id', 'body', 'author', 'created_at', 'user_id'];
var FILE_SHEET = 'Files';
var FILE_COLS = ['id', 'team_id', 'name', 'url', 'created_at', 'user_id'];
var MESSAGE_SHEET = 'Messages';
var MESSAGE_COLS = ['id', 'team_id', 'user_id', 'author', 'body', 'created_at'];

// ---------------------------------------------------------------------------
// HTTP entry points
// ---------------------------------------------------------------------------
function doGet(e) { return handle(e); }
function doPost(e) { return handle(e); }

function handle(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    } else if (e && e.parameter && e.parameter.payload) {
      body = JSON.parse(e.parameter.payload);
    }

    ensureMigrated(); // bring the schema up to date once, on first request

    var action = body.action;

    // ---- public actions (gated only by the shared app key) ----------------
    if (action === 'ping') return json({ ok: true, data: 'pong' });
    // One-time setup: set the secret Script Properties. Refuses once configured.
    if (action === 'bootstrap') {
      var props = PropertiesService.getScriptProperties();
      if (props.getProperty('SECRET_TOKEN')) return json({ ok: false, error: 'already configured' });
      if (body.SECRET_TOKEN) props.setProperty('SECRET_TOKEN', String(body.SECRET_TOKEN));
      if (body.PUSH_SECRET) props.setProperty('PUSH_SECRET', String(body.PUSH_SECRET));
      return json({ ok: true, data: 'configured' });
    }
    if (action === 'migrate') {
      if (body.appKey !== SECRET_TOKEN) return json({ ok: false, error: 'unauthorized' });
      return json({ ok: true, data: migrate() });
    }
    if (action === 'claimOrphans') {
      if (body.appKey !== SECRET_TOKEN) return json({ ok: false, error: 'unauthorized' });
      return json({ ok: true, data: assignAllTo(body.email) });
    }
    if (action === 'register' || action === 'login') {
      if (body.appKey !== SECRET_TOKEN) return json({ ok: false, error: 'unauthorized' });
      return json(action === 'register' ? register(body) : login(body));
    }

    // ---- authenticated actions (gated by a per-device session token) ------
    var userId = resolveSession(body.token);
    if (!userId) return json({ ok: false, error: 'unauthorized' });
    var teamSet = teamSetFor(userId);

    if (action === 'me')            return json({ ok: true, data: currentUser(userId) });
    if (action === 'logout')        return json({ ok: true, data: logout(body.token) });
    if (action === 'deleteAccount') return json({ ok: true, data: deleteAccount(userId) });
    if (action === 'list')          return json({ ok: true, data: listAll(userId) });
    if (action === 'upsertTask')    return json({ ok: true, data: upsertShared(TASK_SHEET, TASK_COLS, body.task, userId, teamSet) });
    if (action === 'deleteTask')    return json({ ok: true, data: deleteTask(body.id, userId, teamSet) });
    if (action === 'upsertSubtask') return json({ ok: true, data: taskTeamAllows(body.subtask && body.subtask.task_id, userId, teamSet) ? upsertSharedSub(body.subtask, userId) : { ok: false, error: 'forbidden' } });
    if (action === 'deleteSubtask') return json({ ok: true, data: deleteSubShared(body.id, userId, teamSet) });
    if (action === 'upsertProject')  return json({ ok: true, data: upsertShared(PROJECT_SHEET, PROJECT_COLS, body.project, userId, teamSet) });
    if (action === 'deleteProject')  return json({ ok: true, data: deleteShared(PROJECT_SHEET, PROJECT_COLS, body.id, userId, teamSet) });
    if (action === 'createTeam')     return json(createTeam(body, userId));
    if (action === 'verifyAdmin')    return json(verifyAdmin(body, userId));
    if (action === 'addMember')      return json(addMember(body, userId));
    if (action === 'removeMember')   return json(removeMember(body, userId));
    if (action === 'setRole')        return json(setMemberRole(body, userId));
    if (action === 'setMute')        return json(setMute(body.team_id, body.muted, userId));
    if (action === 'acceptInvite')   return json(acceptInvite(body.invite_token, userId));
    if (action === 'declineInvite')  return json(declineInvite(body.invite_token, userId));
    if (action === 'notifyAssignment') return json(notifyAssignment(body.task_id, body.assignee_id, userId, teamSet));
    if (action === 'upsertMessage')  return json({ ok: true, data: postMessage(body.message, userId, teamSet) });
    if (action === 'deleteMessage')  return json({ ok: true, data: deleteRoomEntity(MESSAGE_SHEET, MESSAGE_COLS, body.id, userId, teamSet) });
    if (action === 'roomMessages')   return json({ ok: true, data: roomMessages(body.team_id, body.since, userId, teamSet) });
    if (action === 'upsertDecision')   return json({ ok: true, data: upsertRoomEntity(DECISION_SHEET, DECISION_COLS, body.decision, userId, teamSet) });
    if (action === 'deleteDecision')   return json({ ok: true, data: deleteRoomEntity(DECISION_SHEET, DECISION_COLS, body.id, userId, teamSet) });
    if (action === 'upsertDiscussion') return json({ ok: true, data: upsertRoomEntity(DISCUSSION_SHEET, DISCUSSION_COLS, body.discussion, userId, teamSet) });
    if (action === 'deleteDiscussion') return json({ ok: true, data: deleteRoomEntity(DISCUSSION_SHEET, DISCUSSION_COLS, body.id, userId, teamSet) });
    if (action === 'upsertFile')       return json({ ok: true, data: upsertRoomEntity(FILE_SHEET, FILE_COLS, body.file, userId, teamSet) });
    if (action === 'deleteFile')       return json({ ok: true, data: deleteRoomEntity(FILE_SHEET, FILE_COLS, body.id, userId, teamSet) });
    if (action === 'upsertNote')     return json({ ok: true, data: upsertShared(NOTE_SHEET, NOTE_COLS, body.note, userId, teamSet) });
    if (action === 'deleteNote')     return json({ ok: true, data: deleteShared(NOTE_SHEET, NOTE_COLS, body.id, userId, teamSet) });
    if (action === 'upsertGoal')     return json({ ok: true, data: upsertOwned(GOAL_SHEET, GOAL_COLS, body.goal, userId) });
    if (action === 'deleteGoal')     return json({ ok: true, data: deleteOwned(GOAL_SHEET, GOAL_COLS, body.id, userId) });
    if (action === 'upsertHabit')    return json({ ok: true, data: upsertOwned(HABIT_SHEET, HABIT_COLS, body.habit, userId) });
    if (action === 'deleteHabit')    return json({ ok: true, data: deleteOwned(HABIT_SHEET, HABIT_COLS, body.id, userId) });
    if (action === 'upsertComment')  return json({ ok: true, data: taskTeamAllows(body.comment && body.comment.task_id, userId, teamSet) ? upsertSharedComment(body.comment, userId) : { ok: false, error: 'forbidden' } });
    if (action === 'deleteComment')  return json({ ok: true, data: deleteOwned(COMMENT_SHEET, COMMENT_COLS, body.id, userId) });
    if (action === 'savePushSub')    return json({ ok: true, data: savePushSub(body.sub, userId) });
    return json({ ok: false, error: 'unknown action: ' + action });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// ---------------------------------------------------------------------------
// Auth — accounts + sessions, all stored in the Sheet (hashed + salted).
// ---------------------------------------------------------------------------
function hashPassword(password, salt) {
  var raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, salt + ':' + password, Utilities.Charset.UTF_8);
  return raw.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function newToken() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

function findUserByEmail(email) {
  var users = readSheet(USER_SHEET, USER_COLS);
  email = String(email || '').trim().toLowerCase();
  for (var i = 0; i < users.length; i++) {
    if (String(users[i].email).toLowerCase() === email) return users[i];
  }
  return null;
}

function register(body) {
  var name = String(body.name || '').trim();
  var email = String(body.email || '').trim().toLowerCase();
  var password = String(body.password || '');
  if (!email || !password) return { ok: false, error: 'email and password required' };
  if (password.length < 6) return { ok: false, error: 'password must be at least 6 characters' };
  if (findUserByEmail(email)) return { ok: false, error: 'an account with that email already exists' };

  var salt = newToken().slice(0, 16);
  var user = {
    id: Utilities.getUuid(), name: name || email.split('@')[0], email: email,
    pass_hash: hashPassword(password, salt), salt: salt, created_at: new Date().toISOString(),
  };
  upsertRow(USER_SHEET, USER_COLS, user);
  linkMemberships(user.id, user.email);
  var token = createSession(user.id);
  return { ok: true, data: { token: token, user: publicUser(user) } };
}

function login(body) {
  var email = String(body.email || '').trim().toLowerCase();
  var password = String(body.password || '');
  var user = findUserByEmail(email);
  if (!user || user.pass_hash !== hashPassword(password, user.salt)) {
    return { ok: false, error: 'invalid email or password' };
  }
  linkMemberships(user.id, user.email);
  var token = createSession(user.id);
  return { ok: true, data: { token: token, user: publicUser(user) } };
}

function createSession(userId) {
  // append a fresh row per login — multiple devices/users each keep their own
  // session (do NOT use upsertRow: Sessions has no `id` column, so it would
  // collide all rows on undefined id and overwrite other people's sessions).
  var token = newToken();
  var sh = sheet(SESSION_SHEET, SESSION_COLS);
  sh.appendRow([token, userId, new Date().toISOString()]);
  return token;
}

function resolveSession(token) {
  if (!token) return null;
  var sessions = readSheet(SESSION_SHEET, SESSION_COLS);
  for (var i = 0; i < sessions.length; i++) {
    if (String(sessions[i].token) === String(token)) return String(sessions[i].user_id);
  }
  return null;
}

function logout(token) {
  deleteRow(SESSION_SHEET, token, 'token');
  return { ok: true };
}

// Self-service account deletion: removes ALL of the caller's own data, the
// rooms they own, and their account. Strictly self-scoped (uses the resolved
// session userId), so it can only ever delete your own account.
function deleteAccount(userId) {
  var owned = [
    [TASK_SHEET, TASK_COLS], [SUB_SHEET, SUB_COLS], [PROJECT_SHEET, PROJECT_COLS],
    [NOTE_SHEET, NOTE_COLS], [GOAL_SHEET, GOAL_COLS], [HABIT_SHEET, HABIT_COLS],
    [COMMENT_SHEET, COMMENT_COLS], [DECISION_SHEET, DECISION_COLS],
    [DISCUSSION_SHEET, DISCUSSION_COLS], [FILE_SHEET, FILE_COLS], [MESSAGE_SHEET, MESSAGE_COLS],
    [PUSHSUB_SHEET, PUSHSUB_COLS], [MEMBER_SHEET, MEMBER_COLS], [SESSION_SHEET, SESSION_COLS],
  ];
  owned.forEach(function (pair) {
    var sh = sheet(pair[0], pair[1]);
    var rows = readSheet(pair[0], pair[1]);
    for (var i = rows.length - 1; i >= 0; i--) if (String(rows[i].user_id) === String(userId)) sh.deleteRow(rows[i]._row);
  });
  var tsh = sheet(TEAM_SHEET, TEAM_COLS), teams = readSheet(TEAM_SHEET, TEAM_COLS);
  for (var t = teams.length - 1; t >= 0; t--) if (String(teams[t].owner_id) === String(userId)) tsh.deleteRow(teams[t]._row);
  var ush = sheet(USER_SHEET, USER_COLS), users = readSheet(USER_SHEET, USER_COLS);
  for (var u = users.length - 1; u >= 0; u--) if (String(users[u].id) === String(userId)) ush.deleteRow(users[u]._row);
  return 'account deleted';
}

function currentUser(userId) {
  var users = readSheet(USER_SHEET, USER_COLS);
  for (var i = 0; i < users.length; i++) {
    if (String(users[i].id) === String(userId)) return publicUser(users[i]);
  }
  return null;
}

function publicUser(u) { return { id: u.id, name: u.name, email: u.email }; }

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------------------
// Sheet helpers
// ---------------------------------------------------------------------------
function sheet(name, cols) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(cols);
    sh.setFrozenRows(1);
  }
  return sh;
}

// Add any columns in `cols` that aren't already in the header row (appended at
// the right). Existing rows simply get blank cells for the new columns.
function migrateHeaders(name, cols) {
  var sh = sheet(name, cols);
  var lastCol = sh.getLastColumn();
  var header = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  var missing = [];
  for (var i = 0; i < cols.length; i++) {
    if (header.indexOf(cols[i]) === -1) missing.push(cols[i]);
  }
  if (missing.length) {
    sh.getRange(1, header.length + 1, 1, missing.length).setValues([missing]);
  }
}

function readSheet(name, cols) {
  var sh = sheet(name, cols);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var header = values[0];
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var obj = {};
    for (var c = 0; c < header.length; c++) obj[header[c]] = values[i][c];
    obj._row = i + 1; // 1-based sheet row
    rows.push(obj);
  }
  return rows;
}

function colsFor(name) {
  if (name === TASK_SHEET) return TASK_COLS;
  if (name === SUB_SHEET) return SUB_COLS;
  if (name === USER_SHEET) return USER_COLS;
  if (name === SESSION_SHEET) return SESSION_COLS;
  if (name === PROJECT_SHEET) return PROJECT_COLS;
  if (name === NOTE_SHEET) return NOTE_COLS;
  if (name === GOAL_SHEET) return GOAL_COLS;
  if (name === HABIT_SHEET) return HABIT_COLS;
  if (name === COMMENT_SHEET) return COMMENT_COLS;
  if (name === PUSHSUB_SHEET) return PUSHSUB_COLS;
  if (name === TEAM_SHEET) return TEAM_COLS;
  if (name === MEMBER_SHEET) return MEMBER_COLS;
  if (name === DECISION_SHEET) return DECISION_COLS;
  if (name === DISCUSSION_SHEET) return DISCUSSION_COLS;
  if (name === FILE_SHEET) return FILE_COLS;
  if (name === MESSAGE_SHEET) return MESSAGE_COLS;
  return [];
}

// Room sub-entities (decisions/discussions/files): any member of the room may
// add; owner or any member may delete. Scoped strictly to rooms you belong to.
function upsertRoomEntity(name, cols, obj, userId, teamSet) {
  obj = obj || {};
  if (!obj.team_id || !teamSet[String(obj.team_id)]) return { ok: false, error: 'forbidden' };
  if (!obj.user_id) obj.user_id = userId;
  return upsertRow(name, cols, obj);
}
function deleteRoomEntity(name, cols, id, userId, teamSet) {
  var sh = sheet(name, cols);
  var rows = readSheet(name, cols);
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i].id) === String(id)) {
      if (String(rows[i].user_id) === String(userId) || teamSet[String(rows[i].team_id)]) sh.deleteRow(rows[i]._row);
    }
  }
  return { id: id };
}

// ---------------------------------------------------------------------------
// Teams / collaboration helpers
// ---------------------------------------------------------------------------
function getUserRow(userId) {
  var users = readSheet(USER_SHEET, USER_COLS);
  for (var i = 0; i < users.length; i++) if (String(users[i].id) === String(userId)) return users[i];
  return null;
}

function getTeamRow(teamId) {
  var teams = readSheet(TEAM_SHEET, TEAM_COLS);
  for (var i = 0; i < teams.length; i++) if (String(teams[i].id) === String(teamId)) return teams[i];
  return null;
}

// The set of team ids a user belongs to (owner or member, matched by id or email).
function teamSetFor(userId) {
  var u = getUserRow(userId);
  var email = u ? String(u.email).toLowerCase() : '';
  var set = {};
  var teams = readSheet(TEAM_SHEET, TEAM_COLS);
  for (var i = 0; i < teams.length; i++) if (String(teams[i].owner_id) === String(userId)) set[String(teams[i].id)] = true;
  var members = readSheet(MEMBER_SHEET, MEMBER_COLS);
  for (var j = 0; j < members.length; j++) {
    // pending invites do NOT grant access — only accepted (or legacy blank) ones
    var status = String(members[j].status || 'accepted');
    if (status === 'pending') continue;
    if (String(members[j].user_id) === String(userId) || (email && String(members[j].email).toLowerCase() === email)) {
      set[String(members[j].team_id)] = true;
    }
  }
  return set;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Can this user touch the given task (owner / assignee / same team)?
function taskTeamAllows(taskId, userId, teamSet) {
  var rows = readSheet(TASK_SHEET, TASK_COLS);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === String(taskId)) {
      var t = rows[i];
      return String(t.user_id) === String(userId) || String(t.assignee_id) === String(userId) || (t.team_id && teamSet[String(t.team_id)]);
    }
  }
  return true; // new task
}

// Upsert that allows the owner, the assignee, or any team member; preserves the
// original owner so collaborators can't hijack ownership.
function upsertShared(name, cols, obj, userId, teamSet) {
  obj = obj || {};
  var rows = readSheet(name, cols);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === String(obj.id)) {
      var owner = String(rows[i].user_id || '');
      var team = String(rows[i].team_id || '');
      var allowed = !owner || owner === String(userId) || (team && teamSet[team]) || String(rows[i].assignee_id || '') === String(userId);
      if (!allowed) return { ok: false, error: 'forbidden' };
      if (owner) obj.user_id = rows[i].user_id;
      break;
    }
  }
  if (!obj.user_id) obj.user_id = userId;
  return upsertRow(name, cols, obj);
}

function deleteShared(name, cols, id, userId, teamSet) {
  var sh = sheet(name, cols);
  var rows = readSheet(name, cols);
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i].id) === String(id)) {
      var owner = String(rows[i].user_id || '');
      var team = String(rows[i].team_id || '');
      if (!owner || owner === String(userId) || (team && teamSet[team])) sh.deleteRow(rows[i]._row);
    }
  }
  return { id: id };
}

// Subtasks/comments inherit permission from their parent task.
function upsertSharedSub(sub, userId) { sub = sub || {}; if (!sub.user_id) sub.user_id = userId; return upsertRow(SUB_SHEET, SUB_COLS, sub); }
function upsertSharedComment(c, userId) { c = c || {}; if (!c.user_id) c.user_id = userId; return upsertRow(COMMENT_SHEET, COMMENT_COLS, c); }

function deleteSubShared(id, userId, teamSet) {
  var sh = sheet(SUB_SHEET, SUB_COLS);
  var rows = readSheet(SUB_SHEET, SUB_COLS);
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i].id) === String(id)) {
      if (String(rows[i].user_id) === String(userId) || taskTeamAllows(rows[i].task_id, userId, teamSet)) sh.deleteRow(rows[i]._row);
    }
  }
  return { id: id };
}

// Store/refresh a push subscription (keyed by endpoint so it dedupes).
function savePushSub(sub, userId) {
  if (!sub || !sub.endpoint) return { ok: false, error: 'no endpoint' };
  var row = {
    id: sub.endpoint, user_id: userId, endpoint: sub.endpoint,
    p256dh: sub.keys ? sub.keys.p256dh : '', auth: sub.keys ? sub.keys.auth : '',
    created_at: new Date().toISOString(),
  };
  return upsertOwned(PUSHSUB_SHEET, PUSHSUB_COLS, row, userId);
}

function sendPush(subs, title, body) {
  try {
    UrlFetchApp.fetch(SEND_PUSH_URL, {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({
        secret: PUSH_SECRET, title: title, body: body, url: '/',
        subscriptions: subs.map(function (s) { return { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }; }),
      }),
    });
  } catch (e) { /* ignore push failures */ }
}

function listAll(userId) {
  var owned = function (r) { return String(r.user_id) === String(userId); };
  var teamSet = teamSetFor(userId);

  var tasks = readSheet(TASK_SHEET, TASK_COLS).filter(function (t) {
    return String(t.user_id) === String(userId)
        || String(t.assignee_id) === String(userId)
        || (t.team_id && teamSet[String(t.team_id)]);
  });
  var taskIds = {};
  tasks.forEach(function (t) { taskIds[String(t.id)] = true; });

  var subtasks = readSheet(SUB_SHEET, SUB_COLS).filter(function (s) { return taskIds[String(s.task_id)] || owned(s); });
  var projects = readSheet(PROJECT_SHEET, PROJECT_COLS).filter(function (p) { return owned(p) || (p.team_id && teamSet[String(p.team_id)]); });
  var comments = readSheet(COMMENT_SHEET, COMMENT_COLS).filter(function (c) { return taskIds[String(c.task_id)] || owned(c); });

  // teams I'm in (strip secrets) + their full member rosters
  var teams = readSheet(TEAM_SHEET, TEAM_COLS).filter(function (tm) { return teamSet[String(tm.id)]; })
    .map(function (tm) { return { id: tm.id, name: tm.name, owner_id: tm.owner_id, created_at: tm.created_at }; });
  // roster for rooms I'm in — drop the secret invite_token before sending out
  var memberships = readSheet(MEMBER_SHEET, MEMBER_COLS).filter(function (m) { return teamSet[String(m.team_id)]; })
    .map(function (m) { var c = stripRow(m); delete c.invite_token; if (!c.status) c.status = 'accepted'; return c; });

  // pending invitations addressed to me (by bound user_id or by email)
  var u = getUserRow(userId);
  var myEmail = u ? String(u.email).toLowerCase() : '';
  var invites = readSheet(MEMBER_SHEET, MEMBER_COLS).filter(function (m) {
    return String(m.status) === 'pending' &&
      (String(m.user_id) === String(userId) || (myEmail && String(m.email).toLowerCase() === myEmail));
  }).map(function (m) {
    var t = getTeamRow(m.team_id);
    var inv = m.invited_by ? getUserRow(m.invited_by) : null;
    return { invite_token: m.invite_token, team_id: m.team_id, team_name: t ? t.name : 'a room',
             invited_by_name: inv ? (inv.name || inv.email) : '', invited_at: m.invited_at };
  });

  var inRoom = function (r) { return r.team_id && teamSet[String(r.team_id)]; };
  return {
    tasks: tasks.map(stripRow),
    subtasks: subtasks.map(stripRow),
    projects: projects.map(stripRow),
    notes: readSheet(NOTE_SHEET, NOTE_COLS).filter(function (n) { return owned(n) || inRoom(n); }).map(stripRow),
    goals: readSheet(GOAL_SHEET, GOAL_COLS).filter(owned).map(stripRow),
    habits: readSheet(HABIT_SHEET, HABIT_COLS).filter(owned).map(stripRow),
    comments: comments.map(stripRow),
    teams: teams,
    memberships: memberships,
    invites: invites,
    decisions: readSheet(DECISION_SHEET, DECISION_COLS).filter(inRoom).map(stripRow),
    discussions: readSheet(DISCUSSION_SHEET, DISCUSSION_COLS).filter(inRoom).map(stripRow),
    files: readSheet(FILE_SHEET, FILE_COLS).filter(inRoom).map(stripRow),
    messages: readSheet(MESSAGE_SHEET, MESSAGE_COLS).filter(inRoom).map(stripRow),
  };
}

// ---- team actions ---------------------------------------------------------
function teamAdminOK(teamId, userId, adminPass) {
  var t = getTeamRow(teamId);
  if (!t) return false;
  if (!teamSetFor(userId)[String(teamId)]) return false; // must belong to the team
  return hashPassword(adminPass || '', t.salt) === t.admin_pass_hash;
}

function createTeam(body, userId) {
  var name = String(body.name || '').trim();
  var pass = String(body.adminPass || '');
  if (!name || pass.length < 4) return { ok: false, error: 'team name + admin password (4+ chars) required' };
  var salt = newToken().slice(0, 16);
  var team = {
    id: Utilities.getUuid(), name: name, owner_id: userId,
    admin_pass_hash: hashPassword(pass, salt), salt: salt, created_at: new Date().toISOString(),
  };
  upsertRow(TEAM_SHEET, TEAM_COLS, team);
  var u = getUserRow(userId);
  upsertRow(MEMBER_SHEET, MEMBER_COLS, {
    id: Utilities.getUuid(), team_id: team.id, user_id: userId,
    email: u ? u.email : '', name: u ? u.name : '', role: 'admin',
    created_at: new Date().toISOString(), status: 'accepted',
  });
  return { ok: true, data: { id: team.id, name: team.name, owner_id: userId } };
}

function verifyAdmin(body, userId) {
  return { ok: true, data: { valid: teamAdminOK(body.team_id, userId, body.adminPass) } };
}

// Invite a member by email. Creates a PENDING membership with a secret token and
// emails an accept link. They join the room only after accepting (acceptInvite).
function addMember(body, userId) {
  if (!teamAdminOK(body.team_id, userId, body.adminPass)) return { ok: false, error: 'admin password incorrect' };
  var email = String(body.email || '').trim().toLowerCase();
  if (!email) return { ok: false, error: 'email required' };
  var team = getTeamRow(body.team_id);
  var members = readSheet(MEMBER_SHEET, MEMBER_COLS);
  for (var i = 0; i < members.length; i++) {
    if (String(members[i].team_id) === String(body.team_id) && String(members[i].email).toLowerCase() === email) {
      var st = String(members[i].status || 'accepted');
      if (st === 'accepted') return { ok: true, data: 'already a member' };
      // re-send the existing pending invite
      sendInviteEmail(email, team, members[i].invite_token, userId);
      return { ok: true, data: 'invite re-sent' };
    }
  }
  var u = findUserByEmail(email);
  var token = newToken();
  upsertRow(MEMBER_SHEET, MEMBER_COLS, {
    id: Utilities.getUuid(), team_id: body.team_id, user_id: u ? u.id : '',
    email: email, name: u ? u.name : (body.name || ''), role: 'member',
    created_at: new Date().toISOString(), status: 'pending',
    invite_token: token, invited_by: userId, invited_at: new Date().toISOString(),
  });
  var sent = sendInviteEmail(email, team, token, userId);
  return { ok: true, data: sent ? 'invite sent' : 'invited (email could not be sent — they can still accept in-app)' };
}

// Email the invitee an accept link. Returns true if the email went out.
function sendInviteEmail(email, team, token, inviterId) {
  var inviter = getUserRow(inviterId);
  var who = inviter ? (inviter.name || inviter.email) : 'Someone';
  var roomName = team ? team.name : 'a Ripple room';
  var link = APP_URL + '/?invite=' + encodeURIComponent(token);
  try {
    MailApp.sendEmail({
      to: email,
      subject: who + ' invited you to “' + roomName + '” on Ripple',
      htmlBody:
        '<div style="font-family:Inter,Arial,sans-serif;color:#16324F">' +
        '<p style="font-size:16px"><b>' + escapeHtml(who) + '</b> invited you to join the room ' +
        '<b>“' + escapeHtml(roomName) + '”</b> on Ripple.</p>' +
        '<p><a href="' + link + '" style="display:inline-block;background:#2E84A7;color:#fff;' +
        'text-decoration:none;padding:11px 22px;border-radius:10px;font-weight:600">Accept invitation</a></p>' +
        '<p style="color:#5b7184;font-size:13px">Or paste this link into your browser:<br>' + link + '</p>' +
        '<p style="color:#94a3b8;font-size:12px">If you didn’t expect this, you can ignore this email.</p>' +
        '<p style="color:#94a3b8;font-size:12px">— Ripple · Create momentum</p></div>',
      body: who + ' invited you to join “' + roomName + '” on Ripple.\n\nAccept: ' + link + '\n\n— Ripple',
    });
    return true;
  } catch (e) { return false; }
}

// Accept an invite: bind the membership to this user and mark it accepted.
function acceptInvite(token, userId) {
  if (!token) return { ok: false, error: 'missing token' };
  var sh = sheet(MEMBER_SHEET, MEMBER_COLS);
  var rows = readSheet(MEMBER_SHEET, MEMBER_COLS);
  var u = getUserRow(userId);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].invite_token) === String(token)) {
      sh.getRange(rows[i]._row, MEMBER_COLS.indexOf('user_id') + 1).setValue(userId);
      sh.getRange(rows[i]._row, MEMBER_COLS.indexOf('status') + 1).setValue('accepted');
      if (u && u.name) sh.getRange(rows[i]._row, MEMBER_COLS.indexOf('name') + 1).setValue(u.name);
      return { ok: true, data: { team_id: rows[i].team_id } };
    }
  }
  return { ok: false, error: 'invite not found or already used' };
}

// Decline an invite: remove the pending membership row.
function declineInvite(token, userId) {
  if (!token) return { ok: false, error: 'missing token' };
  var sh = sheet(MEMBER_SHEET, MEMBER_COLS);
  var rows = readSheet(MEMBER_SHEET, MEMBER_COLS);
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i].invite_token) === String(token) && String(rows[i].status) === 'pending') sh.deleteRow(rows[i]._row);
  }
  return { ok: true, data: 'declined' };
}

function removeMember(body, userId) {
  if (!teamAdminOK(body.team_id, userId, body.adminPass)) return { ok: false, error: 'admin password incorrect' };
  deleteRow(MEMBER_SHEET, body.membership_id, 'id');
  return { ok: true, data: 'removed' };
}

function setMemberRole(body, userId) {
  if (!teamAdminOK(body.team_id, userId, body.adminPass)) return { ok: false, error: 'admin password incorrect' };
  var sh = sheet(MEMBER_SHEET, MEMBER_COLS);
  var rows = readSheet(MEMBER_SHEET, MEMBER_COLS);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === String(body.membership_id)) {
      sh.getRange(rows[i]._row, MEMBER_COLS.indexOf('role') + 1).setValue(body.role);
    }
  }
  return { ok: true, data: 'role updated' };
}

// Mute/unmute a room's chat notifications for the calling user (own membership only).
function setMute(teamId, muted, userId) {
  if (!teamId) return { ok: false, error: 'room required' };
  var u = getUserRow(userId);
  var email = u ? String(u.email).toLowerCase() : '';
  var sh = sheet(MEMBER_SHEET, MEMBER_COLS);
  var rows = readSheet(MEMBER_SHEET, MEMBER_COLS);
  var c = MEMBER_COLS.indexOf('muted') + 1;
  var hit = false;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].team_id) === String(teamId) &&
       (String(rows[i].user_id) === String(userId) || (email && String(rows[i].email).toLowerCase() === email))) {
      sh.getRange(rows[i]._row, c).setValue(muted ? 'true' : '');
      hit = true;
    }
  }
  return hit ? { ok: true, data: { muted: !!muted } } : { ok: false, error: 'not a member' };
}

// Is this user's chat muted for the room?
function isMuted(teamId, userId) {
  var members = readSheet(MEMBER_SHEET, MEMBER_COLS);
  for (var i = 0; i < members.length; i++) {
    if (String(members[i].team_id) === String(teamId) && String(members[i].user_id) === String(userId)) {
      return String(members[i].muted) === 'true';
    }
  }
  return false;
}

// Link any pending memberships (added by email before the user existed) to this user.
function linkMemberships(userId, email) {
  email = String(email || '').toLowerCase();
  var sh = sheet(MEMBER_SHEET, MEMBER_COLS);
  var rows = readSheet(MEMBER_SHEET, MEMBER_COLS);
  var c = MEMBER_COLS.indexOf('user_id') + 1;
  for (var i = 0; i < rows.length; i++) {
    if (!String(rows[i].user_id) && String(rows[i].email).toLowerCase() === email) sh.getRange(rows[i]._row, c).setValue(userId);
  }
}

// ---------------------------------------------------------------------------
// Notifications — email (MailApp) + lock-screen push (Netlify function).
// ---------------------------------------------------------------------------
function pushSubsFor(userId) {
  return readSheet(PUSHSUB_SHEET, PUSHSUB_COLS).filter(function (s) { return String(s.user_id) === String(userId); });
}

// Notify a single user by email + push. Best-effort; never throws.
function notifyUser(userId, title, body) {
  var u = getUserRow(userId);
  if (u && u.email) {
    try { MailApp.sendEmail({ to: u.email, subject: title, body: body + '\n\n— Ripple' }); } catch (e) { /* quota */ }
  }
  var subs = pushSubsFor(userId);
  if (subs.length) sendPush(subs, title, body);
}

// Fired by the client when a task's assignee changes. Validates that both the
// caller and the assignee belong to the task's room, then notifies the assignee.
function notifyAssignment(taskId, assigneeId, userId, teamSet) {
  if (!taskId || !assigneeId) return { ok: false, error: 'task and assignee required' };
  if (String(assigneeId) === String(userId)) return { ok: true, data: 'self — skipped' }; // never notify yourself
  var task = null, rows = readSheet(TASK_SHEET, TASK_COLS);
  for (var i = 0; i < rows.length; i++) if (String(rows[i].id) === String(taskId)) { task = rows[i]; break; }
  if (!task) return { ok: false, error: 'task not found' };
  // caller must be able to touch the task (owner / assignee / room member)
  var allowed = String(task.user_id) === String(userId) || (task.team_id && teamSet[String(task.team_id)]);
  if (!allowed) return { ok: false, error: 'forbidden' };
  // assignee must actually be an accepted member of the task's room (if any)
  if (task.team_id && !teamSetFor(assigneeId)[String(task.team_id)]) return { ok: false, error: 'assignee not in room' };
  var assigner = getUserRow(userId);
  var who = assigner ? (assigner.name || assigner.email) : 'Someone';
  notifyUser(assigneeId, '📌 New task assigned: ' + task.title, who + ' assigned you “' + task.title + '” in Ripple.');
  return { ok: true, data: 'notified' };
}

// ---------------------------------------------------------------------------
// Room chat — messages live in the Messages sheet, gated by room membership.
// ---------------------------------------------------------------------------
function postMessage(msg, userId, teamSet) {
  msg = msg || {};
  if (!msg.team_id || !teamSet[String(msg.team_id)]) return { ok: false, error: 'forbidden' };
  if (!String(msg.body || '').trim()) return { ok: false, error: 'empty' };
  msg.user_id = userId;
  if (!msg.created_at) msg.created_at = new Date().toISOString();
  upsertRow(MESSAGE_SHEET, MESSAGE_COLS, {
    id: msg.id || Utilities.getUuid(), team_id: msg.team_id, user_id: userId,
    author: msg.author || '', body: msg.body, created_at: msg.created_at,
  });
  // @mention notifications: match @name / @email against accepted room members
  var mentioned = parseMentions(msg.body, msg.team_id);
  for (var i = 0; i < mentioned.length; i++) {
    if (String(mentioned[i]) === String(userId)) continue;      // never ping yourself
    if (isMuted(msg.team_id, mentioned[i])) continue;           // respect per-room mute
    notifyUser(mentioned[i], '💬 ' + (msg.author || 'Someone') + ' mentioned you', msg.body);
  }
  return { ok: true, id: msg.id, created_at: msg.created_at };
}

// Resolve @tokens in a message to member user_ids (best match on name/email local part).
function parseMentions(body, teamId) {
  var out = [], text = String(body || '');
  var tokens = text.match(/@([a-z0-9._-]+)/gi);
  if (!tokens) return out;
  var members = readSheet(MEMBER_SHEET, MEMBER_COLS).filter(function (m) {
    return String(m.team_id) === String(teamId) && String(m.status || 'accepted') !== 'pending' && m.user_id;
  });
  tokens.forEach(function (tok) {
    var t = tok.slice(1).toLowerCase();
    for (var i = 0; i < members.length; i++) {
      var name = String(members[i].name || '').toLowerCase().replace(/\s+/g, '');
      var local = String(members[i].email || '').toLowerCase().split('@')[0];
      if (name === t || local === t) { if (out.indexOf(members[i].user_id) === -1) out.push(members[i].user_id); break; }
    }
  });
  return out;
}

// Fast-poll endpoint: messages for a room created after `since` (ISO string).
function roomMessages(teamId, since, userId, teamSet) {
  if (!teamId || !teamSet[String(teamId)]) return { messages: [] };
  var all = readSheet(MESSAGE_SHEET, MESSAGE_COLS).filter(function (m) {
    return String(m.team_id) === String(teamId) && (!since || String(m.created_at) > String(since));
  }).map(stripRow);
  return { messages: all };
}

function stripRow(o) { var c = Object.assign({}, o); delete c._row; return c; }

// Upsert that stamps the owner and refuses to touch another user's row.
function upsertOwned(name, cols, obj, userId) {
  obj = obj || {};
  var rows = readSheet(name, cols);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === String(obj.id)) {
      if (String(rows[i].user_id) && String(rows[i].user_id) !== String(userId)) {
        return { ok: false, error: 'forbidden' };
      }
      break;
    }
  }
  obj.user_id = userId; // always stamp the owner
  return upsertRow(name, cols, obj);
}

function deleteOwned(name, cols, id, userId) {
  var sh = sheet(name, cols);
  var rows = readSheet(name, cols);
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i].id) === String(id) && String(rows[i].user_id) === String(userId)) {
      sh.deleteRow(rows[i]._row);
    }
  }
  return { id: id };
}

function upsertRow(name, cols, obj) {
  var sh = sheet(name, cols);
  var rows = readSheet(name, cols);
  var existing = null;
  if (obj.id !== undefined && obj.id !== null && obj.id !== '') {
    for (var i = 0; i < rows.length; i++) { if (String(rows[i].id) === String(obj.id)) { existing = rows[i]; break; } }
  }
  var line = cols.map(function (c) { return obj[c] !== undefined && obj[c] !== null ? obj[c] : ''; });
  if (existing) {
    sh.getRange(existing._row, 1, 1, cols.length).setValues([line]);
  } else {
    sh.appendRow(line);
  }
  return obj;
}

function deleteRow(name, id, keyCol) {
  keyCol = keyCol || 'id';
  var cols = colsFor(name);
  var sh = sheet(name, cols);
  var rows = readSheet(name, cols);
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][keyCol]) === String(id)) sh.deleteRow(rows[i]._row);
  }
  return { id: id };
}

function deleteTask(id, userId, teamSet) {
  // delete the task (if owner/team) and all of its subtasks
  deleteShared(TASK_SHEET, TASK_COLS, id, userId, teamSet);
  var subs = readSheet(SUB_SHEET, SUB_COLS);
  var sh = sheet(SUB_SHEET, SUB_COLS);
  for (var i = subs.length - 1; i >= 0; i--) {
    if (String(subs[i].task_id) === String(id)) sh.deleteRow(subs[i]._row);
  }
  return { id: id };
}

// ---------------------------------------------------------------------------
// Reminder engine — runs every minute via time trigger (created by setup())
// ---------------------------------------------------------------------------
function checkReminders() {
  var sh = sheet(TASK_SHEET, TASK_COLS);
  var rows = readSheet(TASK_SHEET, TASK_COLS);
  var now = new Date();
  var fallback = REMINDER_EMAIL || Session.getActiveUser().getEmail();

  // map user_id -> email so each person gets their own reminders
  var emailById = {};
  var users = readSheet(USER_SHEET, USER_COLS);
  for (var u = 0; u < users.length; u++) emailById[String(users[u].id)] = users[u].email;

  // map user_id -> [push subscriptions] for lock-screen push
  var subsByUser = {};
  var allSubs = readSheet(PUSHSUB_SHEET, PUSHSUB_COLS);
  for (var p = 0; p < allSubs.length; p++) {
    var uid = String(allSubs[p].user_id);
    (subsByUser[uid] = subsByUser[uid] || []).push(allSubs[p]);
  }

  for (var i = 0; i < rows.length; i++) {
    var t = rows[i];
    if (!t.remind_at || t.done === true || t.done === 'true') continue;
    if (t.reminded === true || t.reminded === 'true') continue;
    var when = new Date(t.remind_at);
    if (isNaN(when.getTime()) || when > now) continue;

    var to = emailById[String(t.user_id)] || fallback;

    // due — send the reminder email
    try {
      MailApp.sendEmail({
        to: to,
        subject: '⏰ Ripple reminder: ' + t.title,
        body: t.title + (t.notes ? '\n\n' + t.notes : '') + '\n\n— Ripple'
      });
    } catch (err) { /* quota or no email; skip silently */ }

    // lock-screen push (works with the app closed) to this user's devices
    var subs = subsByUser[String(t.user_id)] || [];
    if (subs.length) sendPush(subs, '⏰ ' + t.title, t.notes || 'Ripple reminder');

    if (t.recurrence) {
      // reschedule the next occurrence instead of marking done
      var next = nextOccurrence(when, t.recurrence);
      sh.getRange(t._row, col('remind_at')).setValue(next.toISOString());
      sh.getRange(t._row, col('reminded')).setValue(false);
      sh.getRange(t._row, col('updated_at')).setValue(now.toISOString());
      // keep the deadline in step with the reminder for recurring tasks
      if (t.due_at) {
        var nextDue = nextOccurrence(new Date(t.due_at), t.recurrence);
        sh.getRange(t._row, col('due_at')).setValue(nextDue.toISOString());
      }
    } else {
      sh.getRange(t._row, col('reminded')).setValue(true);
    }
  }
}

function col(name) { return TASK_COLS.indexOf(name) + 1; }

function nextOccurrence(from, recurrence) {
  var d = new Date(from);
  if (recurrence === 'daily') { d.setDate(d.getDate() + 1); return d; }
  if (recurrence === 'weekly') { d.setDate(d.getDate() + 7); return d; }
  if (recurrence === 'weekdays') {
    do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
    return d;
  }
  if (recurrence.indexOf('weekly:') === 0) { d.setDate(d.getDate() + 7); return d; }
  d.setDate(d.getDate() + 1);
  return d;
}

// ---------------------------------------------------------------------------
// One-time setup — run this manually from the Apps Script editor once.
// ---------------------------------------------------------------------------
// Runs migrate() once after a code update, then remembers it via a script
// property so subsequent requests skip the work.
function ensureMigrated() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('schema_v11') === '1') return;
  migrate();
  backfillMemberStatus(); // existing members predate the invite flow → mark accepted
  props.setProperty('schema_v11', '1');
}

// Any membership row with a blank status predates invites — it's a real member.
function backfillMemberStatus() {
  var sh = sheet(MEMBER_SHEET, MEMBER_COLS);
  var rows = readSheet(MEMBER_SHEET, MEMBER_COLS);
  var c = MEMBER_COLS.indexOf('status') + 1;
  for (var i = 0; i < rows.length; i++) {
    if (!String(rows[i].status || '').trim()) sh.getRange(rows[i]._row, c).setValue('accepted');
  }
}

// Idempotent: ensure all sheets exist and have every column. Safe to call
// repeatedly — exposed over HTTP via the `migrate` action.
function migrate() {
  sheet(TASK_SHEET, TASK_COLS);
  sheet(SUB_SHEET, SUB_COLS);
  sheet(USER_SHEET, USER_COLS);
  sheet(SESSION_SHEET, SESSION_COLS);
  sheet(PROJECT_SHEET, PROJECT_COLS);
  sheet(NOTE_SHEET, NOTE_COLS);
  sheet(GOAL_SHEET, GOAL_COLS);
  sheet(HABIT_SHEET, HABIT_COLS);
  sheet(COMMENT_SHEET, COMMENT_COLS);
  sheet(PUSHSUB_SHEET, PUSHSUB_COLS);
  sheet(TEAM_SHEET, TEAM_COLS);
  sheet(MEMBER_SHEET, MEMBER_COLS);
  sheet(DECISION_SHEET, DECISION_COLS);
  sheet(DISCUSSION_SHEET, DISCUSSION_COLS);
  sheet(FILE_SHEET, FILE_COLS);
  sheet(MESSAGE_SHEET, MESSAGE_COLS);
  migrateHeaders(TASK_SHEET, TASK_COLS);
  migrateHeaders(SUB_SHEET, SUB_COLS);
  migrateHeaders(USER_SHEET, USER_COLS);
  migrateHeaders(SESSION_SHEET, SESSION_COLS);
  migrateHeaders(PROJECT_SHEET, PROJECT_COLS);
  migrateHeaders(NOTE_SHEET, NOTE_COLS);
  migrateHeaders(GOAL_SHEET, GOAL_COLS);
  migrateHeaders(HABIT_SHEET, HABIT_COLS);
  migrateHeaders(COMMENT_SHEET, COMMENT_COLS);
  migrateHeaders(PUSHSUB_SHEET, PUSHSUB_COLS);
  migrateHeaders(TEAM_SHEET, TEAM_COLS);
  migrateHeaders(MEMBER_SHEET, MEMBER_COLS);
  migrateHeaders(NOTE_SHEET, NOTE_COLS);
  migrateHeaders(DECISION_SHEET, DECISION_COLS);
  migrateHeaders(DISCUSSION_SHEET, DISCUSSION_COLS);
  migrateHeaders(FILE_SHEET, FILE_COLS);
  migrateHeaders(MESSAGE_SHEET, MESSAGE_COLS);
  return 'migrated: sheets + columns ready';
}

function setup() {
  migrate();
  // remove any existing reminder triggers, then create a fresh per-minute one
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'checkReminders') ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger('checkReminders').timeBased().everyMinutes(1).create();
  return 'Ripple setup complete: sheets created + reminder trigger every 1 min.';
}

// One-time helper: assign every task/subtask that has no owner yet to the
// account with this email. Run once from the editor after you register, if you
// want to keep tasks created before multi-user login existed.
function assignAllTo(email) {
  var user = findUserByEmail(email);
  if (!user) return 'No user found for ' + email + ' — register in the app first.';
  [[TASK_SHEET, TASK_COLS], [SUB_SHEET, SUB_COLS]].forEach(function (pair) {
    var name = pair[0], cols = pair[1];
    var sh = sheet(name, cols);
    var rows = readSheet(name, cols);
    var c = cols.indexOf('user_id') + 1;
    for (var i = 0; i < rows.length; i++) {
      if (!String(rows[i].user_id)) sh.getRange(rows[i]._row, c).setValue(user.id);
    }
  });
  return 'Assigned all un-owned rows to ' + email;
}
