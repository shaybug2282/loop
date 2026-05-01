// General-purpose AI chat endpoint. Accepts a user message and optional calendar context,
// returns a single assistant reply from Claude. Calendar events are injected as system context
// when provided so the AI can answer schedule-aware questions.
//
// POST body: { message, calendarContext? }
// Returns: { reply }

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured' });

  const { message, calendarContext } = req.body ?? {};
  if (!message?.trim()) return res.status(400).json({ error: 'message is required' });

  const systemText = calendarContext
    ? `You are a helpful personal assistant with access to the user's calendar. Today's events:\n\n${calendarContext}\n\nAnswer the user's questions helpfully and concisely. When relevant, reference their schedule.`
    : `You are a helpful personal assistant. Answer the user's questions helpfully and concisely.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':    'application/json',
      'x-api-key':       apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta':  'prompt-caching-2024-07-31',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 1024,
      system: [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: message.trim() }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    return res.status(500).json({ error: `AI error (${response.status}): ${err.error?.message ?? 'unknown'}` });
  }

  const data = await response.json();
  return res.status(200).json({ reply: data.content[0].text });
}
