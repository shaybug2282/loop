import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, UserPlus, Check, X, Copy, ChevronDown, ChevronUp, Clock, Tag, MessageSquare, UserMinus } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import './FriendsPage.css';

// ── Friend Contact Card Popup ──────────────────────────────────────────────
const FriendPopup = ({ friend, onClose, onUnfriend }) => {
  const navigate = useNavigate();
  const [unfriendConfirm, setUnfriendConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const googleId = localStorage.getItem('googleUserId');
  const displayName = friend.display_name || friend.name;

  const handleUnfriend = async () => {
    if (!unfriendConfirm) { setUnfriendConfirm(true); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/unfriend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ googleId, friendUserId: friend.id }),
      });
      if (!res.ok) throw new Error();
      onUnfriend(friend.id);
      onClose();
    } catch {
      setLoading(false);
      setUnfriendConfirm(false);
    }
  };

  // Close on backdrop click
  const handleBackdrop = e => { if (e.target === e.currentTarget) onClose(); };

  return (
    <div className="popup-backdrop" onClick={handleBackdrop}>
      <div className="popup-card">
        <button className="popup-close" onClick={onClose}><X size={18} /></button>

        {/* Contact info */}
        <div className="popup-identity">
          {friend.picture_url && (
            <img src={friend.picture_url} alt={displayName} className="popup-avatar" />
          )}
          <div className="popup-names">
            <h2 className="popup-display-name">{displayName}</h2>
            {friend.show_email && friend.email && (
              <p className="popup-email">{friend.email}</p>
            )}
            {friend.phone_number && (
              <p className="popup-phone">{friend.phone_number}</p>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="popup-actions">
          <button className="popup-btn tag-btn" disabled title="Coming soon">
            <Tag size={16} />
            Tag
          </button>

          <button
            className="popup-btn message-btn"
            onClick={() => navigate('/messages', { state: { friend } })}
          >
            <MessageSquare size={16} />
            Message
          </button>


          <button
            className={`popup-btn unfriend-btn ${unfriendConfirm ? 'confirm' : ''}`}
            onClick={handleUnfriend}
            disabled={loading}
          >
            <UserMinus size={16} />
            {loading ? 'Removing…' : unfriendConfirm ? 'Confirm?' : 'Unfriend'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main Page ──────────────────────────────────────────────────────────────
const FriendsPage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [friendCode, setFriendCode]   = useState('');
  const [requests, setRequests]       = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [friends, setFriends]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);

  const [addOpen, setAddOpen]       = useState(false);
  const [inputCode, setInputCode]   = useState('');
  const [addStatus, setAddStatus]   = useState(null);
  const [addLoading, setAddLoading] = useState(false);

  const [copied, setCopied]         = useState(false);
  const [selectedFriend, setSelectedFriend] = useState(null);

  const googleId = localStorage.getItem('googleUserId');

  const loadData = useCallback(async () => {
    if (!googleId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/get-friends-data?googleId=${encodeURIComponent(googleId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setFriendCode(data.friendCode ?? '');
      setRequests(data.requests ?? []);
      setSentRequests(data.sentRequests ?? []);
      setFriends(data.friends ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [googleId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCopy = () => {
    navigator.clipboard.writeText(friendCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

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
      loadData(); // refresh to show the new sent request
    } catch (err) {
      setAddStatus({ type: 'error', message: err.message });
    } finally {
      setAddLoading(false);
    }
  };

  const handleRespond = async (requestId, action) => {
    try {
      const res = await fetch('/api/respond-friend-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ googleId, requestId, action }),
      });
      if (!res.ok) throw new Error();
      loadData();
    } catch {
      setError('Failed to respond to request');
    }
  };

  // Called by FriendPopup after a successful unfriend
  const handleUnfriended = (removedId) => {
    setFriends(prev => prev.filter(f => f.id !== removedId));
  };

  const hasRequests = requests.length > 0 || sentRequests.length > 0;

  return (
    <div className="friends-page">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {selectedFriend && (
        <FriendPopup
          friend={selectedFriend}
          onClose={() => setSelectedFriend(null)}
          onUnfriend={handleUnfriended}
        />
      )}

      <div className="friends-header">
        <button className="menu-btn" onClick={() => setSidebarOpen(true)}>
          <Menu size={24} />
        </button>
        <h1>Friends</h1>
      </div>

      {loading && <div className="friends-loading">Loading…</div>}
      {error   && <div className="friends-error">{error}</div>}

      {!loading && (
        <div className="friends-content">

          {/* ── Requests Section ── */}
          <section className="friends-section">
            <div className="section-header">
              <h2>
                Requests
                {hasRequests && (
                  <span className="badge">{requests.length + sentRequests.length}</span>
                )}
              </h2>
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

            {!hasRequests ? (
              <p className="empty-state">No pending requests</p>
            ) : (
              <ul className="request-list">
                {/* Incoming requests */}
                {requests.map(req => (
                  <li key={req.id} className="request-item">
                    {req.sender.picture_url && (
                      <img src={req.sender.picture_url} alt={req.sender.name} className="avatar" />
                    )}
                    <div className="request-info">
                      <span className="request-name">
                        {req.sender.display_name || req.sender.name}
                      </span>
                      <span className="request-email">{req.sender.email}</span>
                    </div>
                    <div className="request-actions">
                      <button className="accept-btn" onClick={() => handleRespond(req.id, 'accept')} title="Accept">
                        <Check size={16} />
                      </button>
                      <button className="reject-btn" onClick={() => handleRespond(req.id, 'reject')} title="Decline">
                        <X size={16} />
                      </button>
                    </div>
                  </li>
                ))}

                {/* Outgoing pending requests */}
                {sentRequests.map(req => (
                  <li key={req.id} className="request-item sent-request">
                    {req.receiver.picture_url && (
                      <img src={req.receiver.picture_url} alt={req.receiver.name} className="avatar" />
                    )}
                    <div className="request-info">
                      <span className="request-name">
                        {req.receiver.display_name || req.receiver.name}
                      </span>
                      <span className="request-email">{req.receiver.email}</span>
                    </div>
                    <span className="pending-label">
                      <Clock size={12} />
                      Pending
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── Friends Section ── */}
          <section className="friends-section">
            <div className="section-header">
              <h2>Friends {friends.length > 0 && <span className="friend-count">{friends.length}</span>}</h2>
            </div>

            {friendCode && (
              <div className="my-code-row">
                <span className="my-code-label">Your friend code:</span>
                <span className="my-code">{friendCode}</span>
                <button className="copy-btn" onClick={handleCopy}>
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
                  <li
                    key={friend.id}
                    className="friend-item"
                    onClick={() => setSelectedFriend(friend)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && setSelectedFriend(friend)}
                  >
                    {friend.picture_url && (
                      <img src={friend.picture_url} alt={friend.name} className="avatar" />
                    )}
                    <div className="friend-info">
                      <span className="friend-name">{friend.display_name || friend.name}</span>
                      {friend.show_email && (
                        <span className="friend-email">{friend.email}</span>
                      )}
                    </div>
                    <span className="friend-chevron">›</span>
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
