// Friends router — all friendship operations in one function.
// Every op is session-gated (identity from the cookie via requireUser).
//
// GET  ?op=data                 → friend code, pending requests, sent requests, friends list
//                                 (each friend carries my per-friend settings), blocked users
// GET  ?op=availability&friendUserId= → friend's next-7-days busy blocks, if they share
// GET  ?op=glints               → per-friend "free right now?" dots for the friends list
// POST { op:'send',    ... }    → send a friend request by friend code
// POST { op:'respond', ... }    → accept or reject an incoming request
// POST { op:'cancel',  ... }    → withdraw an outgoing pending request
// POST { op:'unfriend', ... }   → remove friendship (both directions)
// POST { op:'settings', ... }   → per-friend settings: favorite / muted / availabilityOverride
// POST { op:'block' | 'unblock', ... } → block = unfriend + silently refuse future requests/DMs
//
// settings / blocks / availability sharing require: db/migrations/015_preferences_friend_settings.sql

import { db, safeDecrypt, isQuietNow, requireUser, getGoogleAccessToken } from './_lib.js';

// blockedEitherWay — true when either user has blocked the other. A missing
// blocks table (pre-015) reads as "not blocked" so core flows keep working.
async function blockedEitherWay(client, a, b) {
  try {
    const { data } = await client.from('blocks')
      .select('blocker_id')
      .or(`and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`);
    return (data ?? []).length > 0;
  } catch { return false; }
}

// sharesAvailabilityWith — does `owner` let `viewerId` see their free/busy?
// Per-viewer override (owner's friendship row) beats the account default
// (preferences.availabilitySharing, default 'ai' = assistant only, no strip).
async function sharesAvailabilityWith(client, owner, viewerId) {
  let override = null;
  try {
    const { data } = await client.from('friendships')
      .select('availability_override')
      .eq('user_id', owner.id).eq('friend_id', viewerId).maybeSingle();
    override = data?.availability_override ?? null;
  } catch {}
  if (override === 'visible') return true;
  if (override === 'hidden')  return false;
  return (owner.preferences?.availabilitySharing ?? 'ai') === 'friends';
}

// fetchBusy — one user's Google free/busy intervals for [start, end), using a
// server-refreshed access token (works even when the owner is offline).
// out: [{start,end}]; no token or any failure reads as an empty calendar.
async function fetchBusy(client, user, start, end) {
  const token = await getGoogleAccessToken(client, user);
  if (!token) return [];
  try {
    const r = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ timeMin: start.toISOString(), timeMax: end.toISOString(), items: [{ id: 'primary' }] }),
    });
    if (!r.ok) return [];
    return (await r.json()).calendars?.primary?.busy ?? [];
  } catch { return []; }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // Identity comes from the session cookie only — googleId params are ignored.
  const auth = requireUser(req);
  if (!auth) return res.status(401).json({ error: 'Not signed in' });

  // ── GET operations ────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { op } = req.query;

    if (op === 'data') {
      const client = db();
      const { data: me, error: meErr } = await client
        .from('users').select('id, friend_code').eq('id', auth.userId).single();
      if (meErr || !me) return res.status(404).json({ error: 'User not found' });

      const friendCols = (withPhoneToggle, withSettings) =>
        `${withSettings ? 'favorite, muted, availability_override, ' : ''}` +
        `friend:friend_id(id, name, display_name, email, show_email, ${withPhoneToggle ? 'show_phone, ' : ''}phone_number, picture_url, friend_code)`;

      let [
        { data: requests,    error: reqErr },
        { data: sentReqs,    error: sentErr },
        { data: friendships, error: friendErr },
      ] = await Promise.all([
        client.from('friend_requests')
          .select('id, created_at, sender:sender_id(id, name, display_name, email, show_email, picture_url)')
          .eq('receiver_id', me.id).eq('status', 'pending').order('created_at', { ascending: false }),
        client.from('friend_requests')
          .select('id, created_at, receiver:receiver_id(id, name, display_name, email, show_email, picture_url)')
          .eq('sender_id', me.id).eq('status', 'pending').order('created_at', { ascending: false }),
        client.from('friendships')
          .select(friendCols(true, true))
          .eq('user_id', me.id).order('created_at', { ascending: true }),
      ]);

      // Graceful degrade: no migration 015 (per-friend settings), then no 013
      // (show_phone) — each fallback drops only the missing columns.
      if (friendErr) {
        ({ data: friendships, error: friendErr } = await client.from('friendships')
          .select(friendCols(true, false))
          .eq('user_id', me.id).order('created_at', { ascending: true }));
      }
      if (friendErr) {
        ({ data: friendships, error: friendErr } = await client.from('friendships')
          .select(friendCols(false, false))
          .eq('user_id', me.id).order('created_at', { ascending: true }));
      }

      if (reqErr)    return res.status(500).json({ error: reqErr.message });
      if (sentErr)   return res.status(500).json({ error: sentErr.message });
      if (friendErr) return res.status(500).json({ error: friendErr.message });

      // Privacy is enforced HERE, not in the client: email/phone leave the
      // server only when the owner's visibility toggle allows it.
      const mask = u => u ? {
        ...u,
        email:        u.show_email ? safeDecrypt(u.email) : null,
        phone_number: (u.show_phone ?? true) ? (u.phone_number ?? null) : null,
      } : u;

      // Users I've blocked — surfaced so the Profile page can offer Unblock.
      // Missing table (pre-015) reads as an empty list.
      let blocked = [];
      try {
        const { data: blockRows } = await client.from('blocks')
          .select('blocked_id').eq('blocker_id', me.id);
        const ids = (blockRows ?? []).map(b => b.blocked_id);
        if (ids.length) {
          const { data: users } = await client.from('users')
            .select('id, name, display_name, picture_url').in('id', ids);
          blocked = users ?? [];
        }
      } catch {}

      return res.status(200).json({
        friendCode:   me.friend_code,
        requests:     (requests   ?? []).map(r => ({ ...r, sender:   mask(r.sender) })),
        sentRequests: (sentReqs   ?? []).map(r => ({ ...r, receiver: mask(r.receiver) })),
        friends:      (friendships ?? []).map(f => ({
          ...mask(f.friend),
          // My settings about this friend ride on the friend object (defaults
          // when migration 015 hasn't run).
          settings: {
            favorite:              f.favorite ?? false,
            muted:                 f.muted ?? false,
            availability_override: f.availability_override ?? null,
          },
        })),
        blocked,
      });
    }

    // A friend's next-7-days busy blocks — only when they share availability
    // with the viewer (account default or per-viewer override). Quiet Time is
    // reported either way: it's already enforced on every scheduling path.
    if (op === 'availability') {
      const { friendUserId } = req.query;
      if (!friendUserId) return res.status(400).json({ error: 'friendUserId required' });

      const client2 = db();
      const me = { id: auth.userId };

      const { data: fr } = await client2.from('friendships')
        .select('friend_id').eq('user_id', me.id).eq('friend_id', friendUserId).maybeSingle();
      if (!fr) return res.status(403).json({ error: 'Not friends with this user' });

      // Fallback chain: full (016+015) → pre-016 (no refresh_token) → pre-015.
      let { data: owner } = await client2.from('users')
        .select('id, access_token, token_expiry, refresh_token, timezone, quiet_time_since, quiet_time_until, preferences')
        .eq('id', friendUserId).maybeSingle();
      if (!owner) {
        ({ data: owner } = await client2.from('users')
          .select('id, access_token, token_expiry, timezone, quiet_time_since, quiet_time_until, preferences')
          .eq('id', friendUserId).maybeSingle());
      }
      if (!owner) {
        ({ data: owner } = await client2.from('users')
          .select('id, access_token, token_expiry, timezone, quiet_time_since').eq('id', friendUserId).maybeSingle());
      }
      if (!owner) return res.status(404).json({ error: 'Friend not found' });

      const quiet = isQuietNow(owner);
      if (!(await sharesAvailabilityWith(client2, owner, me.id)))
        return res.status(200).json({ shared: false, quiet });

      const start = new Date();
      const end   = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
      const busy  = await fetchBusy(client2, owner, start, end);
      return res.status(200).json({ shared: true, quiet, busy, timezone: owner.timezone || 'UTC' });
    }

    // Per-friend "free right now?" glints for the friends list, one batched
    // call. Only friends who share availability get a freeNow value.
    if (op === 'glints') {
      const client2 = db();
      const me = { id: auth.userId };

      const { data: rows } = await client2.from('friendships')
        .select('friend_id').eq('user_id', me.id);
      const ids = (rows ?? []).map(r => r.friend_id);
      if (!ids.length) return res.status(200).json({ glints: {} });

      // Fallback chain: full (016+015) → pre-016 → pre-015.
      let { data: owners } = await client2.from('users')
        .select('id, access_token, token_expiry, refresh_token, quiet_time_since, quiet_time_until, preferences').in('id', ids);
      if (!owners) {
        ({ data: owners } = await client2.from('users')
          .select('id, access_token, token_expiry, quiet_time_since, quiet_time_until, preferences').in('id', ids));
      }
      if (!owners) {
        ({ data: owners } = await client2.from('users')
          .select('id, access_token, token_expiry, quiet_time_since').in('id', ids));
      }

      const now = new Date();
      const soon = new Date(now.getTime() + 60 * 60 * 1000);
      const glints = {};
      await Promise.allSettled((owners ?? []).map(async o => {
        const quiet  = isQuietNow(o);
        const shared = await sharesAvailabilityWith(client2, o, me.id);
        glints[o.id] = { shared, quiet };
        if (shared && !quiet) {
          const busy = await fetchBusy(client2, o, now, soon);
          glints[o.id].freeNow = !busy.some(b => new Date(b.start) <= now && now < new Date(b.end));
        }
      }));
      return res.status(200).json({ glints });
    }

    return res.status(400).json({ error: `Unknown op: ${op}` });
  }

  // ── POST operations ───────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { op } = req.body ?? {};
    const client = db();

    // send a friend request by friend code
    if (op === 'send') {
      const { friendCode } = req.body;
      if (!friendCode)
        return res.status(400).json({ error: 'friendCode is required' });

      const sender = { id: auth.userId };

      const { data: receiver, error: rErr } = await client
        .from('users').select('id').eq('friend_code', friendCode.trim().toUpperCase()).single();
      if (rErr || !receiver) return res.status(404).json({ error: 'No user found with that friend code' });

      if (sender.id === receiver.id)
        return res.status(400).json({ error: 'You cannot add yourself as a friend' });

      const { data: existing } = await client
        .from('friendships').select('user_id')
        .eq('user_id', sender.id).eq('friend_id', receiver.id).maybeSingle();
      if (existing) return res.status(400).json({ error: 'You are already friends with this user' });

      // Blocks are silent by design: the sender sees a normal "sent" response
      // but no request is created, so a blocked user can't confirm the block.
      if (await blockedEitherWay(client, sender.id, receiver.id))
        return res.status(200).json({ ok: true });

      const { error: insertErr } = await client.from('friend_requests')
        .upsert({ sender_id: sender.id, receiver_id: receiver.id, status: 'pending' },
          { onConflict: 'sender_id,receiver_id', ignoreDuplicates: false });
      if (insertErr) return res.status(500).json({ error: insertErr.message });

      return res.status(200).json({ ok: true });
    }

    // Withdraw an outgoing request — only the sender, only while pending.
    if (op === 'cancel') {
      const { requestId } = req.body;
      if (!requestId)
        return res.status(400).json({ error: 'requestId is required' });

      const me = { id: auth.userId };

      const { error } = await client.from('friend_requests')
        .delete().eq('id', requestId).eq('sender_id', me.id).eq('status', 'pending');
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    // Per-friend settings on MY friendship row (migration 015): favorite pin,
    // DM mute, and the per-friend availability override (null|visible|hidden).
    if (op === 'settings') {
      const { friendUserId, favorite, muted, availabilityOverride } = req.body;
      if (!friendUserId)
        return res.status(400).json({ error: 'friendUserId is required' });

      const me = { id: auth.userId };

      const patch = {
        ...(favorite !== undefined ? { favorite: Boolean(favorite) } : {}),
        ...(muted    !== undefined ? { muted: Boolean(muted) } : {}),
        ...(availabilityOverride !== undefined
          ? { availability_override: ['visible', 'hidden'].includes(availabilityOverride) ? availabilityOverride : null }
          : {}),
      };
      if (!Object.keys(patch).length) return res.status(400).json({ error: 'nothing to update' });

      const { error } = await client.from('friendships')
        .update(patch).eq('user_id', me.id).eq('friend_id', friendUserId);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    // Block: unfriend both directions, drop any pending requests, and record
    // the block so future requests/DMs from either side are refused. Unblock
    // removes only the block — it does not restore the friendship.
    if (op === 'block' || op === 'unblock') {
      const { userId } = req.body;
      if (!userId)
        return res.status(400).json({ error: 'userId is required' });

      const me = { id: auth.userId };

      if (op === 'unblock') {
        const { error } = await client.from('blocks')
          .delete().eq('blocker_id', me.id).eq('blocked_id', userId);
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ ok: true });
      }

      const { error: blockErr } = await client.from('blocks')
        .upsert({ blocker_id: me.id, blocked_id: userId }, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true });
      if (blockErr) return res.status(500).json({ error: blockErr.message });

      await client.from('friendships').delete().or(
        `and(user_id.eq.${me.id},friend_id.eq.${userId}),` +
        `and(user_id.eq.${userId},friend_id.eq.${me.id})`
      );
      await client.from('friend_requests').delete().or(
        `and(sender_id.eq.${me.id},receiver_id.eq.${userId}),` +
        `and(sender_id.eq.${userId},receiver_id.eq.${me.id})`
      );
      return res.status(200).json({ ok: true });
    }

    // accept or reject a friend request
    if (op === 'respond') {
      const { requestId, action } = req.body;
      if (!requestId || !['accept', 'reject'].includes(action))
        return res.status(400).json({ error: 'requestId and action (accept|reject) are required' });

      const me = { id: auth.userId };

      const { data: request, error: reqErr } = await client
        .from('friend_requests').select('id, sender_id, receiver_id, status')
        .eq('id', requestId).eq('receiver_id', me.id).single();
      if (reqErr || !request) return res.status(404).json({ error: 'Request not found' });
      if (request.status !== 'pending') return res.status(400).json({ error: 'Request already resolved' });

      const { error: updateErr } = await client.from('friend_requests')
        .update({ status: action === 'accept' ? 'accepted' : 'rejected' }).eq('id', requestId);
      if (updateErr) return res.status(500).json({ error: updateErr.message });

      if (action === 'accept') {
        const { error: friendErr } = await client.from('friendships').upsert([
          { user_id: me.id,             friend_id: request.sender_id },
          { user_id: request.sender_id, friend_id: me.id },
        ], { onConflict: 'user_id,friend_id', ignoreDuplicates: true });
        if (friendErr) return res.status(500).json({ error: friendErr.message });
      }

      return res.status(200).json({ ok: true });
    }

    // remove friendship (both directions)
    if (op === 'unfriend') {
      const { friendUserId } = req.body;
      if (!friendUserId)
        return res.status(400).json({ error: 'friendUserId is required' });

      const me = { id: auth.userId };

      const { error } = await client.from('friendships').delete().or(
        `and(user_id.eq.${me.id},friend_id.eq.${friendUserId}),` +
        `and(user_id.eq.${friendUserId},friend_id.eq.${me.id})`
      );
      if (error) return res.status(500).json({ error: error.message });

      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: `Unknown op: ${op}` });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
