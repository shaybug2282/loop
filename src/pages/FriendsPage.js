import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  UserPlus, Check, X, Copy, Clock, Tag, MessageSquare, UserMinus,
  Users, Inbox, Search, Star, BellOff, Ban, Calendar, Sparkles, Moon, ChevronRight,
} from 'lucide-react';
import Sidebar from '../components/Sidebar';
import PageHeader from '../components/PageHeader';
import GroupsWidget from '../components/GroupsWidget';
import SchedulingAssistant from '../components/SchedulingAssistant';
import EventPopup from '../components/EventPopup';
import { useMessages } from '../contexts/MessagesContext';
import { syncMutedFromFriends } from '../utils/unread';
import './FriendsPage.css';

// Glint — the availability dot on a friend row: quiet time beats everything,
// then free/busy right now (only for friends who share their availability).
const Glint = ({ glint }) => {
  if (!glint) return null;
  if (glint.quiet) return <span className="glint glint-quiet" title="Quiet Time — can't be scheduled right now"><Moon size={9} /></span>;
  if (!glint.shared || glint.freeNow === undefined) return null;
  return glint.freeNow
    ? <span className="glint glint-free" title="Free right now" />
    : <span className="glint glint-busy" title="Busy right now" />;
};

// AvailabilityStrip — a friend's next 7 days at a glance. Deliberately
// coarse (free / some plans / busy per day) so it never leaks event details.
const AvailabilityStrip = ({ friendId }) => {
  const [state, setState] = useState(null); // null=loading | {shared, quiet, days?}
  const googleId = localStorage.getItem('googleUserId');

  useEffect(() => {
    let alive = true;
    fetch(`/api/friends?op=availability&googleId=${encodeURIComponent(googleId)}&friendUserId=${friendId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!alive || !d) { if (alive) setState({ shared: false }); return; }
        if (!d.shared) { setState({ shared: false, quiet: d.quiet }); return; }
        // Bucket busy time per day (hours between 09:00 and 22:00 local).
        const days = Array.from({ length: 7 }, (_, i) => {
          const base = new Date();
          base.setDate(base.getDate() + i);
          const dayStart = new Date(base); dayStart.setHours(9, 0, 0, 0);
          const dayEnd   = new Date(base); dayEnd.setHours(22, 0, 0, 0);
          let busyMs = 0;
          for (const b of (d.busy ?? [])) {
            const s = Math.max(new Date(b.start).getTime(), dayStart.getTime());
            const e = Math.min(new Date(b.end).getTime(),   dayEnd.getTime());
            if (e > s) busyMs += e - s;
          }
          const busyH = busyMs / 3.6e6;
          return {
            label: base.toLocaleDateString('en-US', { weekday: 'narrow' }),
            level: busyH >= 6 ? 'busy' : busyH >= 2 ? 'some' : 'free',
          };
        });
        setState({ shared: true, quiet: d.quiet, days });
      })
      .catch(() => { if (alive) setState({ shared: false }); });
    return () => { alive = false; };
  }, [googleId, friendId]);

  if (state === null) return <p className="popup-avail-note">Checking availability…</p>;
  if (state.quiet) return <p className="popup-avail-note"><Moon size={11} /> Quiet Time is on — scheduling is paused.</p>;
  if (!state.shared) return null;
  return (
    <div className="popup-avail">
      <p className="popup-groups-label">Next 7 days</p>
      <div className="popup-avail-strip">
        {state.days.map((d, i) => (
          <div key={i} className={`avail-day avail-${d.level}`} title={d.level === 'free' ? 'Mostly free' : d.level === 'some' ? 'Some plans' : 'Busy'}>
            <span className="avail-day-label">{d.label}</span>
          </div>
        ))}
      </div>
      <div className="popup-avail-legend">
        <span className="avail-key avail-free">free</span>
        <span className="avail-key avail-some">some plans</span>
        <span className="avail-key avail-busy">busy</span>
      </div>
    </div>
  );
};

// ── Friend Contact Card Popup ──────────────────────────────────────────────
const FriendPopup = ({ friend, onClose, onUnfriend, onSettingsChange, onSchedule }) => {
  const { openMessages } = useMessages();
  const [unfriendConfirm, setUnfriendConfirm] = useState(false);
  const [blockConfirm,    setBlockConfirm]    = useState(false);
  const [loading, setLoading] = useState(false);
  // Group Tags: groups the viewer and this friend are BOTH accepted members
  // of. Clicking one opens the group-mode Scheduling Assistant (same popup
  // GroupsWidget's Schedule button uses). null = still loading (renders nothing).
  const [sharedGroups,  setSharedGroups]  = useState(null);
  const [scheduleGroup, setScheduleGroup] = useState(null);
  // Upcoming events with this friend (pending or confirmed, future only).
  const [together,   setTogether]   = useState([]);
  const [openEvent,  setOpenEvent]  = useState(null);
  // My per-friend settings (favorite / muted / availability override).
  const [settings, setSettings] = useState(friend.settings ?? { favorite: false, muted: false, availability_override: null });

  const googleId = localStorage.getItem('googleUserId');
  const displayName = friend.display_name || friend.name;

  useEffect(() => {
    if (!googleId) return;
    let alive = true;
    fetch(`/api/groups?op=list&googleId=${encodeURIComponent(googleId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!alive || !d) return;
        setSharedGroups((d.groups ?? []).filter(g =>
          g.myStatus === 'accepted' &&
          (g.members ?? []).some(m => m.id === friend.id && m.status === 'accepted')
        ));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [googleId, friend.id]);

  // "Upcoming together" — future events where this friend participates.
  useEffect(() => {
    if (!googleId) return;
    let alive = true;
    fetch(`/api/schedule?op=pending-events&googleId=${encodeURIComponent(googleId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!alive || !d) return;
        const now = Date.now();
        setTogether((d.events ?? [])
          .filter(e =>
            ['pending', 'accepted'].includes(e.status) &&
            new Date(e.event_time).getTime() > now &&
            (e.creator_id === friend.id || (e.invited_user_ids ?? []).includes(friend.id)))
          .sort((a, b) => new Date(a.event_time) - new Date(b.event_time))
          .slice(0, 3));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [googleId, friend.id]);

  // saveSetting — per-friend toggle, optimistic; parent list mirrors it.
  const saveSetting = async (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    onSettingsChange?.(friend.id, next);
    try {
      await fetch('/api/friends', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          op: 'settings', googleId, friendUserId: friend.id,
          ...(patch.favorite !== undefined ? { favorite: patch.favorite } : {}),
          ...(patch.muted !== undefined ? { muted: patch.muted } : {}),
          ...(patch.availability_override !== undefined ? { availabilityOverride: patch.availability_override } : {}),
        }),
      });
    } catch {}
  };

  const handleUnfriend = async () => {
    if (!unfriendConfirm) { setUnfriendConfirm(true); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'unfriend', googleId, friendUserId: friend.id }),
      });
      if (!res.ok) throw new Error();
      onUnfriend(friend.id);
      onClose();
    } catch {
      setLoading(false);
      setUnfriendConfirm(false);
    }
  };

  // Block: unfriend + refuse future requests/DMs from either side.
  const handleBlock = async () => {
    if (!blockConfirm) { setBlockConfirm(true); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'block', googleId, userId: friend.id }),
      });
      if (!res.ok) throw new Error();
      onUnfriend(friend.id);
      onClose();
    } catch {
      setLoading(false);
      setBlockConfirm(false);
    }
  };

  // Close on backdrop click
  const handleBackdrop = e => { if (e.target === e.currentTarget) onClose(); };

  const fmtWhen = iso => new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });

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
            <h2 className="popup-display-name">
              {displayName}
              {settings.favorite && <Star size={14} className="popup-fav-star" />}
            </h2>
            {friend.show_email && friend.email && (
              <p className="popup-email">{friend.email}</p>
            )}
            {friend.phone_number && (
              <p className="popup-phone">{friend.phone_number}</p>
            )}
          </div>
        </div>

        {/* Availability strip (only when they share it with you) */}
        <AvailabilityStrip friendId={friend.id} />

        {/* Upcoming events together */}
        {together.length > 0 && (
          <div className="popup-groups">
            <p className="popup-groups-label">Upcoming together</p>
            <ul className="popup-together-list">
              {together.map(e => (
                <li key={e.id}>
                  <button className="popup-together-item" onClick={() => setOpenEvent(e)}>
                    <Calendar size={12} />
                    <span className="popup-together-title">{e.title || 'Hangout'}</span>
                    <span className="popup-together-when">{fmtWhen(e.event_time)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Group Tags — shared groups; click one to schedule with that group */}
        {sharedGroups?.length > 0 && (
          <div className="popup-groups">
            <p className="popup-groups-label">Groups together</p>
            <div className="popup-groups-list">
              {sharedGroups.map(g => (
                <button
                  key={g.id}
                  className="popup-group-tag"
                  style={{ borderColor: g.color, color: g.color }}
                  title={`Schedule with ${g.name}`}
                  onClick={() => setScheduleGroup(g)}
                >
                  {g.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Per-friend settings */}
        <div className="popup-settings">
          <button
            className={`popup-setting${settings.favorite ? ' on' : ''}`}
            onClick={() => saveSetting({ favorite: !settings.favorite })}
            title={settings.favorite ? 'Unpin from top of list' : 'Pin to top of list'}
          >
            <Star size={14} /> {settings.favorite ? 'Favorited' : 'Favorite'}
          </button>
          <button
            className={`popup-setting${settings.muted ? ' on' : ''}`}
            onClick={() => saveSetting({ muted: !settings.muted })}
            title={settings.muted ? 'Get message pop-ups again' : 'No message pop-ups from this friend'}
          >
            <BellOff size={14} /> {settings.muted ? 'Muted' : 'Mute'}
          </button>
          <label className="popup-setting popup-setting-select" title="Override your default availability sharing for this friend">
            <span>Sees my availability:</span>
            <select
              value={settings.availability_override ?? ''}
              onChange={e => saveSetting({ availability_override: e.target.value || null })}
            >
              <option value="">My default</option>
              <option value="visible">Always</option>
              <option value="hidden">Never</option>
            </select>
          </label>
        </div>

        {/* Action buttons */}
        <div className="popup-actions">
          <button className="popup-btn tag-btn" disabled title="Coming soon">
            <Tag size={16} />
            Tag
          </button>

          <button
            className="popup-btn message-btn"
            onClick={() => { openMessages(friend); onClose(); }}
          >
            <MessageSquare size={16} />
            Message
          </button>

          <button
            className="popup-btn message-btn"
            onClick={() => { onSchedule(friend); onClose(); }}
          >
            <Sparkles size={16} />
            Schedule
          </button>

          <button
            className={`popup-btn unfriend-btn ${unfriendConfirm ? 'confirm' : ''}`}
            onClick={handleUnfriend}
            disabled={loading}
          >
            <UserMinus size={16} />
            {loading ? 'Removing…' : unfriendConfirm ? 'Confirm?' : 'Unfriend'}
          </button>

          <button
            className={`popup-btn unfriend-btn ${blockConfirm ? 'confirm' : ''}`}
            onClick={handleBlock}
            disabled={loading}
            title="Unfriend and refuse future requests and messages"
          >
            <Ban size={16} />
            {blockConfirm ? 'Confirm block?' : 'Block'}
          </button>
        </div>
      </div>

      {/* Group scheduling popup — AI chat scoped to the clicked group */}
      {scheduleGroup && (
        <div className="popup-backdrop" onClick={e => { e.stopPropagation(); setScheduleGroup(null); }}>
          <div className="popup-schedule-modal" onClick={e => e.stopPropagation()}>
            <SchedulingAssistant group={scheduleGroup} onClose={() => setScheduleGroup(null)} />
          </div>
        </div>
      )}

      {openEvent && (
        <EventPopup loopEvent={openEvent} onClose={() => setOpenEvent(null)} />
      )}
    </div>
  );
};

// ── Main Page — the social hub: Friends | Groups | Requests ────────────────
const FriendsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = ['friends', 'groups', 'requests'].includes(searchParams.get('tab'))
    ? searchParams.get('tab') : 'friends';
  const setTab = t => setSearchParams(t === 'friends' ? {} : { tab: t });

  const { openMessages } = useMessages();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [friendCode, setFriendCode]   = useState('');
  const [requests, setRequests]       = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [friends, setFriends]         = useState([]);
  const [glints,  setGlints]          = useState({});
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [query, setQuery]             = useState('');

  const [inputCode, setInputCode]   = useState('');
  const [addStatus, setAddStatus]   = useState(null);
  const [addLoading, setAddLoading] = useState(false);

  const [copied, setCopied]         = useState(false);
  const [selectedFriend, setSelectedFriend] = useState(null);
  // Assistant popup seeded with a friend ("Schedule" quick action).
  const [scheduleWith, setScheduleWith] = useState(null);

  const googleId = localStorage.getItem('googleUserId');

  const loadData = useCallback(async () => {
    if (!googleId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/friends?op=data&googleId=${encodeURIComponent(googleId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setFriendCode(data.friendCode ?? '');
      setRequests(data.requests ?? []);
      setSentRequests(data.sentRequests ?? []);
      setFriends(data.friends ?? []);
      syncMutedFromFriends(data.friends ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [googleId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Availability glints — one batched fetch per page view.
  useEffect(() => {
    if (!googleId) return;
    let alive = true;
    fetch(`/api/friends?op=glints&googleId=${encodeURIComponent(googleId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (alive && d) setGlints(d.glints ?? {}); })
      .catch(() => {});
    return () => { alive = false; };
  }, [googleId]);

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
      const res = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'send', senderGoogleId: googleId, friendCode: inputCode.trim() }),
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
      const res = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'respond', googleId, requestId, action }),
      });
      if (!res.ok) throw new Error();
      loadData();
    } catch {
      setError('Failed to respond to request');
    }
  };

  // Withdraw an outgoing request (the receiver never has to act).
  const handleCancel = async (requestId) => {
    try {
      const res = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'cancel', googleId, requestId }),
      });
      if (!res.ok) throw new Error();
      setSentRequests(prev => prev.filter(r => r.id !== requestId));
    } catch {
      setError('Failed to cancel request');
    }
  };

  // Called by FriendPopup after a successful unfriend/block
  const handleUnfriended = (removedId) => {
    setFriends(prev => prev.filter(f => f.id !== removedId));
  };

  // FriendPopup settings changes mirror into the list (sort order, mute cache).
  const handleSettingsChange = (friendId, settings) => {
    setFriends(prev => {
      const next = prev.map(f => f.id === friendId ? { ...f, settings } : f);
      syncMutedFromFriends(next);
      return next;
    });
    setSelectedFriend(prev => prev && prev.id === friendId ? { ...prev, settings } : prev);
  };

  // Favorites first, then alphabetical; live-filtered by the search box.
  const visibleFriends = useMemo(() => {
    const q = query.trim().toLowerCase();
    return friends
      .filter(f => !q || (f.display_name || f.name || '').toLowerCase().includes(q))
      .sort((a, b) => {
        const fav = (b.settings?.favorite ? 1 : 0) - (a.settings?.favorite ? 1 : 0);
        if (fav) return fav;
        return (a.display_name || a.name || '').localeCompare(b.display_name || b.name || '');
      });
  }, [friends, query]);

  const requestCount = requests.length + sentRequests.length;

  return (
    <div className="friends-page">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {selectedFriend && (
        <FriendPopup
          friend={selectedFriend}
          onClose={() => setSelectedFriend(null)}
          onUnfriend={handleUnfriended}
          onSettingsChange={handleSettingsChange}
          onSchedule={setScheduleWith}
        />
      )}

      {/* Assistant seeded with one friend (Schedule quick action) */}
      {scheduleWith && (
        <div className="popup-backdrop" onClick={() => setScheduleWith(null)}>
          <div className="popup-schedule-modal" onClick={e => e.stopPropagation()}>
            <SchedulingAssistant
              initialMessage={`I'd like to schedule something with ${scheduleWith.display_name || scheduleWith.name}. Can you find times that work for both of us?`}
              onClose={() => setScheduleWith(null)}
            />
          </div>
        </div>
      )}

      <PageHeader title="Friends" onMenu={() => setSidebarOpen(true)}>
        <button className="add-friend-btn header-add" onClick={() => setTab('requests')}>
          <UserPlus size={16} />
          Add Friend
        </button>
      </PageHeader>

      {/* ── Tabs ── */}
      <div className="friends-tabs">
        <button className={`friends-tab${tab === 'friends' ? ' active' : ''}`} onClick={() => setTab('friends')}>
          <UserPlus size={14} /> Friends
          {friends.length > 0 && <span className="tab-count">{friends.length}</span>}
        </button>
        <button className={`friends-tab${tab === 'groups' ? ' active' : ''}`} onClick={() => setTab('groups')}>
          <Users size={14} /> Groups
        </button>
        <button className={`friends-tab${tab === 'requests' ? ' active' : ''}`} onClick={() => setTab('requests')}>
          <Inbox size={14} /> Requests
          {requestCount > 0 && <span className="tab-count badge">{requestCount}</span>}
        </button>
      </div>

      {loading && tab !== 'groups' && <div className="friends-loading">Loading…</div>}
      {error   && <div className="friends-error">{error}</div>}

      {!loading && (
        <div className="friends-content">

          {/* ── Friends tab ── */}
          {tab === 'friends' && (
            <section className="friends-section">
              {friends.length >= 6 && (
                <div className="friends-search">
                  <Search size={14} />
                  <input
                    type="text"
                    placeholder="Search friends…"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                  />
                </div>
              )}

              {friends.length === 0 ? (
                <div className="friends-empty-cta">
                  <p className="empty-state">No friends yet — share your code to get started</p>
                  <button className="add-friend-btn" onClick={() => setTab('requests')}>
                    <UserPlus size={16} /> Add a friend
                  </button>
                </div>
              ) : (
                <ul className="friends-list">
                  {visibleFriends.map(friend => (
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
                        <span className="friend-name">
                          {friend.settings?.favorite && <Star size={12} className="friend-fav" />}
                          {friend.display_name || friend.name}
                          <Glint glint={glints[friend.id]} />
                        </span>
                      </div>
                      {/* Quick actions: the hub's two verbs, one tap each */}
                      <div className="friend-quick" onClick={e => e.stopPropagation()}>
                        <button
                          className="friend-quick-btn"
                          title={`Message ${friend.display_name || friend.name}`}
                          onClick={() => openMessages(friend)}
                        >
                          <MessageSquare size={15} />
                        </button>
                        <button
                          className="friend-quick-btn"
                          title={`Find a time with ${friend.display_name || friend.name}`}
                          onClick={() => setScheduleWith(friend)}
                        >
                          <Calendar size={15} />
                        </button>
                      </div>
                      <ChevronRight size={16} className="friend-chevron" />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* ── Groups tab — the full groups manager, promoted from the dashboard ── */}
          {tab === 'groups' && (
            <section className="friends-section friends-groups-tab">
              <GroupsWidget />
            </section>
          )}

          {/* ── Requests tab ── */}
          {tab === 'requests' && (
            <section className="friends-section">
              <div className="add-friend-panel">
                <p className="popup-groups-label">Add a friend by code</p>
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

              {requestCount === 0 ? (
                <p className="empty-state">No pending requests — share your code above to connect</p>
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

                  {/* Outgoing pending requests — cancellable */}
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
                      <button className="reject-btn" onClick={() => handleCancel(req.id)} title="Cancel request">
                        <X size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

        </div>
      )}
    </div>
  );
};

export default FriendsPage;
