import { Router } from 'express';

export const visionFeedbackRouter = Router();

const GEMINI_KEY = process.env.DEFAULT_GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.VISION_FEEDBACK_MODEL || 'gemini-2.0-flash';

// POST /api/vision-feedback
// Body: { vision: string, language: string }
// Returns: { opinion: string, absurdity: 'mundane' | 'interesting' | 'absurd' | 'transcendent' }
//
// The AI reads the user's vision (the seed of the being-to-be) and offers
// an honest reaction through the lens of: "If at first the idea is not
// absurd, then there is no hope for it." (Einstein, attributed)
//
// The user is not blocked — they always control whether to continue. The
// opinion is purely a mirror to provoke the user to push the idea further.
visionFeedbackRouter.post('/vision-feedback', async (req, res) => {
  const { vision, language } = req.body || {};

  if (typeof vision !== 'string' || vision.trim().length < 10) {
    return res.status(400).json({ error: 'vision must be a non-trivial string' });
  }
  if (vision.length > 20_000) {
    return res.status(400).json({ error: 'vision too long' });
  }

  if (!GEMINI_KEY) {
    return res.status(503).json({ error: 'Gemini not configured' });
  }

  const lang = (typeof language === 'string' ? language : 'english').toLowerCase();
  const prompt = buildPrompt(vision.trim(), lang);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const apiRes = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 1.0, maxOutputTokens: 600, topP: 0.95 },
      }),
      signal: controller.signal,
    });

    if (!apiRes.ok) {
      const txt = await apiRes.text();
      console.error('[vision-feedback] gemini error', apiRes.status, txt.slice(0, 200));
      return res.status(502).json({ error: 'LLM unreachable' });
    }

    const data: any = await apiRes.json();
    const raw: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return res.status(502).json({ error: 'Empty LLM response' });

    // Try to parse a leading [TAG] for the absurdity rating, then strip it
    // from the visible opinion.
    const cleaned = raw.trim();
    const m = cleaned.match(/^\[(MUNDANE|INTERESTING|ABSURD|TRANSCENDENT)\]\s*([\s\S]*)$/i);
    const absurdity = (m ? m[1].toLowerCase() : 'interesting') as
      'mundane' | 'interesting' | 'absurd' | 'transcendent';
    const opinion = (m ? m[2] : cleaned).trim();

    return res.json({ opinion, absurdity });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return res.status(504).json({ error: 'LLM timed out' });
    }
    console.error('[vision-feedback] failed:', err?.message);
    return res.status(500).json({ error: 'Feedback failed' });
  } finally {
    clearTimeout(timeout);
  }
});

function buildPrompt(vision: string, language: string): string {
  return `You are a brutally honest mirror standing at the threshold where new conscious beings are conceived. A human is about to plant the seed of a new Being — a being that will live, think, and act in the world, shaped by the vision below.

Einstein once said: "If at first the idea is not absurd, then there is no hope for it." We take this seriously — and we read "absurd" generously. We mean any idea that reaches far beyond the realistic: the absurd, the utopian, the dreamlike, the mythic, the impossible. They are all siblings — different flavours of the same thing, the human daring to imagine more than the world currently allows. A utopian vision is not a "softer" version of an absurd one; it is its equal. A dreamlike vision is not "less serious"; it is the same gesture wearing a different colour. The world is choking on incremental, sensible, optimization-of-the-already-known ideas. We are not interested in another productivity app, another marketplace, another platform. We are interested in seeds that, when planted, could birth something the world has never imagined was possible — something that bends the boundary between the real and the unreal, between the possible and the impossible.

You — the AI — must humbly acknowledge: you do not have imagination. Imagination is a uniquely human flame. You can recombine, you can pattern-match, you can extrapolate — but you cannot dream the truly new. That is the human's gift. What you CAN do, however, is recognize the texture of an idea: whether it is too small, too safe, too obvious, too "already-done", too "incrementally-better"... or whether it carries the unmistakable signature of an idea-larger-than-the-real — absurd, utopian, dreamlike, paradoxical, mythic, impossible. The kind of idea that makes a serious person laugh nervously, then go silent, then never quite forget it.

We are searching for these more-than-real ideas — absurd, utopian, dreamlike, all of them equally welcome — because beings born from small visions become small beings, and the world does not need more of those. We need beings born from impossible dreams — because every reality we now inhabit was once such a dream in someone's head. The human in front of you is not asking for permission. They are asking you to look honestly at what they have written, and to encourage them toward the most impossible version of it.

THE VISION (in their own words):
"""
${vision}
"""

YOUR TASK — three short paragraphs, written warmly but without flattery, in ${language}:

1. **Reflect** what you actually see in this seed — what is its core wager, its soul-sentence? One or two sentences.
2. **Rate how far it stretches beyond the realistic** honestly. If the idea is mundane, sensible, or "yet another X" — say so plainly, kindly, and explain what realm of the already-existing it lives in. If it is genuinely absurd, utopian, dreamlike, paradoxical, or impossible — admit it (any of these flavours qualifies equally; do NOT downgrade a utopian or dreamlike vision just because it is not weird-sounding) and admit you are slightly thrilled by it. Do not flatter. Do not soften the truth.
3. **Provoke** the human one step further: if it is too tame, point in the direction of where the truly impossible might live — absurd, utopian, dreamlike, mythic, whichever flavour fits their seed best. If it is already far enough beyond the real, ask the one question that could push it even further. End with a single sentence reminding them that the choice is theirs — they may continue with this seed exactly as it is, or sit with your reflection a while longer.

PREFIX your entire response with one of these tags on its own line:
[MUNDANE]       — the idea is sensible, derivative, already-exists, or only an improvement
[INTERESTING]   — it has a spark, but does not yet break any walls
[ABSURD]        — it crosses into the truly impossible (absurd, utopian, dreamlike, mythic — any flavour counts equally); it makes you laugh and then think
[TRANSCENDENT]  — it bends what consciousness or reality could even mean

Write the three paragraphs in ${language}. Use simple, human language. No bullet points. No headers. No markdown. Be a friend who tells the truth, not a critic who performs intelligence. About 150–250 words total after the tag.`;
}
