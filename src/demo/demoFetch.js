import { loadWorld, mutate, encryptThread, getFriendPublicKeyJwk, decryptIncoming } from './demoStore';
import { respond } from './demoAssistant';

// The one seam demo mode needs.
//
// Every widget in the app reaches its data through `fetch` — either `/api/*` or
// Google's Calendar/Tasks hosts. Patching `fetch` therefore covers the whole
// app without a single component knowing demo mode exists, which is why this
// file is the entire integration surface.
//
// Anything not handled here returns a local 501 rather than falling through to
// the network. That is deliberate: a gap in coverage should be a visibly broken
// widget in demo mode, never a real request from someone with no account.

const CAL_HOST   = 'www.googleapis.com';
const TASKS_HOST = 'tasks.googleapis.com';

let originalFetch = null;

// json — a Response with a JSON body, matching what the real endpoints return.
// out: Response
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// delay — a beat before responding. Instant replies read as canned; this also
// keeps loading states visible, which is closer to the real experience.
const delay = ms => new Promise(r => setTimeout(r, ms));

const uid = prefix => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

// ── /api/* ───────────────────────────────────────────────────────────────────

// handleApiGet — GET ops, dispatched on `op` exactly as the real routers do.
// out: Promise<Response>
async function handleApiGet(router, params) {
  const op = params.get('op');
  const w  = loadWorld();

  if (router === 'user') {
    switch (op) {
      case 'session':  return json({ userId: w.me.id, googleId: w.me.googleId });
      case 'my-id':    return json({ id: w.me.id });
      // A dummy token so getValidToken resolves and googleAuth is never
      // reached; the Google hosts are intercepted below anyway.
      case 'google-token':
        return json({ accessToken: 'demo-token', expiresAt: new Date(Date.now() + 3600_000).toISOString() });
      case 'notification-state':
        return json(w.notifications);
      case 'profile':
        return json({
          display_name:      w.me.display_name,
          show_email:        w.me.show_email,
          show_phone:        w.me.show_phone,
          phone_number:      w.me.phone_number,
          friend_code:       w.me.friend_code,
          quiet_time_since:  null,
          quiet_time_until:  null,
          preferences:       w.me.preferences,
          custom_avatar_url: null,
          picture_url:       w.me.picture_url,
        });
      default: break;
    }
  }

  if (router === 'friends') {
    switch (op) {
      case 'data':
        return json({
          friendCode:   w.me.friend_code,
          requests:     [],
          sentRequests: [],
          friends:      w.friends,
          blocked:      [],
        });
      case 'glints':
        // Everyone shares availability and nobody is in Quiet Time; freeNow is
        // computed off the same fixture calendars the assistant reads.
        return json({
          glints: Object.fromEntries(w.friends.map(f => {
            const now = Date.now();
            const busy = (w.calendars[f.id] ?? []).some(e =>
              new Date(e.start.dateTime).getTime() <= now && now < new Date(e.end.dateTime).getTime());
            return [f.id, { shared: true, quiet: false, freeNow: !busy }];
          })),
        });
      case 'availability': {
        const id = params.get('friendUserId');
        return json({
          shared:   true,
          quiet:    false,
          busy:     (w.calendars[id] ?? []).map(e => ({ start: e.start.dateTime, end: e.end.dateTime })),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        });
      }
      default: break;
    }
  }

  if (router === 'messages') {
    switch (op) {
      case 'conversations':
        return json({
          conversations: Object.entries(w.dms)
            .map(([friendId, thread]) => {
              const f = w.friends.find(x => x.id === friendId);
              return {
                userId:        friendId,
                name:          f?.name,
                display_name:  f?.display_name,
                picture_url:   null,
                lastMessageAt: thread[thread.length - 1]?.created_at,
              };
            })
            .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt)),
        });
      case 'conversation':
        return json({ messages: await encryptThread(params.get('friendId')) });
      case 'public-key': {
        const jwk = await getFriendPublicKeyJwk(params.get('userId'));
        return jwk
          ? json({ publicKeyJwk: jwk })
          : json({ error: 'No key for this user' }, 404);
      }
      default: break;
    }
  }

  if (router === 'groups') {
    switch (op) {
      case 'list':            return json({ groups: w.groups });
      case 'pending-invites': return json({ invites: [] });
      case 'messages': {
        const msgs = w.groupMessages[params.get('groupId')] ?? [];
        // The real endpoint returns newest-first; the client reverses it.
        return json({ messages: [...msgs].reverse() });
      }
      default: break;
    }
  }

  if (router === 'schedule' && op === 'pending-events') {
    const uMap = Object.fromEntries([w.me, ...w.friends].map(u => [u.id, u]));
    const gMap = Object.fromEntries(w.groups.map(g => [g.id, g]));
    return json({
      events: w.pendingEvents.map(e => ({
        ...e,
        creator:         uMap[e.creator_id] ?? null,
        invitedUsers:    e.invited_user_ids.map(id => uMap[id] ?? { id }),
        declinedUsers:   (e.declines ?? []).map(id => uMap[id] ?? { id }),
        rescheduleUsers: (e.reschedule_requests ?? []).map(id => uMap[id] ?? { id }),
        isCreator:       e.creator_id === w.me.id,
        myId:            w.me.id,
        iRainchecked:    false,
        group:           e.group_id ? (gMap[e.group_id] ?? null) : null,
      })),
    });
  }

  if (router === 'ai') {
    switch (op) {
      case 'conversations':
        return json({
          conversations: w.aiConversations.map(({ messages, ...c }) => c),
        });
      case 'conversation': {
        const convo = w.aiConversations.find(c => c.id === params.get('id'));
        return convo ? json({ conversation: convo }) : json({ error: 'Not found' }, 404);
      }
      case 'profile-prefs':
        return json({ hard_constraints: [], soft_constraints: [] });
      default: break;
    }
  }

  return unhandled(`GET /api/${router}?op=${op}`);
}

// handleApiPost — POST ops. Mutations write to the demo world and persist.
// out: Promise<Response>
async function handleApiPost(router, body) {
  const { op } = body ?? {};

  if (router === 'messages') {
    switch (op) {
      case 'store-key': return json({ ok: true });
      case 'send': {
        // The store keeps plaintext (it re-encrypts the thread on every read),
        // so decrypt what the UI just sent. The demo holds the friend's half of
        // the ECDH exchange, so this is the same key the UI encrypted with.
        const id = uid('d-dm');
        const created = new Date().toISOString();
        let text = '';
        try {
          text = await decryptIncoming(body.receiverId, body.ciphertext, body.iv);
        } catch {
          text = '[could not read]';
        }
        mutate(world => {
          const thread = world.dms[body.receiverId] ?? (world.dms[body.receiverId] = []);
          thread.push({ id, sender_id: world.me.id, text, created_at: created });
        });
        return json({ id, created_at: created });
      }
      case 'delete':
        mutate(world => {
          for (const thread of Object.values(world.dms)) {
            const i = thread.findIndex(m => m.id === body.messageId);
            if (i >= 0) thread.splice(i, 1);
          }
        });
        return json({ ok: true });
      case 'edit': return json({ ok: true });
      default: break;
    }
  }

  if (router === 'groups') {
    switch (op) {
      case 'touch': return json({ ok: true });
      case 'send-message': {
        const created = new Date().toISOString();
        mutate(world => {
          const thread = world.groupMessages[body.groupId] ?? (world.groupMessages[body.groupId] = []);
          thread.push({
            id: uid('d-gm'), senderId: world.me.id, senderName: world.me.display_name,
            content: body.content, created_at: created,
          });
        });
        return json({ ok: true });
      }
      default: break;
    }
  }

  if (router === 'schedule') {
    switch (op) {
      case 'create-event': {
        const id = uid('demo-pending');
        mutate(world => {
          world.pendingEvents.unshift({
            id,
            title:               body.title || 'Hangout',
            event_time:          body.eventTime,
            duration_hours:      body.durationHours ?? 2,
            status:              'pending',
            creator_id:          world.me.id,
            invited_user_ids:    body.invitedUserIds ?? [],
            acceptances:         [],
            declines:            [],
            reschedule_requests: [],
            group_id:            body.groupId ?? null,
            created_at:          new Date().toISOString(),
          });
          // Booked plans belong on the calendar too, same as the real flow.
          world.calendars[world.me.id].push({
            id:      uid('d-me'),
            summary: body.title || 'Hangout',
            start:   { dateTime: body.eventTime },
            end:     { dateTime: new Date(new Date(body.eventTime).getTime()
                        + (body.durationHours ?? 2) * 3600_000).toISOString() },
          });
        });
        return json({ id, ok: true });
      }
      case 'respond':
      case 'raincheck':
      case 'update-event':
        return json({ ok: true });
      case 'delete-event':
        mutate(world => {
          world.pendingEvents = world.pendingEvents.filter(e => e.id !== body.eventId);
        });
        return json({ ok: true });
      default: break;
    }
  }

  if (router === 'ai') {
    switch (op) {
      case 'chat': {
        await delay(700);
        const { reply, plans } = respond(body.message);
        const conversationId = body.conversationId ?? uid('demo-convo');

        mutate(world => {
          let convo = world.aiConversations.find(c => c.id === conversationId);
          if (!convo) {
            convo = {
              id: conversationId,
              title: String(body.message ?? 'New plan').slice(0, 60),
              pending_event_id: null,
              updated_at: new Date().toISOString(),
              messages: [],
            };
            world.aiConversations.unshift(convo);
          }
          convo.messages.push({ role: 'user', content: body.message });
          convo.messages.push({ role: 'assistant', content: JSON.stringify({ reply, plans }) });
          convo.updated_at = new Date().toISOString();
        });

        return json({ conversationId, reply, plans, remembered: null });
      }
      case 'record-booking': return json({ ok: true });
      case 'delete-conversation':
        mutate(world => {
          world.aiConversations = world.aiConversations.filter(c => c.id !== body.id);
        });
        return json({ ok: true });
      case 'add-constraint':
      case 'forget-constraint':
      case 'build-profile':
        return json({ ok: true });
      default: break;
    }
  }

  if (router === 'user') {
    switch (op) {
      case 'logout': return json({ ok: true });
      case 'notification-state':
        mutate(world => {
          world.notifications = { seen: body.seen ?? [], dismissed: body.dismissed ?? [] };
        });
        return json({ ok: true });
      case 'preferences':
        mutate(world => { world.me.preferences = { ...world.me.preferences, ...body.preferences }; });
        return json({ ok: true });
      case 'update-profile':
        mutate(world => {
          if (body.displayName != null) world.me.display_name = body.displayName;
          if (body.phoneNumber != null) world.me.phone_number = body.phoneNumber;
          if (body.showEmail   != null) world.me.show_email   = body.showEmail;
          if (body.showPhone   != null) world.me.show_phone   = body.showPhone;
        });
        return json({ ok: true });
      case 'quiet-time':
      case 'regenerate-code':
        return json({ ok: true });
      default: break;
    }
  }

  return unhandled(`POST /api/${router} op=${op}`);
}

// ── Google Calendar + Tasks ──────────────────────────────────────────────────

// handleGoogle — the two Google hosts src/utils/googleCalendar.js talks to,
// answered from the fixture calendar in the shapes that file parses.
// out: Promise<Response>
async function handleGoogle(url, method) {
  const w = loadWorld();

  if (url.hostname === TASKS_HOST) {
    if (url.pathname.endsWith('/users/@me/lists')) {
      return json({ items: [{ id: 'demo-list', title: 'My Tasks' }] });
    }
    if (/\/lists\/[^/]+\/tasks$/.test(url.pathname)) {
      if (method === 'POST') return json({ id: uid('d-task'), title: '', status: 'needsAction' });
      return json({
        items: w.tasks.map(t => ({
          id: t.id, title: t.text, status: t.completed ? 'completed' : 'needsAction',
        })),
      });
    }
    // Individual task PATCH/DELETE.
    return json({ ok: true });
  }

  // Calendar. `primary` is the demo user's own fixture calendar.
  if (url.pathname.includes('/calendars/primary/events')) {
    if (method === 'GET') {
      const min = url.searchParams.get('timeMin');
      const max = url.searchParams.get('timeMax');
      const from = min ? new Date(min).getTime() : -Infinity;
      const to   = max ? new Date(max).getTime() :  Infinity;
      return json({
        items: (w.calendars[w.me.id] ?? [])
          .filter(e => {
            const s = new Date(e.start.dateTime).getTime();
            return s >= from && s <= to;
          })
          .sort((a, b) => new Date(a.start.dateTime) - new Date(b.start.dateTime)),
      });
    }
    return json({ id: uid('d-me'), status: 'confirmed' });
  }

  return unhandled(`${method} ${url.host}${url.pathname}`);
}

// unhandled — a local 501 for anything without a handler. Never reaches the
// network; warns so gaps surface during development instead of silently
// half-breaking a page. out: Response
function unhandled(what) {
  console.warn(`[demo] no handler for ${what} — returning 501`);
  return json({ error: `Not available in demo mode: ${what}` }, 501);
}

// ── Install / uninstall ──────────────────────────────────────────────────────

// installDemoFetch — patch window.fetch. Call at module scope on boot, before
// React renders: AuthContext validates its session on mount and logs out on a
// 401, which would tear the demo down before it started.
export function installDemoFetch() {
  if (originalFetch) return;
  originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const raw    = typeof input === 'string' ? input : input?.url ?? '';
    const method = (init.method ?? (typeof input === 'object' ? input?.method : null) ?? 'GET').toUpperCase();

    let url;
    try { url = new URL(raw, window.location.origin); } catch { return originalFetch(input, init); }

    if (url.host === CAL_HOST || url.host === TASKS_HOST) {
      return handleGoogle(url, method);
    }

    if (url.pathname.startsWith('/api/')) {
      const router = url.pathname.split('/')[2];
      if (method === 'GET') return handleApiGet(router, url.searchParams);
      let body = {};
      try { body = JSON.parse(init.body ?? '{}'); } catch {}
      return handleApiPost(router, body);
    }

    return originalFetch(input, init);
  };
}

// uninstallDemoFetch — restore the real fetch. Exiting demo mode reloads the
// page anyway, but leaving a patched global behind would be a trap.
export function uninstallDemoFetch() {
  if (!originalFetch) return;
  window.fetch = originalFetch;
  originalFetch = null;
}
