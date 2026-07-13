import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Menu, Save, Loader, Home, Sparkles, X } from 'lucide-react';
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
  const [phoneNumber, setPhoneNumber] = useState('');

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
          setPhoneNumber(data.phone_number ?? '');
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

  const setReplyStyle = useCallback(async (style) => {
    setPrefs(prev => prev && { ...prev, reply_style: style });
    try {
      await fetch('/api/ai', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ op: 'set-reply-style', googleId, style }),
      });
    } catch {}
  }, [googleId]);

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

          {/* Scheduling Assistant — learned rules & reply style */}
          {prefs && (
            <div className="profile-card">
              <h2><Sparkles size={15} /> Scheduling Assistant</h2>

              <div className="field-group">
                <label>Things it remembers about you</label>
                <p className="field-hint">
                  Rules the assistant saved from your chats and reschedule notes — it schedules around these. Remove any that shouldn't stick.
                </p>
                {prefs.hard_constraints.length === 0 && prefs.soft_constraints.length === 0 ? (
                  <p className="pref-empty">Nothing yet — tell the assistant things like “I never do weekday lunches” and they'll show up here.</p>
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

              <div className="field-group">
                <label>Reply length</label>
                <p className="field-hint">
                  “Auto” learns from how you write; pinning Brief or Detailed overrides that.
                </p>
                <div className="style-row" role="radiogroup" aria-label="Assistant reply length">
                  {[['brief', 'Brief'], ['neutral', 'Auto'], ['detailed', 'Detailed']].map(([val, label]) => (
                    <button
                      key={val}
                      role="radio"
                      aria-checked={prefs.reply_style === val}
                      className={`style-btn${prefs.reply_style === val ? ' active' : ''}`}
                      onClick={() => setReplyStyle(val)}
                    >{label}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
};

export default ProfilePage;
