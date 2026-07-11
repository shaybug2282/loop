// Schedule router — shared event scheduling with Google Calendar integration.
//
// GET  ?op=pending-events&googleId=              → events/invites for this user
// POST { op:'create-event', creatorGoogleId, invitedUserIds, eventTime, durationHours, title?, location? }
// POST { op:'respond', googleId, eventId, action, note? }  → accept / decline / reschedule (note = constraints, reschedule only)
// POST { op:'find-times', googleId, invitedUserIds, durationHours, weekOffset }
//
// Requires the pending_events table: db/migrations/002_pending_events.sql

import { decrypt } from './_crypto.js';
import { db } from './_lib.js';
import { refreshProfileIfStale } from './_profiles.js';

// Merge overlapping busy intervals, then find durationMs-length free slots.
// Prefers daytime (9 AM – 6 PM) on first pass; any hour on second pass.
// Exported for unit tests.
export function findFreeSlots(busySlots, windowStart, windowEnd, durationMs) {
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
// Returns the created Google event id (shared across all attendees' calendars),
// or null on failure — the id lets clients dedupe the Google copy of the event.
async function createGCalEvent(token, summary, startIso, durationHours, attendeeEmails = [], location = null) {
  const start = new Date(startIso);
  const end   = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
  const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      summary,
      ...(location ? { location } : {}),
      start:     { dateTime: start.toISOString(), timeZone: 'UTC' },
      end:       { dateTime: end.toISOString(),   timeZone: 'UTC' },
      attendees: attendeeEmails.map(email => ({ email })),
    }),
  });
  if (!r.ok) return null;
  const data = await r.json().catch(() => null);
  return data?.id ?? null;
}

// Scheduling-assistant chats are memory for a pending decision; once the event
// is confirmed or declined that memory is deliberately discarded. Errors are
// swallowed — an unmigrated DB (no ai_conversations, migration 007) is fine.
async function deleteLinkedConversations(client, eventId) {
  try { await client.from('ai_conversations').delete().eq('pending_event_id', eventId); } catch {}
}

// confirmEvent — every remaining invitee accepted: create the shared Google
// Calendar event and flip the row to accepted. patch carries the final
// acceptances (plus invited_user_ids/declines when a decliner was removed).
async function confirmEvent(client, ev, eventId, patch) {
  const invitedIds = patch.invited_user_ids ?? ev.invited_user_ids;

  const { data: creatorUser } = await client.from('users')
    .select('name,display_name,access_token').eq('id', ev.creator_id).single();
  // AI-scheduled events carry their own title; manual ones keep the default.
  const summary = ev.title || `${creatorUser?.display_name || creatorUser?.name || 'Someone'} Hangout!`;

  // Fetch all participants' emails for the shared attendee list.
  const { data: participants } = await client.from('users')
    .select('email').in('id', [ev.creator_id, ...invitedIds]);
  const attendeeEmails = (participants ?? []).map(u => {
    try { return decrypt(u.email); } catch { return u.email; }
  }).filter(Boolean);

  // Create one shared event on the creator's calendar; Google delivers
  // invitations to every attendee automatically.
  let googleEventId = null;
  if (creatorUser?.access_token) {
    try {
      const token = decrypt(creatorUser.access_token);
      googleEventId = await createGCalEvent(token, summary, ev.event_time, ev.duration_hours, attendeeEmails, ev.location ?? null);
    } catch {}
  }

  await client.from('pending_events')
    .update({ ...patch, status: 'accepted', google_event_created: true })
    .eq('id', eventId);

  // Stored separately so an unmigrated DB (missing google_event_id, see
  // 006_pending_events_google_event_id.sql) can't fail the accept above.
  if (googleEventId) {
    await client.from('pending_events').update({ google_event_id: googleEventId }).eq('id', eventId);
  }

  // Event confirmed → the scheduling chat that produced it is done.
  await deleteLinkedConversations(client, eventId);
}

// seedRescheduleConversation — reopen (or start) the creator's Scheduling
// Assistant chat with a note about who asked to move the event (including the
// requester's constraints/preferred times when given), and unlink the old
// event so replacement plans can be booked from the same thread. Errors are
// swallowed — an unmigrated DB (no ai_conversations) skips the AI handoff.
async function seedRescheduleConversation(client, ev, requesterId, note = null) {
  try {
    const ids = [...new Set([ev.creator_id, ...ev.invited_user_ids])];
    const { data: users } = await client.from('users')
      .select('id, name, display_name, timezone').in('id', ids);
    const nameOf = id => {
      const u = (users ?? []).find(x => x.id === id);
      return u?.display_name || u?.name || 'Someone';
    };
    const tz   = (users ?? []).find(u => u.id === ev.creator_id)?.timezone || 'UTC';
    const when = new Date(ev.event_time).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz,
    });
    const others = ev.invited_user_ids.map(nameOf).join(', ');
    const reply =
      `${nameOf(requesterId)} asked to reschedule ${ev.title ? `"${ev.title}"` : 'your event'} ` +
      `on ${when} (with ${others}).` +
      (note ? ` Their note: "${note}".` : '') +
      ` Tell me any new constraints, or say "find new times" and I'll suggest alternatives.`;
    const note = { role: 'assistant', content: JSON.stringify({ reply, plans: [] }) };

    const { data: convo } = await client.from('ai_conversations')
      .select('id, messages').eq('pending_event_id', ev.id).maybeSingle();

    if (convo) {
      await client.from('ai_conversations').update({
        messages:         [...(convo.messages ?? []), note],
        pending_event_id: null, // unlock booking for the replacement event
        updated_at:       new Date().toISOString(),
      }).eq('id', convo.id);
    } else {
      // Manually created event — start a fresh chat for the creator.
      await client.from('ai_conversations').insert({
        user_id:  ev.creator_id,
        title:    `Reschedule: ${ev.title || when}`,
        messages: [note],
      });
    }
  } catch {}
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

      // select('*') keeps this working on deployments that haven't run
      // 006_pending_events_google_event_id.sql yet (google_event_id just absent).
      const [{ data: created }, { data: invited }] = await Promise.all([
        client.from('pending_events')
          .select('*')
          .eq('creator_id', me.id)
          .in('status', ['pending', 'accepted', 'declined', 'rescheduled']),
        client.from('pending_events')
          .select('*')
          .contains('invited_user_ids', [me.id])
          .in('status', ['pending', 'accepted', 'declined', 'rescheduled']),
      ]);

      const seen   = new Set();
      const events = [...(created ?? []), ...(invited ?? [])].filter(e => {
        if (seen.has(e.id)) return false;
        seen.add(e.id); return true;
      });

      if (!events.length) return res.status(200).json({ events: [] });

      const allIds = [...new Set(events.flatMap(e =>
        [e.creator_id, ...e.invited_user_ids, ...(e.declines ?? []), ...(e.reschedule_requests ?? [])]))];
      const { data: users } = await client
        .from('users').select('id,name,display_name,picture_url').in('id', allIds);
      const uMap = Object.fromEntries((users ?? []).map(u => [u.id, u]));

      const enriched = events.map(e => ({
        ...e,
        creator:         uMap[e.creator_id] ?? null,
        invitedUsers:    e.invited_user_ids.map(id => uMap[id] ?? { id }),
        declinedUsers:   (e.declines ?? []).map(id => uMap[id] ?? { id }),
        rescheduleUsers: (e.reschedule_requests ?? []).map(id => uMap[id] ?? { id }),
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
      const { creatorGoogleId, invitedUserIds, eventTime, durationHours = 1, title, location } = req.body;
      if (!creatorGoogleId || !invitedUserIds?.length || !eventTime)
        return res.status(400).json({ error: 'creatorGoogleId, invitedUserIds, eventTime required' });

      const { data: creator } = await client.from('users').select('id').eq('google_id', creatorGoogleId).single();
      if (!creator) return res.status(404).json({ error: 'Creator not found' });

      const { data, error } = await client.from('pending_events')
        .insert({ creator_id: creator.id, invited_user_ids: invitedUserIds, event_time: eventTime, duration_hours: durationHours })
        .select('id,created_at').single();

      if (error) return res.status(500).json({ error: error.message });

      // Stored separately so an unmigrated DB (missing title/location, see
      // 007_ai_conversations.sql) can't fail the create above.
      if (title || location) {
        await client.from('pending_events')
          .update({ ...(title ? { title } : {}), ...(location ? { location } : {}) })
          .eq('id', data.id);
      }

      // Being invited to an event is the weekly trigger to refresh each
      // participant's Haiku scheduling profile. refreshProfileIfStale is a
      // no-op when a profile is <1 week old, so most events rebuild nothing;
      // failures are swallowed so profile work never blocks event creation.
      const participantIds = [...new Set([creator.id, ...invitedUserIds])];
      const { data: participants } = await client.from('users')
        .select('id, name, display_name, timezone, access_token').in('id', participantIds);
      await Promise.allSettled((participants ?? []).map(u => refreshProfileIfStale(client, u)));

      return res.status(200).json(data);
    }

    if (op === 'respond') {
      const { googleId, eventId, action, note } = req.body;
      if (!googleId || !eventId || !['accept', 'decline', 'reschedule'].includes(action))
        return res.status(400).json({ error: 'googleId, eventId, and action (accept|decline|reschedule) required' });

      const { data: me } = await client.from('users').select('id').eq('google_id', googleId).single();
      if (!me) return res.status(404).json({ error: 'User not found' });

      const { data: ev } = await client.from('pending_events').select('*').eq('id', eventId).single();
      if (!ev) return res.status(404).json({ error: 'Event not found' });

      if (!ev.invited_user_ids.includes(me.id))
        return res.status(403).json({ error: 'Not invited to this event' });

      // A rescheduling event is frozen for everyone — no invitee may accept
      // (or otherwise respond to) a time that is being moved.
      if (ev.status === 'rescheduled')
        return res.status(409).json({ error: 'Event is being rescheduled' });

      if (action === 'decline') {
        // The creator is notified either way via the declines array.
        const declines = [...new Set([...(ev.declines ?? []), me.id])];
        const remaining = ev.invited_user_ids.filter(id => id !== me.id);

        if (!remaining.length) {
          // Sole invitee declined — the plan is dead for everyone.
          await client.from('pending_events').update({ declines, status: 'declined' }).eq('id', eventId);
          // Event denied → the scheduling chat that produced it is done.
          await deleteLinkedConversations(client, eventId);
          return res.status(200).json({ ok: true, status: 'declined', declined: true });
        }

        // Others can still attend: remove the decliner from the event and
        // carry on. If everyone left has already accepted, that confirms it.
        const acceptances = (ev.acceptances ?? []).filter(id => id !== me.id);
        const allAccepted = remaining.every(id => acceptances.includes(id));

        if (allAccepted && !ev.google_event_created) {
          await confirmEvent(client, ev, eventId, { acceptances, invited_user_ids: remaining, declines });
          return res.status(200).json({ ok: true, status: 'accepted', removed: true });
        }

        await client.from('pending_events')
          .update({ invited_user_ids: remaining, acceptances, declines })
          .eq('id', eventId);
        return res.status(200).json({ ok: true, status: 'pending', removed: true });
      }

      if (action === 'reschedule') {
        // Requester can't make this time: park the event as 'rescheduled'
        // (off everyone's calendars/invites, creator keeps a notification) and
        // hand the creator's Scheduling Assistant chat the context to find new
        // times. A replacement event is booked from that chat as usual.
        await client.from('pending_events').update({ status: 'rescheduled' }).eq('id', eventId);
        // Stored separately so an unmigrated DB (missing reschedule_requests,
        // see 008_reschedule_requests.sql) can't fail the status change above.
        const requests = [...new Set([...(ev.reschedule_requests ?? []), me.id])];
        await client.from('pending_events').update({ reschedule_requests: requests }).eq('id', eventId);

        await seedRescheduleConversation(client, ev, me.id, typeof note === 'string' ? note.slice(0, 500) : null);
        return res.status(200).json({ ok: true, status: 'rescheduled' });
      }

      // Accept
      const acceptances = [...new Set([...ev.acceptances, me.id])];
      const allAccepted = ev.invited_user_ids.every(id => acceptances.includes(id));

      if (allAccepted && !ev.google_event_created) {
        await confirmEvent(client, ev, eventId, { acceptances });
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
