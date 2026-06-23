// Schedule router — shared event scheduling with Google Calendar integration.
//
// GET  ?op=pending-events&googleId=              → events/invites for this user
// POST { op:'create-event', creatorGoogleId, invitedUserIds, eventTime, durationHours }
// POST { op:'respond', googleId, eventId, action }  → accept / decline
// POST { op:'find-times', googleId, invitedUserIds, durationHours, weekOffset }
//
// Required Supabase migration (run once):
//   CREATE TABLE pending_events (
//     id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//     creator_id      UUID REFERENCES users(id),
//     invited_user_ids UUID[] NOT NULL DEFAULT '{}',
//     event_time      TIMESTAMPTZ NOT NULL,
//     duration_hours  FLOAT NOT NULL DEFAULT 1,
//     status          TEXT NOT NULL DEFAULT 'pending',
//     acceptances     UUID[] NOT NULL DEFAULT '{}',
//     created_at      TIMESTAMPTZ DEFAULT now(),
//     google_event_created BOOLEAN DEFAULT false
//   );

import { createClient } from '@supabase/supabase-js';
import { decrypt } from './_crypto.js';

const db = () => createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Merge overlapping busy intervals, then find durationMs-length free slots.
// Prefers daytime (9 AM – 6 PM) on first pass; any hour on second pass.
function findFreeSlots(busySlots, windowStart, windowEnd, durationMs) {
  const we = windowEnd.getTime();

  const sorted = busySlots
    .map(s => [new Date(s.start).getTime(), new Date(s.end).getTime()])
    .sort((a, b) => a[0] - b[0]);

  const merged = [];
  for (const [s, e] of sorted) {
    if (merged.length && s < merged[merged.length - 1][1]) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
    } else {
      merged.push([s, e]);
    }
  }

  const isFree = (start) => {
    const end = start + durationMs;
    return end <= we && !merged.some(([bs, be]) => start < be && end > bs);
  };

  const STEP    = 30 * 60 * 1000;
  const MIN_GAP =  6 * 60 * 60 * 1000;
  const selected = [];

  for (const daytimeOnly of [true, false]) {
    if (selected.length >= 3) break;

    let ts = windowStart.getTime();

    while (ts < we && selected.length < 3) {
      const d    = new Date(ts);
      const hour = d.getHours() + d.getMinutes() / 60;

      if (daytimeOnly) {
        if (hour < 9) {
          d.setHours(9, 0, 0, 0); ts = d.getTime(); continue;
        }
        const endHour = new Date(ts + durationMs).getHours() +
                        new Date(ts + durationMs).getMinutes() / 60;
        if (hour >= 18 || endHour > 18) {
          d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0);
          ts = d.getTime(); continue;
        }
      }

      // Jump over any busy block that covers ts
      const block = merged.find(([bs, be]) => ts >= bs && ts < be);
      if (block) { ts = block[1]; continue; }

      if (isFree(ts)) {
        const spaced = !selected.length || ts - selected[selected.length - 1] >= MIN_GAP;
        if (spaced) selected.push(ts);
      }

      ts += STEP;
    }
  }

  return selected.map(ts => new Date(ts).toISOString());
}

// Creates a shared event on the organizer's calendar with all participants as attendees.
// Google Calendar handles delivering invitations to each attendee automatically.
async function createGCalEvent(token, summary, startIso, durationHours, attendeeEmails = []) {
  const start = new Date(startIso);
  const end   = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
  await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      summary,
      start:     { dateTime: start.toISOString(), timeZone: 'UTC' },
      end:       { dateTime: end.toISOString(),   timeZone: 'UTC' },
      attendees: attendeeEmails.map(email => ({ email })),
    }),
  });
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const client = db();

  // ── GET ──────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { op, googleId } = req.query;

    if (op === 'pending-events') {
      if (!googleId) return res.status(400).json({ error: 'googleId required' });

      const { data: me } = await client.from('users').select('id').eq('google_id', googleId).single();
      if (!me) return res.status(404).json({ error: 'User not found' });

      const [{ data: created }, { data: invited }] = await Promise.all([
        client.from('pending_events')
          .select('id,creator_id,invited_user_ids,event_time,duration_hours,status,acceptances,declines,created_at')
          .eq('creator_id', me.id)
          .in('status', ['pending', 'accepted']),
        client.from('pending_events')
          .select('id,creator_id,invited_user_ids,event_time,duration_hours,status,acceptances,declines,created_at')
          .contains('invited_user_ids', [me.id])
          .in('status', ['pending', 'accepted']),
      ]);

      const seen   = new Set();
      const events = [...(created ?? []), ...(invited ?? [])].filter(e => {
        if (seen.has(e.id)) return false;
        seen.add(e.id); return true;
      });

      if (!events.length) return res.status(200).json({ events: [] });

      const allIds = [...new Set(events.flatMap(e => [e.creator_id, ...e.invited_user_ids, ...(e.declines ?? [])]))];
      const { data: users } = await client
        .from('users').select('id,name,display_name,picture_url').in('id', allIds);
      const uMap = Object.fromEntries((users ?? []).map(u => [u.id, u]));

      const enriched = events.map(e => ({
        ...e,
        creator:       uMap[e.creator_id] ?? null,
        invitedUsers:  e.invited_user_ids.map(id => uMap[id] ?? { id }),
        declinedUsers: (e.declines ?? []).map(id => uMap[id] ?? { id }),
        isCreator:     e.creator_id === me.id,
        myId:          me.id,
      }));

      return res.status(200).json({ events: enriched });
    }

    return res.status(400).json({ error: `Unknown op: ${op}` });
  }

  // ── POST ─────────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { op } = req.body ?? {};

    if (op === 'create-event') {
      const { creatorGoogleId, invitedUserIds, eventTime, durationHours = 1 } = req.body;
      if (!creatorGoogleId || !invitedUserIds?.length || !eventTime)
        return res.status(400).json({ error: 'creatorGoogleId, invitedUserIds, eventTime required' });

      const { data: creator } = await client.from('users').select('id').eq('google_id', creatorGoogleId).single();
      if (!creator) return res.status(404).json({ error: 'Creator not found' });

      const { data, error } = await client.from('pending_events')
        .insert({ creator_id: creator.id, invited_user_ids: invitedUserIds, event_time: eventTime, duration_hours: durationHours })
        .select('id,created_at').single();

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data);
    }

    if (op === 'respond') {
      const { googleId, eventId, action } = req.body;
      if (!googleId || !eventId || !['accept','decline'].includes(action))
        return res.status(400).json({ error: 'googleId, eventId, and action (accept|decline) required' });

      const { data: me } = await client.from('users').select('id').eq('google_id', googleId).single();
      if (!me) return res.status(404).json({ error: 'User not found' });

      const { data: ev } = await client.from('pending_events').select('*').eq('id', eventId).single();
      if (!ev) return res.status(404).json({ error: 'Event not found' });

      if (!ev.invited_user_ids.includes(me.id))
        return res.status(403).json({ error: 'Not invited to this event' });

      if (action === 'decline') {
        const declines = [...new Set([...(ev.declines ?? []), me.id])];
        await client.from('pending_events').update({ declines }).eq('id', eventId);
        return res.status(200).json({ ok: true, status: 'pending', declined: true });
      }

      // Accept
      const acceptances = [...new Set([...ev.acceptances, me.id])];
      const allAccepted = ev.invited_user_ids.every(id => acceptances.includes(id));

      if (allAccepted && !ev.google_event_created) {
        const { data: creatorUser } = await client.from('users')
          .select('name,display_name,access_token').eq('id', ev.creator_id).single();
        const summary = `${creatorUser?.display_name || creatorUser?.name || 'Someone'} Hangout!`;

        // Fetch all participants' emails for the shared attendee list.
        const { data: participants } = await client.from('users')
          .select('email').in('id', [ev.creator_id, ...ev.invited_user_ids]);
        const attendeeEmails = (participants ?? []).map(u => u.email).filter(Boolean);

        // Create one shared event on the creator's calendar; Google delivers
        // invitations to every attendee automatically.
        if (creatorUser?.access_token) {
          try {
            const token = decrypt(creatorUser.access_token);
            await createGCalEvent(token, summary, ev.event_time, ev.duration_hours, attendeeEmails);
          } catch {}
        }

        await client.from('pending_events')
          .update({ acceptances, status: 'accepted', google_event_created: true })
          .eq('id', eventId);

        return res.status(200).json({ ok: true, status: 'accepted', allAccepted: true });
      }

      await client.from('pending_events').update({ acceptances }).eq('id', eventId);
      return res.status(200).json({ ok: true, status: 'pending', allAccepted: false });
    }

    if (op === 'find-times') {
      const { googleId, invitedUserIds, durationHours, weekOffset = 0 } = req.body;
      if (!googleId || !invitedUserIds?.length || !durationHours)
        return res.status(400).json({ error: 'googleId, invitedUserIds, durationHours required' });

      const { data: me } = await client.from('users').select('id').eq('google_id', googleId).single();
      if (!me) return res.status(404).json({ error: 'User not found' });

      const allIds = [me.id, ...invitedUserIds];
      const { data: users } = await client.from('users').select('id,access_token').in('id', allIds);

      const now         = new Date();
      const windowStart = new Date(now.getTime() + weekOffset * 7 * 24 * 60 * 60 * 1000);
      windowStart.setHours(0, 0, 0, 0);
      const windowEnd = new Date(windowStart.getTime() + 7 * 24 * 60 * 60 * 1000);

      const busySlots = [];
      await Promise.allSettled((users ?? []).map(async u => {
        if (!u.access_token) return;
        try {
          const token    = decrypt(u.access_token);
          const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
            method:  'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              timeMin: windowStart.toISOString(),
              timeMax: windowEnd.toISOString(),
              items:   [{ id: 'primary' }],
            }),
          });
          if (response.ok) {
            const d = await response.json();
            busySlots.push(...(d.calendars?.primary?.busy ?? []));
          }
        } catch {}
      }));

      const proposedTimes = findFreeSlots(busySlots, windowStart, windowEnd, durationHours * 60 * 60 * 1000);
      return res.status(200).json({ proposedTimes });
    }

    return res.status(400).json({ error: `Unknown op: ${op}` });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
