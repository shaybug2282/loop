import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import './FriendsWidget.css';

// Dashboard widget: shows friend count, pending requests badge, and quick navigation.
const FriendsWidget = () => {
  const navigate = useNavigate();
  const [friendCount,  setFriendCount]  = useState(null);
  const [requestCount, setRequestCount] = useState(0);
  const [friends,      setFriends]      = useState([]);

  useEffect(() => {
    const googleId = localStorage.getItem('googleUserId');
    if (!googleId) return;
    fetch(`/api/get-friends-data?googleId=${encodeURIComponent(googleId)}`)
      .then(r => r.json())
      .then(d => {
        setFriends(d.friends ?? []);
        setFriendCount((d.friends ?? []).length);
        setRequestCount((d.requests ?? []).length);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="friends-widget">
      <div className="fw-header">
        <div className="fw-title">
          <UserPlus size={20} />
          <h2>Friends</h2>
          {requestCount > 0 && (
            <span className="fw-badge">{requestCount}</span>
          )}
        </div>
        <button className="fw-view-all" onClick={() => navigate('/friends')}>
          View all
        </button>
      </div>

      {friendCount === null && <p className="fw-loading">Loading…</p>}

      {friendCount === 0 && (
        <div className="fw-empty">
          <p>No friends yet</p>
          <button className="fw-add-btn" onClick={() => navigate('/friends')}>
            Add a friend
          </button>
        </div>
      )}

      {friendCount > 0 && (
        <ul className="fw-list">
          {friends.slice(0, 5).map(f => (
            <li key={f.id} className="fw-item" onClick={() => navigate('/friends')} role="button" tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && navigate('/friends')}>
              {f.picture_url
                ? <img src={f.picture_url} alt={f.display_name || f.name} className="fw-avatar" />
                : <div className="fw-avatar placeholder">{(f.display_name || f.name)?.[0]}</div>}
              <span className="fw-name">{f.display_name || f.name}</span>
            </li>
          ))}
          {friends.length > 5 && (
            <li className="fw-more" onClick={() => navigate('/friends')} role="button" tabIndex={0}>
              +{friends.length - 5} more
            </li>
          )}
        </ul>
      )}
    </div>
  );
};

export default FriendsWidget;
