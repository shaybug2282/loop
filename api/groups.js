// Groups router — create and manage social groups.
//
// GET  ?op=list&googleId=             → list all accepted groups for a user (by last_accessed)
// GET  ?op=pending-invites&googleId=  → groups with pending invite for user
// GET  ?op=messages&groupId=&googleId=&before= → paginated group messages (newest first)
// POST { op:'create',        ... }    → create group, add members, send invites
// POST { op:'respond',       ... }    → accept or decline a group invite
// POST { op:'invite',        ... }    → add new members to an existing group
// POST { op:'remove-member', ... }    → remove a member from a group
// POST { op:'update',        ... }    → rename / change color / icon_url / description
// POST { op:'delete',        ... }    → delete group (creator only)
// POST { op:'touch',         ... }    → update last_accessed
// POST { op:'send-message',  ... }    → send a group message

import { encrypt } from './_crypto.js';
import { db, safeDecrypt, resolveUser as resolveUserBase } from './_lib.js';

// Resolve a googleId to a DB user row (id, name, display_name, picture_url).
const resolveUser = (supabase, googleId) =>
  resolveUserBase(supabase, googleId, 'id, name, display_name, picture_url');

// True when the user is an accepted member of the group. Used to guard
// mutating ops so a leaked groupId alone can't modify a group.
async function isAcceptedMember(supabase, groupId, userId) {
  const { data } = await supabase
    .from('group_members')
    .select('status')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .single();
  return data?.status === 'accepted';
}

// Shape a group row into the client payload.
function shapeGroup(g) {
  return {
    id:           g.id,
    name:         g.name,
    description:  g.description,
    color:        g.color ?? '#E8607A',
    icon_url:     g.icon_url,
    last_accessed: g.last_accessed,
    members:      (g.group_members ?? []).map(m => ({
      id:          m.user_id,
      status:      m.status,
      name:        m.users?.name,
      display_name: m.users?.display_name,
      picture_url: m.users?.picture_url,
    })),
  };
}

export default async function handler(req, res) {
  const supabase = db();
  const op = req.query.op ?? req.body?.op;

  // ── GET ops ─────────────────────────────────────────────────────────────────

  if (req.method === 'GET') {
    const { googleId, groupId, before } = req.query;

    if (op === 'list') {
      if (!googleId) return res.status(400).json({ error: 'googleId required' });
      const me = await resolveUser(supabase, googleId);
      if (!me) return res.status(404).json({ error: 'user not found' });

      // Show groups where the user is accepted OR has a pending invite.
      // Creators always have an 'accepted' row added at creation time.
      const { data: memberships } = await supabase
        .from('group_members')
        .select('group_id, status, invited_by')
        .eq('user_id', me.id)
        .in('status', ['accepted', 'pending']);

      const groupIds = (memberships ?? []).map(m => m.group_id);
      if (!groupIds.length) return res.status(200).json({ groups: [] });

      // Build a per-group membership map for the requesting user.
      const myMembership = Object.fromEntries(
        (memberships ?? []).map(m => [m.group_id, { status: m.status, invitedBy: m.invited_by }])
      );

      // Resolve names for whoever invited this user (for pending invites).
      const inviterIds = [...new Set(
        (memberships ?? []).filter(m => m.status === 'pending' && m.invited_by).map(m => m.invited_by)
      )];
      let inviters = {};
      if (inviterIds.length) {
        const { data: users } = await supabase
          .from('users').select('id, name, display_name').in('id', inviterIds);
        (users ?? []).forEach(u => { inviters[u.id] = u.display_name || u.name || 'Someone'; });
      }

      // Avoid the ambiguous FK problem: group_members has two FKs to users
      // (user_id + invited_by), so any users embed silently returns null.
      // Fetch members without the users join, then resolve names in one batch.
      const { data: groups } = await supabase
        .from('groups')
        .select('*, group_members(user_id, status)')
        .in('id', groupIds)
        .order('last_accessed', { ascending: false });

      const allMemberIds = [...new Set(
        (groups ?? []).flatMap(g => (g.group_members ?? []).map(m => m.user_id))
      )];
      let userMap = {};
      if (allMemberIds.length) {
        const { data: users } = await supabase
          .from('users').select('id, name, display_name, picture_url').in('id', allMemberIds);
        (users ?? []).forEach(u => { userMap[u.id] = u; });
      }

      return res.status(200).json({
        groups: (groups ?? []).map(g => {
          const mem = myMembership[g.id] ?? {};
          return {
            id:           g.id,
            name:         g.name,
            description:  g.description,
            color:        g.color ?? '#E8607A',
            icon_url:     g.icon_url,
            last_accessed: g.last_accessed,
            members: (g.group_members ?? []).map(m => ({
              id:           m.user_id,
              status:       m.status,
              name:         userMap[m.user_id]?.name,
              display_name: userMap[m.user_id]?.display_name,
              picture_url:  userMap[m.user_id]?.picture_url,
            })),
            myStatus:  mem.status  ?? 'pending',
            isCreator: g.created_by === me.id,
            invitedBy: mem.invitedBy ? (inviters[mem.invitedBy] ?? 'Someone') : null,
          };
        }),
      });
    }

    if (op === 'pending-invites') {
      if (!googleId) return res.status(400).json({ error: 'googleId required' });
      const me = await resolveUser(supabase, googleId);
      if (!me) return res.status(404).json({ error: 'user not found' });

      // Avoid ambiguous FK join (group_members has two FKs to users).
      // Fetch memberships + group info first, then resolve inviter names separately.
      const { data: memberships } = await supabase
        .from('group_members')
        .select('group_id, invited_by, groups(id, name, color, icon_url)')
        .eq('user_id', me.id)
        .eq('status', 'pending');

      const inviterIds = [...new Set((memberships ?? []).map(m => m.invited_by).filter(Boolean))];
      let inviters = {};
      if (inviterIds.length) {
        const { data: users } = await supabase
          .from('users')
          .select('id, name, display_name')
          .in('id', inviterIds);
        (users ?? []).forEach(u => { inviters[u.id] = u.display_name || u.name || 'Someone'; });
      }

      return res.status(200).json({
        invites: (memberships ?? []).map(m => ({
          groupId:   m.group_id,
          groupName: m.groups?.name,
          color:     m.groups?.color,
          icon_url:  m.groups?.icon_url,
          invitedBy: inviters[m.invited_by] ?? 'Someone',
        })),
      });
    }

    if (op === 'messages') {
      if (!groupId || !googleId) return res.status(400).json({ error: 'groupId and googleId required' });
      const me = await resolveUser(supabase, googleId);
      if (!me) return res.status(404).json({ error: 'user not found' });

      // Verify membership
      const { data: membership } = await supabase
        .from('group_members')
        .select('status')
        .eq('group_id', groupId)
        .eq('user_id', me.id)
        .single();
      if (!membership || membership.status !== 'accepted')
        return res.status(403).json({ error: 'not a member' });

      let query = supabase
        .from('group_messages')
        .select('id, sender_id, content, created_at, users(name, display_name, picture_url)')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (before) query = query.lt('created_at', before);
      const { data: msgs } = await query;

      return res.status(200).json({
        messages: (msgs ?? []).map(m => ({
          id:          m.id,
          senderId:    m.sender_id,
          content:     safeDecrypt(m.content),
          created_at:  m.created_at,
          senderName:  m.users?.display_name || m.users?.name,
          senderPic:   m.users?.picture_url,
        })),
      });
    }

    return res.status(400).json({ error: 'unknown op' });
  }

  // ── POST ops ─────────────────────────────────────────────────────────────────

  if (req.method !== 'POST') return res.status(405).end();

  // memberUserIds: array of DB UUIDs (from friends list) to invite
  const { googleId, groupId, name, description, color, icon_url,
          memberUserIds, userId, accept, content } = req.body;

  if (op === 'create') {
    if (!googleId || !name) return res.status(400).json({ error: 'googleId and name required' });
    const me = await resolveUser(supabase, googleId);
    if (!me) return res.status(404).json({ error: 'user not found' });

    const { data: group, error } = await supabase
      .from('groups')
      .insert({ name, description, color: color ?? '#E8607A', icon_url, created_by: me.id })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });

    // Add creator as accepted member
    await supabase.from('group_members').insert({
      group_id: group.id, user_id: me.id, status: 'accepted', joined_at: new Date().toISOString(),
    });

    // Invite additional members (memberUserIds are DB UUIDs)
    const inviteRows = (memberUserIds ?? [])
      .filter(uid => uid !== me.id)
      .map(uid => ({ group_id: group.id, user_id: uid, invited_by: me.id, status: 'pending' }));

    if (inviteRows.length) {
      await supabase.from('group_members').insert(inviteRows);
    }

    return res.status(200).json({ group: shapeGroup({ ...group, group_members: [] }) });
  }

  if (op === 'respond') {
    // accept: true/false
    if (!googleId || !groupId || accept === undefined)
      return res.status(400).json({ error: 'googleId, groupId, accept required' });
    const me = await resolveUser(supabase, googleId);
    if (!me) return res.status(404).json({ error: 'user not found' });

    const update = accept
      ? { status: 'accepted', joined_at: new Date().toISOString() }
      : { status: 'declined' };

    await supabase
      .from('group_members')
      .update(update)
      .eq('group_id', groupId)
      .eq('user_id', me.id);

    return res.status(200).json({ ok: true });
  }

  if (op === 'invite') {
    if (!googleId || !groupId || !memberUserIds?.length)
      return res.status(400).json({ error: 'googleId, groupId, memberUserIds required' });
    const me = await resolveUser(supabase, googleId);
    if (!me) return res.status(404).json({ error: 'user not found' });
    if (!(await isAcceptedMember(supabase, groupId, me.id)))
      return res.status(403).json({ error: 'not a member' });

    const rows = memberUserIds
      .filter(uid => uid !== me.id)
      .map(uid => ({ group_id: groupId, user_id: uid, invited_by: me.id, status: 'pending' }));

    if (rows.length) {
      await supabase.from('group_members').upsert(rows, { onConflict: 'group_id,user_id' });
    }

    return res.status(200).json({ ok: true, invited: rows.length });
  }

  if (op === 'remove-member') {
    if (!googleId || !groupId || !userId)
      return res.status(400).json({ error: 'googleId, groupId, userId required' });
    const me = await resolveUser(supabase, googleId);
    if (!me) return res.status(404).json({ error: 'user not found' });
    // Anyone may remove THEMSELVES (leave group); removing someone else is
    // creator-only — a member shouldn't be able to eject other members.
    if (!(await isAcceptedMember(supabase, groupId, me.id)))
      return res.status(403).json({ error: 'not a member' });
    if (userId !== me.id) {
      const { data: g } = await supabase
        .from('groups').select('created_by').eq('id', groupId).single();
      if (!g || g.created_by !== me.id)
        return res.status(403).json({ error: 'only the group creator can remove other members' });
    }

    await supabase.from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', userId);
    return res.status(200).json({ ok: true });
  }

  if (op === 'update') {
    if (!googleId || !groupId) return res.status(400).json({ error: 'googleId and groupId required' });
    const me = await resolveUser(supabase, googleId);
    if (!me) return res.status(404).json({ error: 'user not found' });
    // Any accepted member may edit (icon/name changes are a shared feature).
    if (!(await isAcceptedMember(supabase, groupId, me.id)))
      return res.status(403).json({ error: 'not a member' });

    const patch = {};
    if (name        !== undefined) patch.name        = name;
    if (description !== undefined) patch.description = description;
    if (color       !== undefined) patch.color       = color;
    if (icon_url    !== undefined) patch.icon_url    = icon_url;
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'nothing to update' });

    const { data: group } = await supabase
      .from('groups')
      .update(patch)
      .eq('id', groupId)
      .select()
      .single();

    return res.status(200).json({ group });
  }

  if (op === 'delete') {
    if (!googleId || !groupId) return res.status(400).json({ error: 'googleId and groupId required' });
    const me = await resolveUser(supabase, googleId);
    if (!me) return res.status(404).json({ error: 'user not found' });

    // Only creator can delete
    const { data: g } = await supabase
      .from('groups')
      .select('created_by')
      .eq('id', groupId)
      .single();
    if (!g || g.created_by !== me.id)
      return res.status(403).json({ error: 'only the creator can delete this group' });

    await supabase.from('groups').delete().eq('id', groupId);
    return res.status(200).json({ ok: true });
  }

  if (op === 'touch') {
    if (!googleId || !groupId) return res.status(400).json({ error: 'googleId and groupId required' });
    const me = await resolveUser(supabase, googleId);
    if (!me) return res.status(404).json({ error: 'user not found' });
    if (!(await isAcceptedMember(supabase, groupId, me.id)))
      return res.status(403).json({ error: 'not a member' });

    await supabase
      .from('groups')
      .update({ last_accessed: new Date().toISOString() })
      .eq('id', groupId);
    return res.status(200).json({ ok: true });
  }

  if (op === 'send-message') {
    if (!googleId || !groupId || !content)
      return res.status(400).json({ error: 'googleId, groupId, content required' });
    const me = await resolveUser(supabase, googleId);
    if (!me) return res.status(404).json({ error: 'user not found' });

    const { data: membership } = await supabase
      .from('group_members')
      .select('status')
      .eq('group_id', groupId)
      .eq('user_id', me.id)
      .single();
    if (!membership || membership.status !== 'accepted')
      return res.status(403).json({ error: 'not a member' });

    const { data: msg } = await supabase
      .from('group_messages')
      .insert({ group_id: groupId, sender_id: me.id, content: encrypt(content) })
      .select('id, sender_id, content, created_at')
      .single();

    await supabase
      .from('groups')
      .update({ last_accessed: new Date().toISOString() })
      .eq('id', groupId);

    return res.status(200).json({
      message: { id: msg.id, senderId: msg.sender_id, content, created_at: msg.created_at }
    });
  }

  return res.status(400).json({ error: 'unknown op' });
}
