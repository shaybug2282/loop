import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Pencil, Users, X, Check, Trash2, UserMinus } from 'lucide-react';
import { useGroupChat } from '../contexts/GroupChatContext';
import { useMessages } from '../contexts/MessagesContext';
import { resizeImage } from '../utils/image';
import SchedulingAssistant from './SchedulingAssistant';
import { Panel, PanelHeader } from './Panel';
import './GroupsWidget.css';

const PRESET_COLORS = ['#E8607A','#6366F1','#10B981','#F59E0B','#3B82F6','#EC4899','#14B8A6','#8B5CF6'];

// Renders a stack of up to 4 accepted-member avatars.
const AvatarCluster = ({ members }) => {
  const accepted = (members ?? []).filter(m => m.status === 'accepted');
  const shown    = accepted.slice(0, 4);
  const extra    = accepted.length - 4;
  return (
    <div className="gw-avatars">
      {shown.map((m, i) => (
        <div key={m.id} className="gw-av-wrap" style={{ zIndex: shown.length - i }}>
          {m.picture_url
            ? <img src={m.picture_url} alt="" className="gw-av" />
            : <div className="gw-av gw-av-ph">{(m.display_name || m.name)?.[0] ?? '?'}</div>}
        </div>
      ))}
      {extra > 0 && <div className="gw-av-wrap"><div className="gw-av gw-av-extra">+{extra}</div></div>}
    </div>
  );
};

// Color swatch picker
const ColorPicker = ({ value, onChange }) => (
  <div className="gw-color-row">
    {PRESET_COLORS.map(c => (
      <button
        key={c}
        className={`gw-color-swatch${value === c ? ' active' : ''}`}
        style={{ background: c }}
        onClick={() => onChange(c)}
        type="button"
        title={c}
      />
    ))}
  </div>
);

// Selectable friend chip
const FriendChip = ({ friend, selected, onToggle }) => (
  <div
    className={`gw-friend-chip${selected ? ' selected' : ''}`}
    onClick={() => onToggle(friend.id)}
  >
    {friend.picture_url
      ? <img src={friend.picture_url} alt="" className="gw-chip-av" />
      : <div className="gw-chip-av gw-chip-av-ph">{(friend.display_name || friend.name)?.[0]}</div>}
    <span className="gw-chip-name">{friend.display_name || friend.name}</span>
    {selected && <Check size={12} className="gw-chip-check" />}
  </div>
);

// ── Main widget ──────────────────────────────────────────────────────────────

export default function GroupsWidget() {
  const { openGroupChat }  = useGroupChat();
  const { openMessages }   = useMessages();
  const googleId    = localStorage.getItem('googleUserId');

  const [groups,     setGroups]     = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [friends,    setFriends]    = useState([]);

  // Create form
  const [showCreate,       setShowCreate]       = useState(false);
  const [createName,       setCreateName]       = useState('');
  const [createDesc,       setCreateDesc]       = useState('');
  const [createColor,      setCreateColor]      = useState(PRESET_COLORS[0]);
  const [createIcon,       setCreateIcon]       = useState(null);
  const [createSelected,   setCreateSelected]   = useState(new Set());
  const [creating,         setCreating]         = useState(false);

  // Expanded action buttons per group
  const [expandedId, setExpandedId]     = useState(null);

  // Group whose scheduling-chat popup is open (null = closed)
  const [scheduleGroup, setScheduleGroup] = useState(null);

  // Edit modal
  const [editGroup,        setEditGroup]        = useState(null);
  const [editName,         setEditName]         = useState('');
  const [editDesc,         setEditDesc]         = useState('');
  const [editColor,        setEditColor]        = useState(PRESET_COLORS[0]);
  const [editIcon,         setEditIcon]         = useState(null);
  const [editAddSelected,  setEditAddSelected]  = useState(new Set());
  const [editSaving,       setEditSaving]       = useState(false);

  const createIconRef = useRef(null);
  const editIconRef   = useRef(null);
  const myIdRef       = useRef(null);

  // Load my DB id once
  useEffect(() => {
    if (!googleId) return;
    fetch(`/api/user?op=my-id&googleId=${encodeURIComponent(googleId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) myIdRef.current = d.id; })
      .catch(() => {});
  }, [googleId]);

  const loadGroups = useCallback(async () => {
    if (!googleId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/groups?op=list&googleId=${encodeURIComponent(googleId)}`);
      if (r.ok) setGroups((await r.json()).groups ?? []);
    } catch {}
    finally { setLoading(false); }
  }, [googleId]);

  const loadFriends = useCallback(async () => {
    if (!googleId) return;
    try {
      const r = await fetch(`/api/friends?op=data&googleId=${encodeURIComponent(googleId)}`);
      if (r.ok) setFriends((await r.json()).friends ?? []);
    } catch {}
  }, [googleId]);

  useEffect(() => {
    loadGroups();
    // Refresh every 30s so icon/name changes by other members appear without a manual reload
    const t = setInterval(loadGroups, 30_000);
    return () => clearInterval(t);
  }, [loadGroups]);

  // Load friends when create form opens or edit modal opens
  useEffect(() => {
    if (showCreate || editGroup) loadFriends();
  }, [showCreate, editGroup, loadFriends]);

  // ── Create group ────────────────────────────────────────────────────────────

  const handleCreateIconChange = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { setCreateIcon(await resizeImage(file)); } catch {}
  };

  const handleCreate = async () => {
    if (!createName.trim() || !googleId || creating) return;
    setCreating(true);
    try {
      // Invitees are notified through the notification bell (pending-invites)
      // — no automated DM, so the invite isn't double-delivered.
      await fetch('/api/groups', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          op: 'create', googleId,
          name:        createName.trim(),
          description: createDesc.trim() || undefined,
          color:       createColor,
          icon_url:    createIcon || undefined,
          memberUserIds: [...createSelected],
        }),
      });

      setShowCreate(false);
      setCreateName(''); setCreateDesc(''); setCreateColor(PRESET_COLORS[0]);
      setCreateIcon(null); setCreateSelected(new Set());
      await loadGroups();
    } catch {}
    finally { setCreating(false); }
  };

  // ── Group actions ───────────────────────────────────────────────────────────

  // Scheduling a group opens a popup with the AI scheduling chat pinned to
  // this group — the backend receives the groupId with every message and
  // schedules for all accepted members automatically.
  const handleSchedule = group => {
    setExpandedId(null);
    setScheduleGroup(group);
  };

  const handleMessage = group => {
    const accepted = (group.members ?? []).filter(m => m.status === 'accepted');
    const others   = accepted.filter(m => m.id !== myIdRef.current);

    if (others.length === 1) {
      // 1-on-1: use DM
      openMessages({ id: others[0].id, name: others[0].name, display_name: others[0].display_name, picture_url: others[0].picture_url });
    } else {
      // Multi-person: open group chat panel
      openGroupChat(group);
    }
    // Update last_accessed
    fetch('/api/groups', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ op: 'touch', googleId, groupId: group.id }),
    }).catch(() => {});
    setExpandedId(null);
  };

  const respondToInvite = async (groupId, accept) => {
    await fetch('/api/groups', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ op: 'respond', googleId, groupId, accept }),
    });
    await loadGroups();
  };

  // ── Edit modal ──────────────────────────────────────────────────────────────

  const openEdit = group => {
    setEditGroup(group);
    setEditName(group.name);
    setEditDesc(group.description ?? '');
    setEditColor(group.color ?? PRESET_COLORS[0]);
    setEditIcon(group.icon_url ?? null);
    setEditAddSelected(new Set());
    setExpandedId(null);
  };

  const handleEditIconChange = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { setEditIcon(await resizeImage(file)); } catch {}
  };

  const handleEditSave = async () => {
    if (!editGroup || editSaving) return;
    setEditSaving(true);
    try {
      await fetch('/api/groups', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          op: 'update', googleId, groupId: editGroup.id,
          name:        editName.trim() || editGroup.name,
          description: editDesc.trim() || undefined,
          color:       editColor,
          icon_url:    editIcon || undefined,
        }),
      });
      if (editAddSelected.size > 0) {
        // Invitees get the notification-bell invite only — no automated DM.
        await fetch('/api/groups', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            op: 'invite', googleId, groupId: editGroup.id,
            memberUserIds: [...editAddSelected],
          }),
        });
      }
      setEditGroup(null);
      await loadGroups();
    } catch {}
    finally { setEditSaving(false); }
  };

  const handleRemoveMember = async (groupId, userId) => {
    await fetch('/api/groups', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ op: 'remove-member', googleId, groupId, userId }),
    });
    await loadGroups();
    setEditGroup(g => g ? { ...g, members: (g.members ?? []).filter(m => m.id !== userId) } : g);
  };

  // handleLeave — first-class "leave group": removes ONLY yourself (the API
  // restricts removing anyone else to the creator).
  const handleLeave = async group => {
    if (!myIdRef.current) return;
    if (!window.confirm(`Leave "${group.name}"? You'll need a new invite to rejoin.`)) return;
    await fetch('/api/groups', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ op: 'remove-member', googleId, groupId: group.id, userId: myIdRef.current }),
    });
    setExpandedId(null);
    setEditGroup(null);
    await loadGroups();
  };

  const handleDeleteGroup = async () => {
    if (!editGroup || !window.confirm(`Delete "${editGroup.name}"? This cannot be undone.`)) return;
    await fetch('/api/groups', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ op: 'delete', googleId, groupId: editGroup.id }),
    });
    setEditGroup(null);
    await loadGroups();
  };

  // Friends not yet in the current group
  const invitableFriends = editGroup
    ? friends.filter(f => !(editGroup.members ?? []).some(m => m.id === f.id))
    : friends;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Panel className="gw-panel">
      <PanelHeader icon={Users} title="Groups">
        <button
          className="panel-icon-btn panel-icon-btn-solid"
          onClick={() => setShowCreate(v => !v)}
          title="Create group"
        >
          <Plus size={16} />
        </button>
      </PanelHeader>

      {/* Create form */}
      {showCreate && (
        <div className="gw-create-form">
          <input
            className="gw-input"
            placeholder="Group name"
            value={createName}
            onChange={e => setCreateName(e.target.value)}
            autoFocus
          />
          <input
            className="gw-input"
            placeholder="Description (optional)"
            value={createDesc}
            onChange={e => setCreateDesc(e.target.value)}
          />
          <p className="gw-field-label">Color</p>
          <ColorPicker value={createColor} onChange={setCreateColor} />

          <div className="gw-icon-row">
            <span className="gw-field-label">Icon</span>
            {createIcon
              ? <img src={createIcon} alt="group icon" className="gw-icon-preview" />
              : null}
            <button className="gw-btn-outline gw-btn-sm" onClick={() => createIconRef.current?.click()}>
              {createIcon ? 'Change' : 'Upload image'}
            </button>
            {createIcon && (
              <button className="gw-btn-ghost gw-btn-sm" onClick={() => setCreateIcon(null)}>Remove</button>
            )}
            <input type="file" accept="image/*" ref={createIconRef} style={{ display: 'none' }}
              onChange={handleCreateIconChange} />
          </div>

          {friends.length > 0 && (
            <>
              <p className="gw-field-label">Invite friends</p>
              <div className="gw-friend-chips">
                {friends.map(f => (
                  <FriendChip
                    key={f.id}
                    friend={f}
                    selected={createSelected.has(f.id)}
                    onToggle={id => setCreateSelected(prev => {
                      const n = new Set(prev);
                      n.has(id) ? n.delete(id) : n.add(id);
                      return n;
                    })}
                  />
                ))}
              </div>
            </>
          )}

          <div className="gw-create-actions">
            <button className="gw-btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
            <button
              className="gw-btn-primary"
              disabled={!createName.trim() || creating}
              onClick={handleCreate}
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Group list */}
      {loading && groups.length === 0 ? (
        <p className="gw-empty">Loading…</p>
      ) : groups.length === 0 && !showCreate ? (
        <p className="gw-empty">No groups yet.<br />Make one for the people you see most.</p>
      ) : (
        <ul className="gw-list">
          {groups.map(g => {
            const isPending = g.myStatus === 'pending';

            if (isPending) {
              return (
                <li key={g.id} className="gw-item-wrap">
                  <div className="gw-item gw-item-invite">
                    <span className="gw-color-bar gw-color-bar-muted" style={{ background: g.color ?? '#E8607A' }} />
                    <div className="gw-group-icon">
                      {g.icon_url
                        ? <img src={g.icon_url} alt="" className="gw-group-icon-img" />
                        : <span className="gw-group-icon-letter">{g.name?.[0] ?? '?'}</span>}
                    </div>
                    <div className="gw-item-body">
                      <div className="gw-invite-row">
                        <span className="gw-item-name">{g.name}</span>
                        <span className="gw-invited-badge">Invited</span>
                      </div>
                      {g.invitedBy && (
                        <span className="gw-invited-by">from {g.invitedBy}</span>
                      )}
                      <AvatarCluster members={g.members} />
                      <div className="gw-invite-btns">
                        <button className="gw-btn-join" onClick={() => respondToInvite(g.id, true)}>Join</button>
                        <button className="gw-btn-decline-sm" onClick={() => respondToInvite(g.id, false)}>Decline</button>
                      </div>
                    </div>
                  </div>
                </li>
              );
            }

            return (
              <li key={g.id} className="gw-item-wrap">
                {/* Group row */}
                <div
                  className={`gw-item${expandedId === g.id ? ' expanded' : ''}`}
                  onClick={() => setExpandedId(expandedId === g.id ? null : g.id)}
                >
                  <span className="gw-color-bar" style={{ background: g.color ?? '#E8607A' }} />
                  <div className="gw-group-icon">
                    {g.icon_url
                      ? <img src={g.icon_url} alt="" className="gw-group-icon-img" />
                      : <span className="gw-group-icon-letter">{g.name?.[0] ?? '?'}</span>}
                  </div>
                  <div className="gw-item-body">
                    <span className="gw-item-name">{g.name}</span>
                    <AvatarCluster members={g.members} />
                  </div>
                  <button
                    className="gw-edit-hover"
                    title="Edit group"
                    onClick={e => { e.stopPropagation(); openEdit(g); }}
                  >
                    <Pencil size={13} />
                  </button>
                </div>

                {expandedId === g.id && (
                  <div className="gw-actions">
                    <button className="gw-action-btn" onClick={() => handleSchedule(g)}>
                      Schedule
                    </button>
                    <button className="gw-action-btn" onClick={() => handleMessage(g)}>
                      Message
                    </button>
                    <button className="gw-action-btn" onClick={() => openEdit(g)}>
                      Edit
                    </button>
                    {!g.isCreator && (
                      <button className="gw-action-btn gw-action-leave" onClick={() => handleLeave(g)}>
                        Leave
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Edit modal */}
      {editGroup && (
        <div className="gw-modal-backdrop" onClick={() => setEditGroup(null)}>
          <div className="gw-modal" onClick={e => e.stopPropagation()}>
            <div className="gw-modal-header">
              <h4 className="gw-modal-title">Edit Group</h4>
              <button className="gw-icon-btn" onClick={() => setEditGroup(null)}><X size={16} /></button>
            </div>

            <div className="gw-modal-body">
              <label className="gw-field-label">Name</label>
              <input className="gw-input" value={editName}
                onChange={e => setEditName(e.target.value)} />

              <label className="gw-field-label">Description</label>
              <textarea className="gw-input gw-textarea" value={editDesc}
                onChange={e => setEditDesc(e.target.value)} rows={2} />

              <label className="gw-field-label">Color</label>
              <ColorPicker value={editColor} onChange={setEditColor} />

              <div className="gw-icon-row">
                <span className="gw-field-label">Icon</span>
                {editIcon
                  ? <img src={editIcon} alt="icon" className="gw-icon-preview" />
                  : null}
                <button className="gw-btn-outline gw-btn-sm" onClick={() => editIconRef.current?.click()}>
                  {editIcon ? 'Change' : 'Upload image'}
                </button>
                {editIcon && (
                  <button className="gw-btn-ghost gw-btn-sm" onClick={() => setEditIcon(null)}>Remove</button>
                )}
                <input type="file" accept="image/*" ref={editIconRef} style={{ display: 'none' }}
                  onChange={handleEditIconChange} />
              </div>

              {/* Current members */}
              <label className="gw-field-label">Members</label>
              <ul className="gw-member-list">
                {(editGroup.members ?? []).map(m => (
                  <li key={m.id} className="gw-member-row">
                    {m.picture_url
                      ? <img src={m.picture_url} alt="" className="gw-member-av" />
                      : <div className="gw-member-av gw-member-av-ph">{(m.display_name || m.name)?.[0]}</div>}
                    <span className="gw-member-name">{m.display_name || m.name}</span>
                    <span className={`gw-member-status gw-status-${m.status}`}>{m.status}</span>
                    {/* Removing OTHERS is creator-only (server-enforced too);
                        leaving yourself is the footer's Leave button. */}
                    {m.id !== myIdRef.current && editGroup.isCreator && (
                      <button
                        className="gw-remove-btn"
                        title="Remove"
                        onClick={() => handleRemoveMember(editGroup.id, m.id)}
                      >
                        <UserMinus size={13} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>

              {/* Invite more friends */}
              {invitableFriends.length > 0 && (
                <>
                  <label className="gw-field-label">Add members</label>
                  <div className="gw-friend-chips">
                    {invitableFriends.map(f => (
                      <FriendChip
                        key={f.id}
                        friend={f}
                        selected={editAddSelected.has(f.id)}
                        onToggle={id => setEditAddSelected(prev => {
                          const n = new Set(prev);
                          n.has(id) ? n.delete(id) : n.add(id);
                          return n;
                        })}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="gw-modal-footer">
              {editGroup.isCreator ? (
                <button className="gw-btn-danger" onClick={handleDeleteGroup}>
                  <Trash2 size={14} /> Delete group
                </button>
              ) : (
                <button className="gw-btn-danger" onClick={() => handleLeave(editGroup)}>
                  Leave group
                </button>
              )}
              <div className="gw-modal-footer-right">
                <button className="gw-btn-ghost" onClick={() => setEditGroup(null)}>Cancel</button>
                <button className="gw-btn-primary" onClick={handleEditSave} disabled={editSaving}>
                  {editSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Group scheduling popup — AI chat scoped to this group */}
      {scheduleGroup && (
        <div className="gw-modal-backdrop" onClick={() => setScheduleGroup(null)}>
          <div className="gw-schedule-modal" onClick={e => e.stopPropagation()}>
            <SchedulingAssistant group={scheduleGroup} onClose={() => setScheduleGroup(null)} />
          </div>
        </div>
      )}
    </Panel>
  );
}
