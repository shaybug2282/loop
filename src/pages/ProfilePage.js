import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Menu, Save, Loader, Home, Sparkles, X, Copy, Moon, Plus } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../contexts/AuthContext';
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
  const { user } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [showEmail, setShowEmail]     = useState(true);
  const [showPhone, setShowPhone]     = useState(true);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [friendCode, setFriendCode]   = useState('');
  const [codeCopied, setCodeCopied]   = useState(false);
  // Quiet Time: ISO timestamp while on, null while off. Toggling saves
  // immediately (its own API op) — it isn't part of the Save button flow.
  const [quietSince, setQuietSince]   = useState(null);
  const [quietBusy,  setQuietBusy]    = useState(false);

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
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [googleId]);

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

  // Quiet Time toggle — saves immediately; while on, nobody can schedule you.
  const toggleQuietTime = useCallback(async () => {
    if (quietBusy) return;
    setQuietBusy(true);
    const enabled = !quietSince;
    try {
      const r = await fetch('/api/user', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ op: 'quiet-time', googleId, enabled }),
      });
      if (r.ok) {
        const data = await r.json();
        setQuietSince(data.quiet_time_since ?? null);
      }
    } catch {}
    setQuietBusy(false);
  }, [quietBusy, quietSince, googleId]);

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

      <div className="profile-header">
        <Link to="/dashboard" className="home-btn" title="Dashboard"><Home size={18} /></Link>
        <button className="menu-btn" onClick={() => setSidebarOpen(true)}>
          <Menu size={24} />
        </button>
        <h1>Profile</h1>
      </div>

      {loading ? (
        <div className="profile-loading"><Loader size={20} className="spinner" /> Loading…</div>
      ) : (
        <div className="profile-content">

          {/* Identity card (read-only, from Google) */}
          <div className="profile-card identity-card">
            {user?.picture && (
              <img src={user.picture} alt={user.name} className="profile-avatar" />
            )}
            <div className="identity-info">
              <p className="identity-name">{user?.name}</p>
              <p className="identity-email">{user?.email}</p>
              {friendCode && (
                <p className="identity-code">
                  Friend code: <span className="identity-code-value">{friendCode}</span>
                  <button className="identity-code-copy" onClick={copyFriendCode}>
                    <Copy size={12} /> {codeCopied ? 'Copied!' : 'Copy'}
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
            <h2><Moon size={15} /> Quiet Time</h2>
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
          </div>

          {/* Scheduling Assistant — preferences it schedules around */}
          {prefs && (
            <div className="profile-card">
              <h2><Sparkles size={15} /> Preferences</h2>

              <div className="field-group">
                <label>Things the assistant remembers about you</label>
                <p className="field-hint">
                  Add your own (e.g. “I'm not a morning person”) — the assistant also saves rules you state in chats and reschedule notes. Remove any that shouldn't stick.
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
                    <Plus size={13} /> {prefBusy ? 'Adding…' : 'Add'}
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
