// Per-room "last read" bookmarks for chat unread badges — purely client-side
// (localStorage). A room is "unread" if its newest message is newer than the
// last time you opened that room's Chat tab.

const KEY = 'ripple_chat_read_v1';

function readMap() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function writeMap(m) { localStorage.setItem(KEY, JSON.stringify(m)); }

// Mark a room's chat as read up to `iso` (defaults to now).
export function markRoomRead(roomId, iso) {
  const m = readMap();
  m[roomId] = iso || new Date().toISOString();
  writeMap(m);
}

export function lastReadAt(roomId) {
  return readMap()[roomId] || '';
}

// Count of messages in a room newer than its last-read bookmark, excluding your
// own (you've obviously seen those). `messages` is the full message array.
export function unreadCount(roomId, messages, myId) {
  const seenAt = lastReadAt(roomId);
  let n = 0;
  for (const msg of messages) {
    if (msg.team_id !== roomId) continue;
    if (myId && msg.user_id === myId) continue;
    if (!seenAt || (msg.created_at || '') > seenAt) n++;
  }
  return n;
}
