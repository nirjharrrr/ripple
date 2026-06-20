// Natural-language quick-add parsing.
// "call dentist tomorrow 3pm"      -> { title: "call dentist", due_at: <ISO>, recurrence: null }
// "standup every weekday at 9am"   -> { title: "standup", due_at: <next 9am weekday>, recurrence: "weekdays" }
import * as chrono from 'chrono-node';

const RECURRENCE_PATTERNS = [
  { re: /\bevery\s+weekday(s)?\b/i, rule: 'weekdays', strip: /\bevery\s+weekday(s)?\b/i },
  { re: /\bevery\s+day\b|\bdaily\b/i, rule: 'daily', strip: /\bevery\s+day\b|\bdaily\b/i },
  { re: /\bevery\s+week\b|\bweekly\b/i, rule: 'weekly', strip: /\bevery\s+week\b|\bweekly\b/i },
  { re: /\bevery\s+(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/i, rule: 'weekly', strip: /\bevery\s+(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/i },
];

export function parseQuickAdd(input, now = new Date()) {
  let text = input.trim();
  let recurrence = null;

  for (const p of RECURRENCE_PATTERNS) {
    if (p.re.test(text)) {
      recurrence = p.rule;
      text = text.replace(p.strip, ' ');
      break;
    }
  }

  let due_at = null;
  const results = chrono.parse(text, now, { forwardDate: true });
  if (results.length) {
    const r = results[0];
    due_at = r.start.date().toISOString();
    // remove the matched date phrase from the title
    text = (text.slice(0, r.index) + text.slice(r.index + r.text.length));
  }

  // tidy leftover filler words and whitespace
  const title = text
    .replace(/\b(at|on|by|every|due)\b\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,–-]+|[\s,–-]+$/g, '')
    .trim();

  return { title: title || input.trim(), due_at, recurrence };
}

// Friendly label for a reminder, e.g. "Today 3:00 PM" or "Mon, Jun 22 · 9:00 AM"
export function formatRemind(iso, recurrence) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  let day;
  if (sameDay) day = 'Today';
  else if (isTomorrow) day = 'Tomorrow';
  else day = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const rec = recurrence ? ` · ${recurrenceLabel(recurrence)}` : '';
  return `${day} ${time}${rec}`;
}

export function recurrenceLabel(rec) {
  if (rec === 'weekdays') return 'every weekday';
  if (rec === 'daily') return 'daily';
  if (rec === 'weekly') return 'weekly';
  return rec;
}
