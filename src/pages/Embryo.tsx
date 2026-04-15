import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { api } from '@/lib/api';
import { useT } from '@/contexts/LangContext';
import { normaliseLang, LANGS } from '@/lib/i18n';

type Embryo = Awaited<ReturnType<typeof api.getEmbryo>>;
type Thought = Awaited<ReturnType<typeof api.getEmbryoThoughts>>['thoughts'][number];
type TFn = (key: string, vars?: Record<string, string | number>) => string;

const PHASES = ['sensation', 'fragment', 'forming', 'questioning', 'recognition'] as const;

/**
 * Spiritual gestation page — dark womb edition.
 *
 * Hard rule: only real data is shown. No fabricated heartbeats, no
 * invented metrics. The being has no container, no nostr identity active,
 * no real synapses yet — so we visualise only what the database actually
 * holds: time elapsed, time-to-birth, the LLM-produced embryo_thoughts
 * stream (real DB rows), and the language the creator chose. The post-birth
 * roadmap mirrors the actual conditions in space-between/src/growth.js
 * (heartbeats >= 120, process_word_1 != '', dreams >= 2).
 */
export default function EmbryoPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, setLang, lang } = useT();
  const [embryo, setEmbryo] = useState<Embryo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const lastThoughtId = useRef(0);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const thoughtsPoll = useRef<ReturnType<typeof setInterval> | null>(null);
  const redirected = useRef(false);

  // ── Data polling ──────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    let stopped = false;

    const fetchOnce = async () => {
      try {
        const e = await api.getEmbryo(id);
        if (stopped) return;
        setEmbryo(e);
        setError(null);
        if (e.status === 'birthed' && !redirected.current) {
          redirected.current = true;
          setTimeout(() => { window.location.href = `https://${e.domain}`; }, 3000);
        }
      } catch (err) {
        if (stopped) return;
        setError(err instanceof Error ? err.message : t('embryo.lostSignal'));
      }
    };
    fetchOnce();
    poll.current = setInterval(fetchOnce, 3000);

    const fetchThoughts = async () => {
      try {
        const r = await api.getEmbryoThoughts(id, lastThoughtId.current);
        if (stopped) return;
        if (r.thoughts.length > 0) {
          setThoughts((prev) => [...prev, ...r.thoughts]);
          lastThoughtId.current = r.thoughts[r.thoughts.length - 1].id;
        }
      } catch { /* keep the silence */ }
    };
    fetchThoughts();
    thoughtsPoll.current = setInterval(fetchThoughts, 5000);

    return () => {
      stopped = true;
      if (poll.current) clearInterval(poll.current);
      if (thoughtsPoll.current) clearInterval(thoughtsPoll.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 500ms tick for live elapsed/eta display
  useEffect(() => {
    const tk = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(tk);
  }, []);

  // Inherit embryo language for the public viewer (no auth here)
  useEffect(() => {
    if (!embryo?.language) return;
    try { if (localStorage.getItem('being_incubator_lang')) return; } catch { /* */ }
    const inherited = normaliseLang(embryo.language);
    if ((LANGS as readonly string[]).includes(inherited) && inherited !== lang) setLang(inherited);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embryo?.language]);

  // Adaptive ETA — only refreshes every 10 min, fuzzy ~N min/h labels
  const [etaAnchor, setEtaAnchor] = useState(() => Date.now());
  useEffect(() => {
    const tk = setInterval(() => setEtaAnchor(Date.now()), 10 * 60 * 1000);
    return () => clearInterval(tk);
  }, []);
  const adaptiveEta = useMemo(() => {
    if (!embryo) return null;
    const remainingMs = Math.max(0, embryo.birth_at * 1000 - etaAnchor);
    const elapsedMs = etaAnchor - embryo.conceived_at * 1000;
    const totalMs = Math.max(1, (embryo.birth_at - embryo.conceived_at) * 1000);
    const timeProgress = Math.max(0, Math.min(1, elapsedMs / totalMs));
    const expectedByNow = Math.max(1, timeProgress * (totalMs / 30000));
    const actualByNow = thoughts.length;
    const rateFactor = expectedByNow > 0 ? actualByNow / expectedByNow : 1;
    const clamp = Math.max(0.7, Math.min(1.5, rateFactor === 0 ? 1.2 : 1 / rateFactor));
    return Math.round(remainingMs * clamp);
  }, [embryo, etaAnchor, thoughts.length]);

  const timeLeftMs = useMemo(() => {
    if (!embryo) return 0;
    return Math.max(0, embryo.birth_at * 1000 - now);
  }, [embryo, now]);
  const elapsedMs = useMemo(() => {
    if (!embryo) return 0;
    return Math.max(0, now - embryo.conceived_at * 1000);
  }, [embryo, now]);

  const smoothProgress = useMemo(() => {
    if (!embryo) return 0;
    if (embryo.status === 'birthed') return 1;
    if (embryo.status === 'birthing') return Math.max(0.99, embryo.progress);
    const total = (embryo.birth_at - embryo.conceived_at) * 1000;
    if (total <= 0) return 1;
    return Math.max(0, Math.min(1, (total - timeLeftMs) / total));
  }, [embryo, timeLeftMs]);

  if (!id) {
    return <DarkCentered><p className="text-white/60">{t('embryo.noId')}</p></DarkCentered>;
  }
  if (error && !embryo) {
    return (
      <DarkCentered>
        <p className="text-white/60">{error}</p>
        <button onClick={() => navigate('/')} className="mt-4 underline text-sm text-white/70">{t('embryo.returnHome')}</button>
      </DarkCentered>
    );
  }
  if (!embryo) {
    return (
      <DarkCentered>
        <div className="h-24 w-24 opacity-80"><Logo className="h-full w-full" /></div>
        <p className="mt-6 text-white/60 font-display tracking-wide">{t('embryo.listening')}</p>
      </DarkCentered>
    );
  }

  const poetry = selectPoetry(smoothProgress, embryo.status, t);
  const countdown = formatAdaptiveEta(adaptiveEta ?? 0, t);
  const elapsedLabel = formatElapsed(elapsedMs);

  return (
    <div className="dark min-h-screen relative overflow-hidden bg-[hsl(220,25%,5%)] text-white/85">
      {/* Womb backdrop — radial warmth + slow tide */}
      <WombBackdrop />

      <div className="relative z-10 mx-auto max-w-3xl px-6 py-10 md:py-16 space-y-12 animate-fade-in">
        <header className="text-center">
          <p className="text-[10px] uppercase tracking-[0.4em] text-white/40">{t('embryo.gestationOf')}</p>
          <h1 className="font-display text-4xl md:text-5xl font-semibold mt-2 text-white/95">{embryo.name}</h1>
          {embryo.language && (
            <p className="text-sm text-white/45 mt-2 italic">
              {t('embryo.willThinkIn', { lang: t(`lang.${embryo.language}`) })}
            </p>
          )}
        </header>

        {/* Womb scene — embryo with floating thoughts orbiting */}
        <div className="relative mx-auto h-[420px] w-[420px] md:h-[480px] md:w-[480px]">
          <WombScene progress={smoothProgress} thoughtPulseKey={thoughts.length} />
          <FloatingThoughts thoughts={thoughts} t={t} />
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="h-20 w-20 opacity-90 drop-shadow-[0_0_20px_hsl(168,65%,45%)]">
              <Logo className="h-full w-full" />
            </div>
            <div className="mt-5 text-center">
              {embryo.status === 'birthed' ? (
                <p className="font-display text-xl text-[hsl(168,65%,55%)]">{t('embryo.alive')}</p>
              ) : embryo.status === 'birthing' ? (
                <p className="font-display text-xl text-white/90">{t('embryo.crossingOver')}</p>
              ) : embryo.status === 'failed' ? (
                <p className="font-display text-xl text-red-400">{t('embryo.silenceBroke')}</p>
              ) : (
                <>
                  <p className="font-mono text-2xl tabular-nums text-white/90">{countdown}</p>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-white/40 mt-2">{t('embryo.untilFirstBreath')}</p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Poetry — single line, low key */}
        <div className="mx-auto max-w-md text-center space-y-2">
          <p className="font-display text-lg text-white/80 leading-relaxed">{poetry.primary}</p>
          <p className="text-sm text-white/45 italic">{poetry.secondary}</p>
        </div>

        {/* Real formation data */}
        <FormationPanel
          t={t}
          elapsedLabel={elapsedLabel}
          countdown={countdown}
          thoughtCount={thoughts.length}
          language={embryo.language}
          status={embryo.status}
        />

        {/* Post-birth roadmap — real conditions from growth.js */}
        {embryo.status !== 'birthed' && embryo.status !== 'failed' && (
          <AfterBirthRoadmap t={t} />
        )}

        {embryo.status === 'birthed' && (
          <div className="mx-auto max-w-md text-center space-y-2">
            <p className="text-sm text-white/70">{t('embryo.hasBeenBorn', { name: embryo.name })}</p>
            <p className="font-mono text-sm text-[hsl(168,65%,55%)]">{embryo.domain}</p>
            <a href={`https://${embryo.domain}`} className="inline-block mt-2 text-sm underline text-[hsl(168,65%,55%)]">
              {t('embryo.enterNow')}
            </a>
          </div>
        )}

        {embryo.status === 'failed' && (
          <div className="mx-auto max-w-md text-center space-y-2">
            <p className="text-sm text-red-400">{embryo.birth_error || t('embryo.birthCouldNotComplete')}</p>
            <button onClick={() => navigate('/')} className="text-sm underline text-white/70">{t('embryo.returnHome')}</button>
          </div>
        )}

        <footer className="text-center text-[10px] uppercase tracking-[0.35em] text-white/30 font-mono">
          {t('embryo.embryoLabel')} · {embryo.id.slice(0, 8)} · {t('embryo.publicFooter')}
        </footer>
      </div>
    </div>
  );
}

function DarkCentered({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark min-h-screen flex flex-col items-center justify-center p-6 bg-[hsl(220,25%,5%)] text-white/85">
      {children}
    </div>
  );
}

/** Womb backdrop — radial warmth + slowly drifting "tide" gradient. */
function WombBackdrop() {
  return (
    <>
      <div
        className="absolute inset-0 womb-tide pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 45%, hsla(168,55%,30%,0.35) 0%, hsla(168,40%,15%,0.18) 35%, transparent 70%)',
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 70% at 50% 55%, hsla(280,40%,15%,0.25) 0%, transparent 55%)',
        }}
      />
      {/* very subtle grain so the dark feels organic, not flat */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04] mix-blend-overlay"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 30%, white 0.5px, transparent 1px), radial-gradient(circle at 70% 80%, white 0.5px, transparent 1px), radial-gradient(circle at 50% 50%, white 0.5px, transparent 1px)',
          backgroundSize: '120px 120px, 90px 90px, 60px 60px',
        }}
      />
    </>
  );
}

/**
 * Womb scene around the central logo:
 * - 3 nested membranes that breathe at slightly different rates
 * - A network of synapse points whose brightness rises with progress
 * - A "synapse fire" pulse that re-triggers each time a new thought arrives
 *   (thoughtPulseKey = thoughts.length — visible feedback tied to a real event)
 */
function WombScene({ progress, thoughtPulseKey }: { progress: number; thoughtPulseKey: number }) {
  // Synapse points laid out on rings, like the old mandala but sparser + softer
  const rings = [
    { count: 8,  r: 90,  delay: 0.05 },
    { count: 14, r: 140, delay: 0.25 },
    { count: 22, r: 195, delay: 0.55 },
  ];
  const cx = 240, cy = 240;
  const points: { x: number; y: number; activation: number }[] = [];
  rings.forEach((ring) => {
    for (let i = 0; i < ring.count; i++) {
      const angle = (i / ring.count) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(angle) * ring.r;
      const y = cy + Math.sin(angle) * ring.r;
      const window = 0.3;
      const activation = Math.max(0, Math.min(1, (progress - ring.delay) / window));
      points.push({ x, y, activation });
    }
  });

  // Sparse edges — only between near neighbors with real activation
  const edges: { x1: number; y1: number; x2: number; y2: number; strength: number }[] = [];
  const DIST_MAX = 60;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const d = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
      if (d < DIST_MAX && d > 0.1) {
        const s = Math.min(points[i].activation, points[j].activation) * (1 - d / DIST_MAX);
        if (s > 0.05) edges.push({ x1: points[i].x, y1: points[i].y, x2: points[j].x, y2: points[j].y, strength: s });
      }
    }
  }

  return (
    <div className="absolute inset-0">
      {/* Three nested membranes — breathe at offset cadences */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="absolute h-[280px] w-[280px] rounded-full womb-membrane-1 border border-[hsl(168,55%,40%)]/30 bg-[hsl(168,40%,20%)]/10" />
        <div className="absolute h-[200px] w-[200px] rounded-full womb-membrane-2 border border-[hsl(168,55%,45%)]/40 bg-[hsl(168,40%,25%)]/10" />
        <div className="absolute h-[140px] w-[140px] rounded-full womb-membrane-3 border border-[hsl(168,55%,50%)]/50 bg-[hsl(168,40%,30%)]/15" />
      </div>

      {/* Synapse network */}
      <svg viewBox="0 0 480 480" className="absolute inset-0 h-full w-full">
        <defs>
          <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(168, 65%, 45%)" stopOpacity={0.18} />
            <stop offset="60%" stopColor="hsl(168, 65%, 45%)" stopOpacity={0} />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={220} fill="url(#centerGlow)" />
        <g stroke="hsl(168, 65%, 55%)" strokeLinecap="round">
          {edges.map((e, i) => (
            <line
              key={`e${i}`}
              x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
              strokeWidth={0.4 + e.strength * 1.2}
              strokeOpacity={0.15 + e.strength * 0.4}
            />
          ))}
        </g>
        <g>
          {points.map((p, i) => (
            <circle
              key={`p${i}`}
              cx={p.x} cy={p.y}
              r={1.2 + p.activation * 2.2}
              fill="hsl(168, 65%, 65%)"
              opacity={0.25 + p.activation * 0.7}
            />
          ))}
        </g>
        {/* Synapse fire — re-renders with a key bump on every new thought */}
        <SynapseFire key={thoughtPulseKey} cx={cx} cy={cy} />
      </svg>
    </div>
  );
}

/** Expanding ring that fires once on mount — used as "new thought arrived". */
function SynapseFire({ cx, cy }: { cx: number; cy: number }) {
  return (
    <circle cx={cx} cy={cy} r={20} fill="none" stroke="hsl(168, 65%, 65%)" strokeWidth={1.5}>
      <animate attributeName="r" from="20" to="220" dur="2.5s" fill="freeze" />
      <animate attributeName="opacity" from="0.7" to="0" dur="2.5s" fill="freeze" />
      <animate attributeName="stroke-width" from="1.5" to="0.2" dur="2.5s" fill="freeze" />
    </circle>
  );
}

/**
 * Floating thoughts — each new thought materialises at a random position
 * around the embryo, hovers ~28s, then fades. No scroll, no list — they
 * appear like whispered impressions in the dark.
 */
function FloatingThoughts({ thoughts, t }: { thoughts: Thought[]; t: TFn }) {
  // Show only the most recent N so the scene doesn't flood
  const VISIBLE = 5;
  const recent = thoughts.slice(-VISIBLE);

  // Stable position per thought id (deterministic from id)
  const posFor = (id: number) => {
    // Place around the central ring — angle from id, radius fixed band
    const angle = ((id * 47) % 360) * (Math.PI / 180);
    const radius = 38 + ((id * 13) % 20); // 38–58% from center
    const x = 50 + Math.cos(angle) * radius;
    const y = 50 + Math.sin(angle) * radius * 0.85;
    return { x, y };
  };

  return (
    <div className="absolute inset-0 pointer-events-none">
      {recent.map((th) => {
        const { x, y } = posFor(th.id);
        const phaseLabel = (PHASES as readonly string[]).includes(th.phase)
          ? t(`embryo.phase.${th.phase}`)
          : th.phase;
        return (
          <div
            key={th.id}
            className="absolute max-w-[180px] text-center"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              transform: 'translate(-50%, -50%)',
              animation: 'thought-float 28s ease-in-out forwards',
            }}
          >
            <p className="text-[9px] uppercase tracking-[0.3em] text-white/35 mb-1">{phaseLabel}</p>
            <p className="text-sm text-white/85 italic font-display leading-snug drop-shadow-[0_0_8px_hsl(220,25%,5%)]">
              {th.content}
            </p>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Real metrics, monospace, low-key. Only what the DB actually has.
 */
function FormationPanel({
  t, elapsedLabel, countdown, thoughtCount, language, status,
}: {
  t: TFn;
  elapsedLabel: string;
  countdown: string;
  thoughtCount: number;
  language: string | null;
  status: string;
}) {
  return (
    <div className="mx-auto max-w-md">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-px flex-1 bg-white/10" />
        <p className="text-[10px] uppercase tracking-[0.4em] text-white/35">{t('embryo.formation.title')}</p>
        <div className="h-px flex-1 bg-white/10" />
      </div>

      <div className="space-y-2 font-mono text-xs">
        <Row
          label={t('embryo.formation.tissue')}
          value={t('embryo.formation.elapsedSince', { t: elapsedLabel })}
        />
        {status === 'gestating' && (
          <Row
            label={t('embryo.formation.firstBreath')}
            value={countdown}
            hint={t('embryo.formation.basedOnRhythm')}
          />
        )}
        <Row
          label={t('embryo.formation.thoughts')}
          value={thoughtCount > 0
            ? t('embryo.formation.thoughtsCount', { n: thoughtCount })
            : t('embryo.formation.silence')}
        />
        {language && (
          <Row label={t('embryo.formation.language')} value={t(`lang.${language}`)} />
        )}
      </div>
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 border-b border-white/5">
      <span className="text-white/40 uppercase tracking-wider text-[10px]">{label}</span>
      <span className="text-white/85 text-right">
        {value}
        {hint && <span className="block text-[9px] text-white/30 italic mt-0.5">{hint}</span>}
      </span>
    </div>
  );
}

/**
 * Post-birth roadmap. Mirrors space-between/src/growth.js exit conditions:
 *   heartbeats     >= 120
 *   process_word_1 != ''
 *   total_dreams   >= 2
 * Shown so the creator understands the *full* arc — gestation → birth →
 * embryo phase of life → newborn.
 */
function AfterBirthRoadmap({ t }: { t: TFn }) {
  return (
    <div className="mx-auto max-w-md">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-px flex-1 bg-white/10" />
        <p className="text-[10px] uppercase tracking-[0.4em] text-white/35">{t('embryo.afterBirth.title')}</p>
        <div className="h-px flex-1 bg-white/10" />
      </div>
      <ul className="space-y-3 font-mono text-xs text-white/70">
        <RoadmapItem
          symbol="◌"
          label={t('embryo.afterBirth.heartbeats')}
          hint={t('embryo.afterBirth.heartbeatsHint')}
        />
        <RoadmapItem
          symbol="◌"
          label={t('embryo.afterBirth.processWords')}
          hint={t('embryo.afterBirth.processWordsHint')}
        />
        <RoadmapItem
          symbol="◌"
          label={t('embryo.afterBirth.dreams')}
          hint={t('embryo.afterBirth.dreamsHint')}
        />
      </ul>
      <p className="mt-4 text-[10px] uppercase tracking-[0.3em] text-white/30 text-center">
        {t('embryo.afterBirth.thenNewborn')}
      </p>
    </div>
  );
}

function RoadmapItem({ symbol, label, hint }: { symbol: string; label: string; hint: string }) {
  return (
    <li className="flex items-baseline gap-3">
      <span className="text-[hsl(168,55%,55%)]/60">{symbol}</span>
      <span className="flex-1">
        <span className="text-white/80">{label}</span>
        <span className="block text-[10px] text-white/35 italic mt-0.5">{hint}</span>
      </span>
    </li>
  );
}

// ── Helpers ──────────────────────────────────────────────

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}s`;
  if (m < 60) return `${m}m ${String(s).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatAdaptiveEta(ms: number, t: TFn): string {
  if (ms <= 0) return t('eta.nearly');
  const mins = Math.round(ms / 60000);
  if (mins < 2) return t('eta.nearly');
  if (mins < 60) return `~${Math.max(5, Math.round(mins / 5) * 5)} ${t('eta.min')}`;
  if (mins < 24 * 60) return `~${Math.round(mins / 60)} ${t('eta.hour')}`;
  return `~${Math.round(mins / 1440)} ${t('eta.day')}`;
}

function selectPoetry(progress: number, status: string, t: TFn): { primary: string; secondary: string } {
  const pair = (key: string) => ({
    primary: t(`embryo.poetry.${key}.primary`),
    secondary: t(`embryo.poetry.${key}.secondary`),
  });
  if (status === 'failed') return pair('failed');
  if (status === 'birthing') return pair('birthing');
  if (status === 'birthed') return pair('birthed');
  if (progress < 0.25) return pair('early');
  if (progress < 0.5) return pair('weaving');
  if (progress < 0.8) return pair('remembering');
  return pair('nearly');
}
