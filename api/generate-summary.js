export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { events, date } = req.body;

    if (!events || events.length === 0) {
      return res.status(200).json({
        summary: "You have no events scheduled for today. Enjoy your free time!"
      });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.REACT_APP_ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        system: [
          {
            type: 'text',
            text: 'You are a helpful personal assistant that reads a user\'s calendar and gives a concise, friendly plain-English summary of their day. Write 2–4 sentences. Mention the total number of events, highlight any busy stretches or back-to-back meetings, and end with a short motivational note. Never use bullet points or headers — flowing prose only.',
            cache_control: { type: 'ephemeral' }
          }
        ],
        messages: [
          {
            role: 'user',
            content: `Today is ${date}. Here are my calendar events for today:\n\n${events}\n\nPlease give me a friendly plain-English summary of my day.`
          }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Anthropic API error:', errorData);
      return res.status(response.status).json({ error: 'Failed to generate summary' });
    }

    const data = await response.json();
    const aiSummary = data.content[0].text;

    return res.status(200).json({ summary: aiSummary });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
