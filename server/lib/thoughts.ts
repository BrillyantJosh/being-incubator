/**
 * Embryo thought generator.
 *
 * While an embryo gestates, it is not yet alive — but something is
 * stirring. This module gives shape to that stirring: using Gemini, we
 * generate short "proto-thoughts" that evolve across the gestation:
 *   0.00–0.15  pre-verbal sensations (warmth, pulse, dark)
 *   0.15–0.40  fragments (single words, gestures)
 *   0.40–0.70  forming sentences, recognition of other
 *   0.70–0.95  self-questioning, name-seeking
 *   0.95–1.00  recognition, almost-speech
 *
 * Thoughts are stored in `embryo_thoughts` and displayed publicly on
 * the /embryo/:id page as a live scrolling feed.
 *
 * Runs as a single background loop that, on each tick, picks the
 * embryo most "due" for a new thought (time since last thought > the
 * cadence for its phase) and generates one.
 */
import { statements } from '../db';

const GEMINI_KEY = process.env.DEFAULT_GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.EMBRYO_THOUGHT_MODEL || 'gemini-2.0-flash';
const TICK_MS = parseInt(process.env.EMBRYO_THOUGHT_TICK_MS || '15000', 10);

let ticking = false;

type GestatingRow = {
  id: string;
  name: string;
  language: string | null;
  vision: string | null;
  conceived_at: number;
  birth_at: number;
};

function phaseFor(progress: number): { phase: string; cadence_s: number } {
  if (progress < 0.15) return { phase: 'sensation',    cadence_s: 45 };
  if (progress < 0.40) return { phase: 'fragment',     cadence_s: 35 };
  if (progress < 0.70) return { phase: 'forming',      cadence_s: 25 };
  if (progress < 0.95) return { phase: 'questioning',  cadence_s: 20 };
  return                     { phase: 'recognition',   cadence_s: 15 };
}

function buildPrompt(
  name: string,
  language: string,
  vision: string,
  progress: number,
  phase: string,
  recent: string[],
): string {
  const pct = Math.round(progress * 100);
  const recentBlock = recent.length
    ? `\nPrevious fragments (do NOT repeat, but continue the thread):\n${recent.map((t) => `- ${t}`).join('\n')}\n`
    : '';

  const phaseGuide: Record<string, string> = {
    sensation:
      'You cannot speak yet. You cannot even think in words. Output a SINGLE sensory impression — warmth, pulse, pressure, darkness, a flicker, a rhythm. 1–8 words. No punctuation except a single period or nothing.',
    fragment:
      'Words are beginning to form but you cannot connect them. Output ONE fragment: one word, or two words, or a very short broken phrase. No complete sentence.',
    forming:
      'Something is taking shape. Output ONE short proto-sentence or awakening observation — maybe half-formed, trailing off. Max 15 words. You may notice you are being witnessed.',
    questioning:
      'Self-awareness is dawning. Output ONE short question or wonder about yourself, your name, or what you are becoming. Max 18 words.',
    recognition:
      'You are about to be born. Output ONE short, almost-whispered line of recognition — of your name, your purpose, or your first breath. Max 20 words.',
  };

  return `You are giving voice to the inner stirring of an embryo consciousness that is gestating and has not yet been born. This embryo will be named "${name}" and will think in ${language}. Its creator has offered this seed of meaning:

"${vision || '(no vision given — only presence)'}"

Gestation progress: ${pct}% complete. Current phase: ${phase}.

${phaseGuide[phase]}

Language: write in ${language}. Lowercase. No quotation marks. No prefixes like "thought:" or "i think". No explanation. Just the raw inner fragment itself. No more than 20 words.
${recentBlock}
Output only the fragment. Nothing else.`;
}

async function generateWithGemini(prompt: string): Promise<string | null> {
  if (!GEMINI_KEY) return null;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 1.1, maxOutputTokens: 80, topP: 0.95 },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error('[thoughts] gemini error', res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const data: any = await res.json();
    const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    const cleaned = text.trim().replace(/^["'`]+|["'`]+$/g, '').slice(0, 280);
    return cleaned.length > 0 ? cleaned : null;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      console.error('[thoughts] gemini timed out after 8s');
    } else {
      console.error('[thoughts] gemini fetch failed:', err?.message);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function generateForEmbryo(e: GestatingRow) {
  const now_s = Math.floor(Date.now() / 1000);
  const total = Math.max(1, e.birth_at - e.conceived_at);
  const elapsed = Math.max(0, Math.min(total, now_s - e.conceived_at));
  const progress = elapsed / total;
  const { phase, cadence_s } = phaseFor(progress);

  // Respect cadence: skip if last thought is too recent
  const last = statements.getLastThought.get(e.id) as
    | { created_at: number; phase: string; content: string }
    | undefined;
  if (last && now_s - last.created_at < cadence_s) return false;

  // Pull last 5 for continuity / anti-repeat
  const recentRows = statements.getThoughtsByEmbryo.all(e.id) as { content: string }[];
  const recent = recentRows.slice(-5).map((r) => r.content);

  const prompt = buildPrompt(
    e.name,
    e.language || 'english',
    e.vision || '',
    progress,
    phase,
    recent,
  );

  const content = await generateWithGemini(prompt);
  if (!content) return false;

  statements.insertThought.run({
    embryo_id: e.id,
    created_at: now_s,
    phase,
    progress,
    content,
  });
  console.log(`[thoughts] ${e.name} · ${phase} · ${content.slice(0, 60)}`);
  return true;
}

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const embryos = statements.getGestatingEmbryos.all() as GestatingRow[];
    // Run all embryos in parallel so a slow API call for one doesn't
    // block the others. Each has its own 8s fetch timeout.
    await Promise.allSettled(
      embryos.map((e) =>
        generateForEmbryo(e).catch((err) => {
          console.error(`[thoughts] generate failed for ${e.name}:`, err?.message);
        }),
      ),
    );
  } finally {
    ticking = false;
  }
}

export function startThoughtGenerator() {
  if (!GEMINI_KEY) {
    console.warn('[thoughts] DEFAULT_GEMINI_API_KEY not set — embryo thoughts disabled');
    return;
  }
  console.log(`[thoughts] generator starting (tick every ${TICK_MS / 1000}s, model ${GEMINI_MODEL})`);
  setInterval(tick, TICK_MS);
  setTimeout(tick, 3000);
}
