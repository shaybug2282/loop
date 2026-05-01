import React, { useState, useEffect, useCallback } from 'react';
import { Menu, UserPlus, Check, X, Copy, ChevronDown, ChevronUp } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import './FriendsPage.css';

const FriendsPage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [friendCode, setFriendCode] = useState('');
  const [requests, setRequests] = useState([]);
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Add-friend input state
  const [addOpen, setAddOpen] = useState(false);
  const [inputCode, setInputCode] = useState('');
  const [addStatus, setAddStatus] = useState(null); // { type: 'success'|'error', message }
  const [addLoading, setAddLoading] = useState(false);

  const [copied, setCopied] = useState(false);

  const googleId = localStorage.getItem('googleUserId');

  // Fetch all friends data on mount
  const loadData = useCallback(async () => {
    if (!googleId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/get-friends-data?googleId=${encodeURIComponent(googleId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load friends data');
      setFriendCode(data.friendCode ?? '');
      setRequests(data.requests ?? []);
      setFriends(data.friends ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [googleId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Copy own friend code to clipboard
  const handleCopy = () => {
    navigator.clipboard.writeText(friendCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Send a friend request by code
  const handleAddFriend = async () => {
    if (!inputCode.trim()) return;
    setAddLoading(true);
    setAddStatus(null);
    try {
      const res = await fetch('/api/send-friend-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderGoogleId: googleId, friendCode: inputCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send request');
      setAddStatus({ type: 'success', message: 'Friend request sent!' });
      setInputCode('');
    } catch (err) {
      setAddStatus({ type: 'error', message: err.message });
    } finally {
      setAddLoading(false);
    }
  };

  // Accept or reject an incoming request
  const handleRespond = async (requestId, action) => {
    try {
      const res = await fetch('/api/respond-friend-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ googleId, requestId, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to respond');
      // Refresh data to reflect accepted friendship or dismissed request
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="friends-page">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="friends-header">
        <button className="menu-btn" onClick={() => setSidebarOpen(true)}>
          <Menu size={24} />
        </button>
        <h1>Friends</h1>
      </div>

      {loading && <div className="friends-loading">Loading...</div>}
      {error && <div className="friends-error">{error}</div>}

      {!loading && (
        <div className="friends-content">

          {/* ── Requests Section ── */}
          <section className="friends-section">
            <div className="section-header">
              <h2>Requests</h2>
              <button
                className="add-friend-btn"
                onClick={() => { setAddOpen(o => !o); setAddStatus(null); }}
              >
                <UserPlus size={16} />
                Add Friend
                {addOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>

            {addOpen && (
              <div className="add-friend-panel">
                <div className="add-friend-row">
                  <input
                    className="friend-code-input"
                    type="text"
                    placeholder="Enter friend code"
                    value={inputCode}
                    onChange={e => setInputCode(e.target.value.toUpperCase())}
                    onKeyDown={e => e.key === 'Enter' && handleAddFriend()}
                    maxLength={15}
                  />
                  <button
                    className="send-btn"
                    onClick={handleAddFriend}
                    disabled={addLoading || !inputCode.trim()}
                  >
                    {addLoading ? 'Sending…' : 'Send'}
                  </button>
                </div>
                {addStatus && (
                  <p className={`add-status ${addStatus.type}`}>{addStatus.message}</p>
                )}
              </div>
            )}

            {requests.length === 0 ? (
              <p className="empty-state">No pending requests</p>
            ) : (
              <ul className="request-list">
                {requests.map(req => (
                  <li key={req.id} className="request-item">
                    {req.sender.picture_url && (
                      <img src={req.sender.picture_url} alt={req.sender.name} className="avatar" />
                    )}
                    <div className="request-info">
                      <span className="request-name">{req.sender.name}</span>
                      <span className="request-email">{req.sender.email}</span>
                    </div>
                    <div className="request-actions">
                      <button
                        className="accept-btn"
                        onClick={() => handleRespond(req.id, 'accept')}
                        title="Accept"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        className="reject-btn"
                        onClick={() => handleRespond(req.id, 'reject')}
                        title="Decline"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── Friends Section ── */}
          <section className="friends-section">
            <div className="section-header">
              <h2>Friends</h2>
            </div>

            {/* Own friend code */}
            {friendCode && (
              <div className="my-code-row">
                <span className="my-code-label">Your friend code:</span>
                <span className="my-code">{friendCode}</span>
                <button className="copy-btn" onClick={handleCopy} title="Copy">
                  <Copy size={14} />
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            )}

            {friends.length === 0 ? (
              <p className="empty-state">No friends yet — share your code to get started</p>
            ) : (
              <ul className="friends-list">
                {friends.map(friend => (
                  <li key={friend.id} className="friend-item">
                    {friend.picture_url && (
                      <img src={friend.picture_url} alt={friend.name} className="avatar" />
                    )}
                    <div className="friend-info">
                      <span className="friend-name">{friend.name}</span>
                      <span className="friend-email">{friend.email}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

        </div>
      )}
    </div>
  );
};

export default FriendsPage;
