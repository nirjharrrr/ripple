// In-app / native notifications — the "app is open" layer of reminders.
// (The Sheet's script handles the "everything closed" layer via email.)
//
// While Ripple is open on a device, we poll for tasks whose remind_at has
// arrived and pop a native notification. On phones this works once the PWA is
// added to the home screen and notifications are allowed.

export async function requestNotifyPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try { return await Notification.requestPermission(); } catch { return 'denied'; }
}

export function canNotify() {
  return 'Notification' in window && Notification.permission === 'granted';
}

function fire(task) {
  if (!canNotify()) return;
  try {
    const n = new Notification('⏰ ' + task.title, {
      body: task.notes || 'Ripple reminder',
      tag: 'ripple-' + task.id,           // dedupe repeats
      requireInteraction: false,
    });
    n.onclick = () => { window.focus(); n.close(); };
  } catch { /* ignore */ }
}

// Returns a stop() function. `getTasks` returns the current task array each tick
// so we always see the latest data without re-subscribing.
export function startReminderWatch(getTasks) {
  const firedKey = 'ripple_fired_v1';
  const fired = new Set(JSON.parse(localStorage.getItem(firedKey) || '[]'));

  function persist() {
    localStorage.setItem(firedKey, JSON.stringify([...fired].slice(-200)));
  }

  function tick() {
    const now = Date.now();
    for (const t of getTasks()) {
      if (!t.remind_at || t.done) continue;
      const when = new Date(t.remind_at).getTime();
      if (isNaN(when) || when > now) continue;
      // key includes the timestamp so recurring reminders fire again next time
      const key = t.id + '@' + t.remind_at;
      if (fired.has(key)) continue;
      fired.add(key);
      persist();
      fire(t);
    }
  }

  const id = setInterval(tick, 30000);
  tick();
  return () => clearInterval(id);
}
