import React, { useState, useEffect } from 'react';
import { Menu, Save, Loader } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../contexts/AuthContext';
import supabase from '../utils/supabaseClient';
import './ProfilePage.css';

const ProfilePage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [showEmail, setShowEmail]     = useState(true);
  const [phoneNumber, setPhoneNumber] = useState('');

  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saveMsg, setSaveMsg]   = useState(null); // { type: 'success'|'error', text }

  const googleId = localStorage.getItem('googleUserId');

  // Load current profile values from Supabase on mount
  useEffect(() => {
    if (!supabase || !googleId) { setLoading(false); return; }
    supabase
      .from('users')
      .select('display_name, show_email, phone_number')
      .eq('google_id', googleId)
      .single()
      .then(({ data, error }) => {
        if (!error && data) {
          setDisplayName(data.display_name ?? '');
          setShowEmail(data.show_email ?? true);
          setPhoneNumber(data.phone_number ?? '');
        }
        setLoading(false);
      });
  }, [googleId]);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch('/api/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
                onChange={e => setPhoneNumber(e.target.value)}
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

        </div>
      )}
    </div>
  );
};

export default ProfilePage;
