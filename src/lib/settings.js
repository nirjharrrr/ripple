// Local preferences (week start). Theme is forced to light — dark mode is
// disabled across the app for now.
const KEY = 'ripple_prefs_v1';

const DEFAULTS = { theme: 'light', weekStart: 0 }; // weekStart: 0=Sun, 1=Mon

export function getPrefs() {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}), theme: 'light' }; }
  catch { return { ...DEFAULTS }; }
}

export function setPrefs(patch) {
  const next = { ...getPrefs(), ...patch, theme: 'light' };
  localStorage.setItem(KEY, JSON.stringify(next));
  applyTheme();
  return next;
}

// Dark mode is abolished for now — always render the light theme.
export function applyTheme() {
  document.documentElement.dataset.theme = 'light';
}

export function initTheme() {
  applyTheme();
}
