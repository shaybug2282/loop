import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, UserPlus, MessageSquare } from 'lucide-react';
import { useMessages } from '../contexts/MessagesContext';
import { Panel, PanelHeader } from './Panel';
import './FriendsWidget.css';

// Dashboard friends panel: shows friends with contact info and a direct-message shortcut.
const FriendsWidget = () => {
  const navigate = useNavigate();
  const { openMessages } = useMessages();
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
    openMessages(friend);
  };

  return (
    <Panel className="friends-widget">
      <PanelHeader icon={Users} title="Friends" badge={requestCount}>
        <button className="fw-view-all" onClick={() => navigate('/friends')}>
          View all
        </button>
      </PanelHeader>

      <div className="fw-body">
        {loading && <p className="fw-loading">Loading…</p>}

        {!loading && friends.length === 0 && (
          <div className="fw-empty">
            <UserPlus size={36} strokeWidth={1.4} className="fw-empty-icon" />
            <p>No friends here yet</p>
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

                  {/* Name + picture only — contact details live in the Friends
                      page popup card. */}
                  <div className="fw-info">
                    <span className="fw-name">{displayName}</span>
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
    </Panel>
  );
};

export default FriendsWidget;
