import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, UserPlus, MessageSquare, Mail, Phone } from 'lucide-react';
import './FriendsWidget.css';

// Dashboard friends panel: shows friends with contact info and a direct-message shortcut.
const FriendsWidget = () => {
  const navigate = useNavigate();
  const [friends,      setFriends]      = useState([]);
  const [requestCount, setRequestCount] = useState(0);
  const [loading,      setLoading]      = useState(true);

  useEffect(() => {
    const googleId = localStorage.getItem('googleUserId');
    if (!googleId) { setLoading(false); return; }
    fetch(`/api/friends?op=data&googleId=${encodeURIComponent(googleId)}`)
      .then(r => r.json())
      .then(d => {
        setFriends(d.friends ?? []);
        setRequestCount((d.requests ?? []).length);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleMessage = (e, friend) => {
    e.stopPropagation();
    navigate('/messages', { state: { friend } });
  };

  return (
    <div className="friends-widget">
      <div className="fw-header">
        <div className="fw-title">
          <Users size={20} />
          <h2>Friends</h2>
          {requestCount > 0 && (
            <span className="fw-badge">{requestCount}</span>
          )}
        </div>
        <button className="fw-view-all" onClick={() => navigate('/friends')}>
          View all
        </button>
      </div>

      {loading && <p className="fw-loading">Loading…</p>}

      {!loading && friends.length === 0 && (
        <div className="fw-empty">
          <UserPlus size={36} strokeWidth={1.4} className="fw-empty-icon" />
          <p>No friends yet</p>
          <button className="fw-add-btn" onClick={() => navigate('/friends')}>
            Add a friend
          </button>
        </div>
      )}

      {!loading && friends.length > 0 && (
        <ul className="fw-list">
          {friends.map(f => {
            const displayName = f.display_name || f.name;
            return (
              <li
                key={f.id}
                className="fw-item"
                onClick={() => navigate('/friends')}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && navigate('/friends')}
              >
                {f.picture_url
                  ? <img src={f.picture_url} alt={displayName} className="fw-avatar" />
                  : <div className="fw-avatar placeholder">{displayName?.[0]?.toUpperCase()}</div>}

                <div className="fw-info">
                  <span className="fw-name">{displayName}</span>
                  {f.show_email && f.email && (
                    <span className="fw-detail">
                      <Mail size={11} />
                      {f.email}
                    </span>
                  )}
                  {f.phone_number && (
                    <span className="fw-detail">
                      <Phone size={11} />
                      {f.phone_number}
                    </span>
                  )}
                </div>

                <button
                  className="fw-msg-btn"
                  title={`Message ${displayName}`}
                  onClick={e => handleMessage(e, f)}
                >
                  <MessageSquare size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default FriendsWidget;
