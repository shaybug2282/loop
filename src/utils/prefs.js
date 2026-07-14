// User preferences (theme, accent, notification toggles, availability
// sharing, quiet hours). Mirrored in localStorage for flash-free startup and
// synced to users.preferences via /api/user op:'preferences' so settings
// follow the user across devices.

const LS_KEY = 'loop-prefs';

// The 8 accent choices mirror the group color presets so the picker feels
// familiar; each carries a hand-tuned hover shade.
export const ACCENTS = [
  { accent: '#E8607A', hover: '#C94D65', name: 'Rose' },
  { accent: '#6366F1', hover: '#4F52D9', name: 'Indigo' },
  { accent: '#10B981', hover: '#0D9668', name: 'Emerald' },
  { accent: '#F59E0B', hover: '#D97F06', name: 'Amber' },
  { accent: '#3B82F6', hover: '#2A67D4', name: 'Blue' },
  { accent: '#EC4899', hover: '#D22F81', name: 'Pink' },
  { accent: '#14B8A6', hover: '#0F958A', name: 'Teal' },
  { accent: '#8B5CF6', hover: '#7443DB', name: 'Violet' },
];

export const DEFAULT_PREFS = {
  theme:  'system',            // 'light' | 'dark' | 'system'
  accent: ACCENTS[0].accent,
  availabilitySharing: 'ai',   // 'off' | 'ai' | 'friends'
  notifications: { events: true, groupInvites: true, friendRequests: true, dmToasts: true },
  quietHours: { enabled: false, start: '22:00', end: '08:00' },
};

// getPrefs — current preferences: stored values over defaults (one level of
// nested merge for the two object-valued keys). out: complete prefs object.
export function getPrefs() {
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') ?? {}; } catch {}
  return {
    ...DEFAULT_PREFS,
    ...stored,
    notifications: { ...DEFAULT_PREFS.notifications, ...(stored.notifications ?? {}) },
    quietHours:    { ...DEFAULT_PREFS.quietHours,    ...(stored.quietHours ?? {}) },
  };
}

// resolveTheme — 'system' → the OS preference; otherwise pass through.
const resolveTheme = t =>
  t === 'system'
    ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : t;

// applyTheme — stamp data-theme on <html> and set the accent variables.
// Everything visual reacts through the CSS variables in theme.css.
export function applyTheme(prefs = getPrefs()) {
  const rootStyle = document.documentElement.style;
  document.documentElement.setAttribute('data-theme', resolveTheme(prefs.theme));
  const pair = ACCENTS.find(a => a.accent === prefs.accent) ?? ACCENTS[0];
  rootStyle.setProperty('--accent', pair.accent);
  rootStyle.setProperty('--accent-hover', pair.hover);
}

// setPrefs — merge a patch locally, re-apply the theme, and push the patch to
// the server (fire-and-forget; last write wins per key). out: merged prefs.
export function setPrefs(patch) {
  const merged = { ...getPrefs(), ...patch };
  try { localStorage.setItem(LS_KEY, JSON.stringify(merged)); } catch {}
  applyTheme(merged);

  const googleId = localStorage.getItem('googleUserId');
  if (googleId) {
    fetch('/api/user', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ op: 'preferences', googleId, patch }),
    }).catch(() => {});
  }
  return merged;
}

// applyPrefsFromServer — fold server-stored preferences (from the profile
// fetch) into localStorage and re-theme. Server values win: they're the
// cross-device source of truth. No write-back — this is a pull.
export function applyPrefsFromServer(preferences) {
  if (!preferences || typeof preferences !== 'object') return;
  const merged = { ...getPrefs(), ...preferences };
  try { localStorage.setItem(LS_KEY, JSON.stringify(merged)); } catch {}
  applyTheme(merged);
}

// initTheme — apply the stored theme immediately (call before first render)
// and track OS light/dark changes while the setting is 'system'.
export function initTheme() {
  applyTheme();
  window.matchMedia?.('(prefers-color-scheme: dark)')
    .addEventListener?.('change', () => {
      if (getPrefs().theme === 'system') applyTheme();
    });
}
