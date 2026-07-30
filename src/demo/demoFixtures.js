// Seed data for demo mode — the fake world a visitor explores without an
// account. Everything here is shaped exactly like the real API responses (see
// demoFetch.js for the mapping), so no component knows the difference.
//
// Dates are generated relative to "now" at seed time rather than hardcoded, so
// the demo calendar is never stale no matter when someone visits.

// Stable ids. Real ones are Supabase UUIDs; these only have to be unique and
// consistent within the demo — the scheduling code compares them by identity.
export const DEMO_ME = 'demo-user-alex';

export const FRIEND_IDS = {
  sam:    'demo-friend-sam',
  priya:  'demo-friend-priya',
  jordan: 'demo-friend-jordan',
  maya:   'demo-friend-maya',
};

export const GROUP_IDS = {
  climbing: 'demo-group-climbing',
  dinner:   'demo-group-dinner',
};

// ── Date helpers ─────────────────────────────────────────────────────────────

// startOfToday — local midnight, the anchor every fixture date is offset from.
// out: Date
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

// at — `dayOffset` days from today at `hour`:`minute` local time.
// out: Date
const at = (dayOffset, hour, minute = 0) => {
  const d = startOfToday();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
};

// slot — a calendar event in the Google Calendar API's shape, which is what
// src/utils/googleCalendar.js parses. out: event object
const slot = (id, summary, dayOffset, hour, durationHours, location = null) => ({
  id,
  summary,
  ...(location ? { location } : {}),
  start: { dateTime: at(dayOffset, hour).toISOString() },
  end:   { dateTime: at(dayOffset, hour + durationHours).toISOString() },
});

// ── People ───────────────────────────────────────────────────────────────────

// picture_url is null throughout: the existing avatar components fall back to
// an initial-letter placeholder, so the demo makes no external image requests.
const person = (id, name, email, phone) => ({
  id,
  name,
  display_name: name,
  email,
  show_email:   true,
  show_phone:   true,
  phone_number: phone,
  picture_url:  null,
  friend_code:  `DEMO${name.slice(0, 2).toUpperCase()}`,
});

// ── The world ────────────────────────────────────────────────────────────────

// seedWorld — builds a complete demo world anchored to today. Called once per
// demo session; the result is persisted to sessionStorage by demoStore.
// out: world object (plain JSON, safe to serialize)
export function seedWorld() {
  const me = {
    id:           DEMO_ME,
    googleId:     'demo-google-id',
    name:         'Alex Rivera',
    display_name: 'Alex Rivera',
    email:        'alex@example.com',
    picture_url:  null,
    friend_code:  'DEMOALEX',
    show_email:   true,
    show_phone:   true,
    phone_number: '(555)010-2288',
    preferences:  {},
  };

  const friends = [
    person(FRIEND_IDS.sam,    'Sam Chen',     'sam@example.com',    '(555)010-3311'),
    person(FRIEND_IDS.priya,  'Priya Nair',   'priya@example.com',  '(555)010-4422'),
    person(FRIEND_IDS.jordan, 'Jordan Blake', 'jordan@example.com', '(555)010-5533'),
    person(FRIEND_IDS.maya,   'Maya Okafor',  'maya@example.com',   '(555)010-6644'),
  ].map(f => ({
    ...f,
    settings: { favorite: false, muted: false, availability_override: null },
  }));

  const memberOf = (ids, status = 'accepted') =>
    ids.map(id => {
      const f = friends.find(x => x.id === id);
      return {
        id,
        status,
        name:         id === DEMO_ME ? me.name : f?.name,
        display_name: id === DEMO_ME ? me.display_name : f?.display_name,
        picture_url:  null,
      };
    });

  const groups = [
    {
      id:            GROUP_IDS.climbing,
      name:          'Climbing Crew',
      description:   'Thursday sessions at the gym',
      color:         '#E8607A',
      icon_url:      null,
      last_accessed: at(0, 9).toISOString(),
      members:       memberOf([DEMO_ME, FRIEND_IDS.sam, FRIEND_IDS.jordan, FRIEND_IDS.maya]),
      myStatus:      'accepted',
      isCreator:     true,
      invitedBy:     null,
    },
    {
      id:            GROUP_IDS.dinner,
      name:          'Sunday Dinner',
      description:   'Rotating hosts, no agenda',
      color:         '#6C8AE4',
      icon_url:      null,
      last_accessed: at(-2, 19).toISOString(),
      members:       memberOf([DEMO_ME, FRIEND_IDS.priya, FRIEND_IDS.maya]),
      myStatus:      'accepted',
      isCreator:     false,
      invitedBy:     'Priya Nair',
    },
  ];

  // Busy windows per person. Deliberately overlapping-but-not-identical so the
  // demo's slot finder has real gaps to discover rather than trivial ones.
  //
  // These deliberately run through day 13, not just the current week. "Next
  // week" is the phrasing the landing page suggests and the first thing most
  // visitors type — if calendars stopped at day 6, that query would land on
  // empty space and the assistant would "find" three consecutive evenings
  // having dodged nothing. Evenings in week two are contested on purpose.
  const calendars = {
    [DEMO_ME]: [
      slot('d-me-1',  'Standup',          0,  9,  1),
      slot('d-me-2',  'Design review',    0,  14, 1),
      slot('d-me-3',  'Dentist',          1,  11, 1, 'btwn 4th & Pine'),
      slot('d-me-4',  'Sprint planning',  2,  10, 2),
      slot('d-me-5',  'Climbing',         3,  18, 2, 'Vertical World'),
      slot('d-me-6',  'Coffee with Dana', 4,  9,  1),
      slot('d-me-7',  'Flight home',      6,  8,  3),
      slot('d-me-8',  'Standup',          7,  9,  1),
      slot('d-me-9',  'Dinner w/ family', 7,  18, 3),
      slot('d-me-10', 'Team offsite',     8,  9,  8),
      slot('d-me-11', 'Climbing',         10, 18, 2, 'Vertical World'),
      slot('d-me-12', 'Book club',        12, 19, 2),
    ],
    [FRIEND_IDS.sam]: [
      slot('d-sam-1', 'Busy', 0,  10, 3),
      slot('d-sam-2', 'Busy', 1,  13, 2),
      slot('d-sam-3', 'Busy', 3,  18, 2),
      slot('d-sam-4', 'Busy', 5,  12, 4),
      slot('d-sam-5', 'Busy', 7,  17, 4),
      slot('d-sam-6', 'Busy', 8,  12, 4),
      slot('d-sam-7', 'Busy', 11, 18, 3),
      slot('d-sam-8', 'Busy', 12, 9,  6),
    ],
    [FRIEND_IDS.priya]: [
      slot('d-pri-1', 'Busy', 0,  9,  2),
      slot('d-pri-2', 'Busy', 2,  17, 3),
      slot('d-pri-3', 'Busy', 4,  12, 2),
      slot('d-pri-4', 'Busy', 7,  18, 3),
      slot('d-pri-5', 'Busy', 9,  10, 4),
      slot('d-pri-6', 'Busy', 10, 18, 3),
      slot('d-pri-7', 'Busy', 13, 12, 4),
    ],
    [FRIEND_IDS.jordan]: [
      slot('d-jor-1', 'Busy', 1,  9,  4),
      slot('d-jor-2', 'Busy', 3,  18, 2),
      slot('d-jor-3', 'Busy', 6,  10, 5),
      slot('d-jor-4', 'Busy', 8,  18, 3),
      slot('d-jor-5', 'Busy', 9,  19, 2),
      slot('d-jor-6', 'Busy', 12, 17, 4),
    ],
    [FRIEND_IDS.maya]: [
      slot('d-may-1', 'Busy', 0,  13, 2),
      slot('d-may-2', 'Busy', 2,  9,  3),
      slot('d-may-3', 'Busy', 5,  18, 2),
      slot('d-may-4', 'Busy', 7,  19, 2),
      slot('d-may-5', 'Busy', 10, 17, 4),
      slot('d-may-6', 'Busy', 11, 18, 3),
    ],
  };

  const tasks = [
    { id: 'd-task-1', text: 'Book climbing gym for Thursday', completed: false, listId: 'demo-list' },
    { id: 'd-task-2', text: 'Reply to Priya about dinner',    completed: false, listId: 'demo-list' },
    { id: 'd-task-3', text: 'Renew gym membership',           completed: true,  listId: 'demo-list' },
  ];

  // One invite already out and waiting on replies — this is what fills the
  // dashboard's "In the Works" panel, which is empty and confusing otherwise.
  const pendingEvents = [
    {
      id:                  'demo-pending-1',
      title:               'Dinner at Priya\'s',
      event_time:          at(3, 19).toISOString(),
      duration_hours:      2,
      status:              'pending',
      creator_id:          DEMO_ME,
      invited_user_ids:    [FRIEND_IDS.priya, FRIEND_IDS.maya],
      acceptances:         [FRIEND_IDS.priya],
      declines:            [],
      reschedule_requests: [],
      group_id:            GROUP_IDS.dinner,
      created_at:          at(-1, 12).toISOString(),
    },
  ];

  // DM history in plaintext. demoStore encrypts these with the real ECDH path
  // on read, so the messaging UI decrypts them for real rather than showing
  // "[encrypted]".
  const dms = {
    [FRIEND_IDS.sam]: [
      { id: 'd-dm-1', sender_id: FRIEND_IDS.sam, text: 'are we still on for climbing thursday?', created_at: at(-1, 17, 12).toISOString() },
      { id: 'd-dm-2', sender_id: DEMO_ME,        text: 'yep, booked the gym',                    created_at: at(-1, 17, 40).toISOString() },
      { id: 'd-dm-3', sender_id: FRIEND_IDS.sam, text: 'nice. bringing jordan too',              created_at: at(-1, 18, 2).toISOString() },
    ],
    [FRIEND_IDS.priya]: [
      { id: 'd-dm-4', sender_id: FRIEND_IDS.priya, text: 'sent the dinner invite, let me know!', created_at: at(-1, 12, 30).toISOString() },
    ],
  };

  const groupMessages = {
    [GROUP_IDS.climbing]: [
      { id: 'd-gm-1', senderId: FRIEND_IDS.jordan, senderName: 'Jordan Blake', content: 'who\'s in for thursday?', created_at: at(-2, 9, 15).toISOString() },
      { id: 'd-gm-2', senderId: DEMO_ME,           senderName: 'Alex Rivera',  content: 'me',                     created_at: at(-2, 9, 22).toISOString() },
      { id: 'd-gm-3', senderId: FRIEND_IDS.maya,   senderName: 'Maya Okafor',  content: 'same, 6pm works',        created_at: at(-2, 10, 1).toISOString() },
    ],
    [GROUP_IDS.dinner]: [
      { id: 'd-gm-4', senderId: FRIEND_IDS.priya, senderName: 'Priya Nair', content: 'my place this week?', created_at: at(-2, 19, 5).toISOString() },
    ],
  };

  // One plan already in flight, so the Plans section isn't empty on first open.
  const aiConversations = [
    {
      id:               'demo-convo-1',
      title:            'Dinner with Priya and Maya',
      pending_event_id: 'demo-pending-1',
      updated_at:       at(-1, 12).toISOString(),
      messages: [
        { role: 'user', content: 'dinner with priya and maya this week' },
        {
          role: 'assistant',
          content: JSON.stringify({
            reply: 'All three of you are free Thursday evening. I\'ve sent the invite — waiting on Maya.',
            plans: [],
          }),
        },
      ],
    },
  ];

  return {
    version: 1,
    seededAt: new Date().toISOString(),
    me,
    friends,
    groups,
    calendars,
    tasks,
    pendingEvents,
    dms,
    groupMessages,
    aiConversations,
    notifications: { seen: [], dismissed: [] },
  };
}
