import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Save, Loader, X, Camera } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../contexts/AuthContext';
import { getPrefs, setPrefs as savePrefs, applyPrefsFromServer, ACCENTS } from '../utils/prefs';
import { resizeImage } from '../utils/image';
import './ProfilePage.css';

// Formats a raw digit string into (XXX)XXX-XXXX as the user types
const formatPhone = (raw) => {
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3)  return digits.length ? `(${digits}` : '';
  if (digits.length <= 6)  return `(${digits.slice(0,3)})${digits.slice(3)}`;
  return `(${digits.slice(0,3)})${digits.slice(3,6)}-${digits.slice(6)}`;
};

const ProfilePage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, login } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [showEmail, setShowEmail]     = useState(true);
  const [showPhone, setShowPhone]     = useState(true);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [friendCode, setFriendCode]   = useState('');
  const [codeCopied, setCodeCopied]   = useState(false);
  // Quiet Time: ISO timestamp while on, null while off. Toggling saves
  // immediately (its own API op) — it isn't part of the Save button flow.
  // quietUntil = optional auto-off (datetime-local string in the picker).
  const [quietSince, setQuietSince]   = useState(null);
  const [quietUntil, setQuietUntil]   = useState('');
  const [quietBusy,  setQuietBusy]    = useState(false);

  // Appearance / notifications / privacy preferences — mirrored from
  // utils/prefs (saved instantly, no Save button involved).
  const [prefsState, setPrefsState] = useState(getPrefs);
  const changePref = (patch) => setPrefsState(savePrefs(patch));

  // Custom avatar (migration 015): uploads save immediately.
  const [avatarUrl,  setAvatarUrl]  = useState(null); // custom avatar or null
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarInputRef = useRef(null);

  // Users I've blocked (unblock UI lives here on the profile page).
  const [blocked, setBlocked] = useState([]);

  // Friend-code regeneration state.
  const [regenBusy, setRegenBusy] = useState(false);

  const handlePhoneChange = (e) => setPhoneNumber(formatPhone(e.target.value));

  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saveMsg, setSaveMsg]   = useState(null); // { type: 'success'|'error', text }

  const googleId = localStorage.getItem('googleUserId');

  // Scheduling Assistant preferences — everything the assistant has learned
  // about this user that they can audit here: standing rules (removable) and
  // the reply-length style (pinnable). null until loaded; hidden on error.
  const [prefs, setPrefs] = useState(null);

  // Load current profile values via the API on mount
  useEffect(() => {
    if (!googleId) { setLoading(false); return; }
    fetch(`/api/user?op=profile&googleId=${encodeURIComponent(googleId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setDisplayName(data.display_name ?? '');
          setShowEmail(data.show_email ?? true);
          setShowPhone(data.show_phone ?? true);
          setPhoneNumber(data.phone_number ?? '');
          setFriendCode(data.friend_code ?? '');
          setQuietSince(data.quiet_time_since ?? null);
          setAvatarUrl(data.custom_avatar_url ?? null);
          if (data.quiet_time_until) {
            // datetime-local wants a local "YYYY-MM-DDTHH:MM"
            const d = new Date(data.quiet_time_until);
            const p = n => String(n).padStart(2, '0');
            setQuietUntil(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`);
          }
          if (data.preferences) {
            applyPrefsFromServer(data.preferences);
            setPrefsState(getPrefs());
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [googleId]);

  // Users I've blocked — surfaced from the friends payload for the Unblock list.
  const loadBlocked = useCallback(() => {
    if (!googleId) return;
    fetch(`/api/friends?op=data&googleId=${encodeURIComponent(googleId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setBlocked(d.blocked ?? []); })
      .catch(() => {});
  }, [googleId]);

  useEffect(() => { loadBlocked(); }, [loadBlocked]);

  // Load the assistant's learned preferences (independent of the form above).
  useEffect(() => {
    if (!googleId) return;
    fetch(`/api/ai?op=profile-prefs&googleId=${encodeURIComponent(googleId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setPrefs(data); })
      .catch(() => {});
  }, [googleId]);

  // removeConstraint — delete one learned rule; the server echoes the updated
  // lists back so the UI never drifts from the stored profile.
  const removeConstraint = useCallback(async (constraint) => {
    setPrefs(prev => prev && {
      ...prev,
      hard_constraints: prev.hard_constraints.filter(c => c !== constraint),
      soft_constraints: prev.soft_constraints.filter(c => c !== constraint),
    });
    try {
      const r = await fetch('/api/ai', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ op: 'forget-constraint', googleId, constraint }),
      });
      if (r.ok) {
        const data = await r.json();
        setPrefs(prev => prev && { ...prev, hard_constraints: data.hard_constraints, soft_constraints: data.soft_constraints });
      }
    } catch {}
  }, [googleId]);

  // Preferences input — user-stated scheduling rules ("I'm not a morning
  // person") saved straight into the assistant's profile.
  const [prefInput, setPrefInput] = useState('');
  const [prefBusy,  setPrefBusy]  = useState(false);

  const addPreference = useCallback(async () => {
    const text = prefInput.trim();
    if (!text || prefBusy) return;
    setPrefBusy(true);
    try {
      const r = await fetch('/api/ai', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ op: 'add-constraint', googleId, constraint: text }),
      });
      if (r.ok) {
        const data = await r.json();
        setPrefs(prev => ({
          ...(prev ?? {}),
          hard_constraints: data.hard_constraints,
          soft_constraints: data.soft_constraints,
        }));
        setPrefInput('');
      }
    } catch {}
    setPrefBusy(false);
  }, [prefInput, prefBusy, googleId]);

  // Quiet Time — saves immediately; while on, nobody can schedule you. An
  // optional "until" auto-expires it. Both the toggle and the until picker
  // funnel through here (until only matters while turning/keeping it on).
  const saveQuietTime = useCallback(async (enabled, untilLocal) => {
    if (quietBusy) return;
    setQuietBusy(true);
    try {
      const until = enabled && untilLocal ? new Date(untilLocal).toISOString() : null;
      const r = await fetch('/api/user', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ op: 'quiet-time', googleId, enabled, ...(until ? { until } : {}) }),
      });
      if (r.ok) {
        const data = await r.json();
        setQuietSince(data.quiet_time_since ?? null);
        if (!data.quiet_time_since) setQuietUntil('');
      }
    } catch {}
    setQuietBusy(false);
  }, [quietBusy, googleId]);

  const toggleQuietTime = () => saveQuietTime(!quietSince, quietUntil);

  // Avatar upload — resizes client-side, saves immediately (update-profile
  // customAvatarUrl), and updates the locally cached user so the sidebar
  // matches. The original Google picture is kept for "remove".
  const handleAvatarFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || avatarBusy) return;
    setAvatarBusy(true);
    try {
      const dataUrl = await resizeImage(file, 128);
      if (!localStorage.getItem('googlePictureOriginal') && user?.picture) {
        localStorage.setItem('googlePictureOriginal', user.picture);
      }
      const r = await fetch('/api/user', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ op: 'update-profile', googleId, displayName: displayName.trim() || null, showEmail, showPhone, phoneNumber: phoneNumber.trim() || null, customAvatarUrl: dataUrl }),
      });
      if (r.ok) {
        setAvatarUrl(dataUrl);
        if (user) login({ ...user, picture: dataUrl });
      }
    } catch {}
    setAvatarBusy(false);
  };

  const removeAvatar = async () => {
    if (avatarBusy) return;
    setAvatarBusy(true);
    const original = localStorage.getItem('googlePictureOriginal') || user?.picture || null;
    try {
      const r = await fetch('/api/user', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ op: 'update-profile', googleId, displayName: displayName.trim() || null, showEmail, showPhone, phoneNumber: phoneNumber.trim() || null, customAvatarUrl: null, googlePictureUrl: original }),
      });
      if (r.ok) {
        setAvatarUrl(null);
        if (user && original) login({ ...user, picture: original });
      }
    } catch {}
    setAvatarBusy(false);
  };

  // Fresh friend code — the old one stops working immediately.
  const regenerateCode = async () => {
    if (regenBusy) return;
    if (!window.confirm('Generate a new friend code? Your current code will stop working.')) return;
    setRegenBusy(true);
    try {
      const r = await fetch('/api/user', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ op: 'regenerate-code', googleId }),
      });
      if (r.ok) setFriendCode((await r.json()).friendCode ?? friendCode);
    } catch {}
    setRegenBusy(false);
  };

  const unblock = async (userId) => {
    try {
      await fetch('/api/friends', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ op: 'unblock', googleId, userId }),
      });
      setBlocked(prev => prev.filter(b => b.id !== userId));
    } catch {}
  };

  const copyFriendCode = () => {
    navigator.clipboard.writeText(friendCode).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch('/api/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          op: 'update-profile',
          googleId,
          displayName: displayName.trim() || null,
          showEmail,
          showPhone,
          phoneNumber: phoneNumber.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setSaveMsg({ type: 'success', text: 'Profile saved!' });
    } catch (err) {
      setSaveMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile-page">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <PageHeader title="Profile" onMenu={() => setSidebarOpen(true)} />

      {loading ? (
        <div className="profile-loading"><Loader size={20} className="spinner" /> Loading…</div>
      ) : (
        <div className="profile-content">

          {/* Identity card — name/email from Google; the picture can be
              overridden with an uploaded avatar (saved instantly). */}
          <div className="profile-card identity-card">
            <div className="avatar-wrap">
              {(avatarUrl || user?.picture) && (
                <img src={avatarUrl || user.picture} alt={user?.name} className="profile-avatar" />
              )}
              <button
                className="avatar-edit-btn"
                title="Upload a custom avatar"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarBusy}
              >
                <Camera size={13} />
              </button>
              <input type="file" accept="image/*" ref={avatarInputRef} style={{ display: 'none' }}
                onChange={handleAvatarFile} />
              {avatarUrl && (
                <button className="avatar-remove-btn" onClick={removeAvatar} disabled={avatarBusy}>
                  Use Google photo
                </button>
              )}
            </div>
            <div className="identity-info">
              <p className="identity-name">{user?.name}</p>
              <p className="identity-email">{user?.email}</p>
              {friendCode && (
                <p className="identity-code">
                  Friend code: <span className="identity-code-value">{friendCode}</span>
                  <button className="identity-code-copy" onClick={copyFriendCode}>
                    {codeCopied ? 'Copied!' : 'Copy'}
                  </button>
                </p>
              )}
            </div>
          </div>

          {/* Editable fields */}
          <div className="profile-card">
            <h2>Edit Profile</h2>

            <div className="field-group">
              <label htmlFor="displayName">Display name</label>
              <p className="field-hint">Shown to friends instead of your Google name</p>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !saving) handleSave(); }}
                placeholder={user?.name ?? 'Enter a display name'}
                maxLength={50}
              />
            </div>

            <div className="field-group">
              <label htmlFor="phoneNumber">Phone number</label>
              <p className="field-hint">Optional — visible to friends on your contact card</p>
              <input
                id="phoneNumber"
                type="tel"
                value={phoneNumber}
                onChange={handlePhoneChange}
                onKeyDown={e => { if (e.key === 'Enter' && !saving) handleSave(); }}
                placeholder="+1 (555) 000-0000"
                maxLength={20}
              />
            </div>

            <div className="field-group toggle-group">
              <div className="toggle-label">
                <label htmlFor="showEmail">Show email to friends</label>
                <p className="field-hint">When off, your email is hidden on your contact card</p>
              </div>
              <button
                id="showEmail"
                role="switch"
                aria-checked={showEmail}
                className={`toggle ${showEmail ? 'on' : 'off'}`}
                onClick={() => setShowEmail(v => !v)}
              >
                <span className="toggle-thumb" />
              </button>
            </div>

            <div className="field-group toggle-group">
              <div className="toggle-label">
                <label htmlFor="showPhone">Show phone number to friends</label>
                <p className="field-hint">When off, your number is hidden on your contact card</p>
              </div>
              <button
                id="showPhone"
                role="switch"
                aria-checked={showPhone}
                className={`toggle ${showPhone ? 'on' : 'off'}`}
                onClick={() => setShowPhone(v => !v)}
              >
                <span className="toggle-thumb" />
              </button>
            </div>

            <div className="save-row">
              {saveMsg && (
                <p className={`save-msg ${saveMsg.type}`}>{saveMsg.text}</p>
              )}
              <button className="save-btn" onClick={handleSave} disabled={saving}>
                {saving ? <Loader size={16} className="spinner" /> : <Save size={16} />}
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>

          {/* Quiet Time — while on, nobody can schedule events with you */}
          <div className="profile-card">
            <h2>Quiet Time</h2>
            <div className="field-group toggle-group">
              <div className="toggle-label">
                <label htmlFor="quietTime">Quiet Time</label>
                <p className="field-hint">
                  While on, friends can't schedule anything with you — they'll be told to try again later.
                  {quietSince && (
                    <> On since {new Date(quietSince).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}. We'll remind you after 24 hours.</>
                  )}
                </p>
              </div>
              <button
                id="quietTime"
                role="switch"
                aria-checked={Boolean(quietSince)}
                className={`toggle ${quietSince ? 'on' : 'off'}`}
                onClick={toggleQuietTime}
                disabled={quietBusy}
              >
                <span className="toggle-thumb" />
              </button>
            </div>

            {/* Optional auto-off: past this moment Quiet Time reads as off. */}
            {quietSince && (
              <div className="field-group">
                <label htmlFor="quietUntil">Turn off automatically at</label>
                <p className="field-hint">Optional — Quiet Time ends on its own at this time</p>
                <div className="quiet-until-row">
                  <input
                    id="quietUntil"
                    type="datetime-local"
                    value={quietUntil}
                    onChange={e => setQuietUntil(e.target.value)}
                  />
                  <button className="pref-add-btn" disabled={quietBusy}
                    onClick={() => saveQuietTime(true, quietUntil)}>
                    {quietBusy ? 'Saving…' : 'Set'}
                  </button>
                </div>
              </div>
            )}

            {/* Daily quiet hours: no event may START inside this window. */}
            <div className="field-group toggle-group">
              <div className="toggle-label">
                <label htmlFor="quietHours">Daily quiet hours</label>
                <p className="field-hint">
                  Friends can't schedule events starting between these times (your local time)
                </p>
              </div>
              <button
                id="quietHours"
                role="switch"
                aria-checked={prefsState.quietHours.enabled}
                className={`toggle ${prefsState.quietHours.enabled ? 'on' : 'off'}`}
                onClick={() => changePref({ quietHours: { ...prefsState.quietHours, enabled: !prefsState.quietHours.enabled } })}
              >
                <span className="toggle-thumb" />
              </button>
            </div>
            {prefsState.quietHours.enabled && (
              <div className="quiet-hours-row">
                <input type="time" value={prefsState.quietHours.start}
                  onChange={e => changePref({ quietHours: { ...prefsState.quietHours, start: e.target.value } })} />
                <span className="quiet-hours-sep">to</span>
                <input type="time" value={prefsState.quietHours.end}
                  onChange={e => changePref({ quietHours: { ...prefsState.quietHours, end: e.target.value } })} />
              </div>
            )}
          </div>

          {/* Appearance — theme + accent, applied instantly app-wide */}
          <div className="profile-card">
            <h2>Appearance</h2>

            <div className="field-group">
              <label>Theme</label>
              <p className="field-hint">System follows your device's light/dark setting</p>
              <div className="theme-row">
                {['light', 'dark', 'system'].map(t => (
                  <button
                    key={t}
                    className={`theme-opt${prefsState.theme === t ? ' active' : ''}`}
                    onClick={() => changePref({ theme: t })}
                  >{t[0].toUpperCase() + t.slice(1)}</button>
                ))}
              </div>
            </div>

            <div className="field-group">
              <label>Accent color</label>
              <p className="field-hint">Used for buttons and highlights everywhere</p>
              <div className="accent-row">
                {ACCENTS.map(a => (
                  <button
                    key={a.accent}
                    className={`accent-swatch${prefsState.accent === a.accent ? ' active' : ''}`}
                    style={{ background: a.accent }}
                    title={a.name}
                    onClick={() => changePref({ accent: a.accent })}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Notifications — per-category toggles, applied instantly */}
          <div className="profile-card">
            <h2>Notifications</h2>
            {[
              ['events',         'Event activity',   'Invites, accepts, declines, and reschedules in the bell'],
              ['groupInvites',   'Group invites',    'Invitations to join groups'],
              ['friendRequests', 'Friend requests',  'New friend requests in the bell'],
              ['dmToasts',       'Message pop-ups',  'The corner toast when a new message arrives'],
            ].map(([key, label, hint]) => (
              <div className="field-group toggle-group" key={key}>
                <div className="toggle-label">
                  <label htmlFor={`nt-${key}`}>{label}</label>
                  <p className="field-hint">{hint}</p>
                </div>
                <button
                  id={`nt-${key}`}
                  role="switch"
                  aria-checked={prefsState.notifications[key]}
                  className={`toggle ${prefsState.notifications[key] ? 'on' : 'off'}`}
                  onClick={() => changePref({ notifications: { ...prefsState.notifications, [key]: !prefsState.notifications[key] } })}
                >
                  <span className="toggle-thumb" />
                </button>
              </div>
            ))}
          </div>

          {/* Privacy — availability sharing, friend code, blocked users */}
          <div className="profile-card">
            <h2>Privacy</h2>

            <div className="field-group">
              <label>Calendar availability</label>
              <p className="field-hint">What friends can learn about your free/busy time (never event details)</p>
              <div className="sharing-opts">
                {[
                  ['off',     'Private',            'Not even the assistant reads your calendar for others'],
                  ['ai',      'Assistant only',     'The scheduling assistant may use it to find times (default)'],
                  ['friends', 'Friends can see',    'Friends also see your free/busy strip on your contact card'],
                ].map(([value, label, hint]) => (
                  <button
                    key={value}
                    className={`sharing-opt${prefsState.availabilitySharing === value ? ' active' : ''}`}
                    onClick={() => changePref({ availabilitySharing: value })}
                  >
                    <span className="sharing-opt-label">{label}</span>
                    <span className="sharing-opt-hint">{hint}</span>
                  </button>
                ))}
              </div>
              <p className="field-hint">You can override this per friend from their contact card.</p>
            </div>

            <div className="field-group">
              <label>Friend code</label>
              <p className="field-hint">Shared it too widely? A new code invalidates the old one; existing friends are unaffected.</p>
              <button className="pref-add-btn" onClick={regenerateCode} disabled={regenBusy}>
                {regenBusy ? 'Generating…' : 'Generate new code'}
              </button>
            </div>

            {blocked.length > 0 && (
              <div className="field-group">
                <label>Blocked users</label>
                <p className="field-hint">Blocked users can't send you requests or messages</p>
                <ul className="blocked-list">
                  {blocked.map(b => (
                    <li key={b.id} className="blocked-item">
                      {b.picture_url && <img src={b.picture_url} alt="" className="blocked-avatar" />}
                      <span className="blocked-name">{b.display_name || b.name}</span>
                      <button className="pref-add-btn" onClick={() => unblock(b.id)}>Unblock</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Scheduling Assistant — preferences it schedules around */}
          {prefs && (
            <div className="profile-card">
              <h2>Preferences</h2>

              <div className="field-group">
                <label>Anything to keep in mind about you?</label>
                <p className="field-hint">
                  Add your own (e.g. “I'm not a morning person”)
                </p>

                <div className="pref-add-row">
                  <input
                    className="pref-add-input"
                    type="text"
                    placeholder="e.g. I'm not a morning person"
                    value={prefInput}
                    maxLength={120}
                    onChange={e => setPrefInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addPreference()}
                    disabled={prefBusy}
                  />
                  <button className="pref-add-btn" onClick={addPreference} disabled={prefBusy || !prefInput.trim()}>
                    {prefBusy ? 'Adding…' : 'Add'}
                  </button>
                </div>

                {prefs.hard_constraints.length === 0 && prefs.soft_constraints.length === 0 ? (
                  <p className="pref-empty">Nothing yet — add one above, or tell the assistant things like “I never do weekday lunches”.</p>
                ) : (
                  <ul className="pref-list">
                    {prefs.hard_constraints.map(c => (
                      <li key={`h-${c}`} className="pref-chip hard">
                        <span>{c}</span>
                        <button className="pref-chip-x" title="Remove" onClick={() => removeConstraint(c)}><X size={11} /></button>
                      </li>
                    ))}
                    {prefs.soft_constraints.map(c => (
                      <li key={`s-${c}`} className="pref-chip">
                        <span>{c}</span>
                        <button className="pref-chip-x" title="Remove" onClick={() => removeConstraint(c)}><X size={11} /></button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
};

export default ProfilePage;
