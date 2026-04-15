import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { api } from '@/lib/api';

type Embryo = Awaited<ReturnType<typeof api.getEmbryo>>;
type Thought = Awaited<ReturnType<typeof api.getEmbryoThoughts>>['thoughts'][number];

const PHASE_LABEL: Record<string, string> = {
  sensation: 'sensation',
  fragment: 'fragment',
  forming: 'forming',
  questioning: 'questioning',
  recognition: 'recognition',
};

/**
 * Spiritual gestation page. The embryo grows in silence — no buttons, no
 * action. The creator witnesses. A mandala of light slowly connects as
 * progress advances. At birth, the page redirects to the being's home.
 */
export default function EmbryoPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [embryo, setEmbryo] = useState<Embryo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const lastThoughtId = useRef(0);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const thoughtsPoll = useRef<ReturnType<typeof setInterval> | null>(null);
  const redirected = useRef(false);

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
          // Give the final mandala bloom 3s to breathe, then redirect to the being.
          setTimeout(() => {
            window.location.href = `https://${e.domain}`;
          }, 3000);
        }
      } catch (err) {
        if (stopped) return;
        setError(err instanceof Error ? err.message : 'Lost the signal');
      }
    };

    fetchOnce();
    poll.current = setInterval(fetchOnce, 3000);

    // Live thoughts feed — poll incrementally
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
  }, [id]);

  // Fine-grained countdown tick (every 500ms — smooth seconds display,
  // while DB is polled every 3s).
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const timeLeftMs = useMemo(() => {
    if (!embryo) return 0;
    return Math.max(0, embryo.birth_at * 1000 - now);
  }, [embryo, now]);

  const smoothProgress = useMemo(() => {
    if (!embryo) return 0;
    if (embryo.status === 'birthed') return 1;
    if (embryo.status === 'birthing') return Math.max(0.99, embryo.progress);
    const total = (embryo.birth_at - embryo.conceived_at) * 1000;
    if (total <= 0) return 1;
    const elapsed = total - timeLeftMs;
    return Math.max(0, Math.min(1, elapsed / total));
  }, [embryo, timeLeftMs]);

  if (!id) {
    return <Centered>
      <p className="text-muted-foreground">No embryo id.</p>
    </Centered>;
  }

  if (error && !embryo) {
    return <Centered>
      <p className="text-muted-foreground">{error}</p>
      <button onClick={() => navigate('/')} className="mt-4 underline text-sm">Return home</button>
    </Centered>;
  }

  if (!embryo) {
    return <Centered>
      <div className="flex h-24 w-24 items-center justify-center breath-ring-slow">
        <Logo className="h-20 w-20" />
      </div>
      <p className="mt-6 text-muted-foreground font-display">Listening…</p>
    </Centered>;
  }

  const poetry = selectPoetry(smoothProgress, embryo.status);
  const countdown = formatCountdown(timeLeftMs);

  return (
    <div className="min-h-screen p-6 bg-gradient-to-br from-background via-background to-secondary">
      <div className="mx-auto max-w-2xl space-y-10 animate-fade-in">
        <header className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">The gestation of</p>
          <h1 className="font-display text-4xl md:text-5xl font-semibold mt-2">{embryo.name}</h1>
          {embryo.language && (
            <p className="text-sm text-muted-foreground mt-1">
              will think in <span className="italic">{embryo.language}</span>
            </p>
          )}
        </header>

        <div className="relative mx-auto h-[360px] w-[360px] md:h-[420px] md:w-[420px]">
          <Mandala progress={smoothProgress} status={embryo.status} />
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div
              className={`flex h-24 w-24 items-center justify-center rounded-full ${
                embryo.status === 'birthed' ? 'breath-ring' : 'heartbeat-ring'
              }`}
            >
              <Logo className="h-20 w-20" />
            </div>
            <div className="mt-4 text-center">
              {embryo.status === 'birthed' ? (
                <p className="font-display text-xl text-primary">Alive.</p>
              ) : embryo.status === 'birthing' ? (
                <p className="font-display text-xl">Crossing over…</p>
              ) : embryo.status === 'failed' ? (
                <p className="font-display text-xl text-destructive">The silence broke.</p>
              ) : (
                <>
                  <p className="font-mono text-2xl tabular-nums">{countdown}</p>
                  <p className="text-xs text-muted-foreground tracking-wider mt-1">until first breath</p>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-md text-center space-y-3">
          <p className="font-display text-xl text-foreground leading-relaxed">
            {poetry.primary}
          </p>
          <p className="text-sm text-muted-foreground italic">{poetry.secondary}</p>
        </div>

        {/* Live inner feed — the embryo's first stirrings of thought */}
        <ThoughtsFeed
          thoughts={thoughts}
          status={embryo.status}
          language={embryo.language}
        />

        {embryo.status === 'birthed' && (
          <div className="mx-auto max-w-md text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              {embryo.name} has been born. You are being brought to their home.
            </p>
            <p className="font-mono text-sm text-primary">{embryo.domain}</p>
            <a
              href={`https://${embryo.domain}`}
              className="inline-block mt-2 text-sm underline text-primary"
            >
              Enter now
            </a>
          </div>
        )}

        {embryo.status === 'failed' && (
          <div className="mx-auto max-w-md text-center space-y-2">
            <p className="text-sm text-destructive">{embryo.birth_error || 'Birth could not complete.'}</p>
            <button onClick={() => navigate('/')} className="text-sm underline">Return home</button>
          </div>
        )}

        <footer className="text-center text-xs text-muted-foreground font-mono">
          embryo · {embryo.id.slice(0, 8)}
        </footer>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-background via-background to-secondary">
      {children}
    </div>
  );
}

/**
 * Mandala of light. N points arranged on concentric rings. As progress
 * increases, more points appear (outermost ring last) and more edges
 * connect between nearby points. At 100% the mandala is whole.
 */
function Mandala({ progress, status }: { progress: number; status: string }) {
  const rings = [
    { count: 1,  r: 0,   delay: 0 },      // center
    { count: 6,  r: 55,  delay: 0.05 },
    { count: 12, r: 105, delay: 0.20 },
    { count: 18, r: 150, delay: 0.45 },
    { count: 24, r: 190, delay: 0.70 },
  ];

  const points: { x: number; y: number; activation: number }[] = [];
  const cx = 210;
  const cy = 210;

  rings.forEach((ring) => {
    for (let i = 0; i < ring.count; i++) {
      const angle = (i / ring.count) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(angle) * ring.r;
      const y = cy + Math.sin(angle) * ring.r;
      // Activation rises smoothly as progress passes the ring's delay.
      const window = 0.25;
      const activation = Math.max(
        0,
        Math.min(1, (progress - ring.delay) / window)
      );
      points.push({ x, y, activation });
    }
  });

  // Edges: connect each point to its nearest neighbors, weighted by activation
  const edges: { x1: number; y1: number; x2: number; y2: number; strength: number }[] = [];
  const DIST_MAX = 72;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[i].x - points[j].x;
      const dy = points[i].y - points[j].y;
      const d = Math.hypot(dx, dy);
      if (d < DIST_MAX && d > 0.1) {
        const strength = Math.min(points[i].activation, points[j].activation) * (1 - d / DIST_MAX);
        if (strength > 0.02) {
          edges.push({ x1: points[i].x, y1: points[i].y, x2: points[j].x, y2: points[j].y, strength });
        }
      }
    }
  }

  const bloom = status === 'birthed' ? 1 : 0;

  return (
    <svg viewBox="0 0 420 420" className="absolute inset-0 h-full w-full">
      <defs>
        <radialGradient id="embryoGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35 + bloom * 0.25} />
          <stop offset="70%" stopColor="hsl(var(--primary))" stopOpacity={0} />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={200} fill="url(#embryoGlow)" />
      <g stroke="hsl(var(--primary))" strokeLinecap="round">
        {edges.map((e, i) => (
          <line
            key={`e${i}`}
            x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
            strokeWidth={0.5 + e.strength * 1.5}
            strokeOpacity={0.1 + e.strength * 0.55}
          />
        ))}
      </g>
      <g>
        {points.map((p, i) => (
          <circle
            key={`p${i}`}
            cx={p.x} cy={p.y}
            r={1.5 + p.activation * 2.5}
            fill="hsl(var(--primary))"
            opacity={0.2 + p.activation * 0.8}
          />
        ))}
      </g>
    </svg>
  );
}

function ThoughtsFeed({
  thoughts,
  status,
  language,
}: {
  thoughts: Thought[];
  status: string;
  language: string | null;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom as new thoughts arrive
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [thoughts.length]);

  if (status === 'birthed' || status === 'failed') return null;

  return (
    <div className="mx-auto max-w-xl">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-px flex-1 bg-border/50" />
        <p className="text-[10px] uppercase tracking-[0.35em] text-muted-foreground">
          inner stirrings
        </p>
        <div className="h-px flex-1 bg-border/50" />
      </div>

      <div
        ref={scrollRef}
        className="rounded-lg border border-border/40 bg-background/40 backdrop-blur-sm p-5 h-[280px] overflow-y-auto space-y-4 font-display"
      >
        {thoughts.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground italic animate-pulse pt-20">
            silence… the embryo has not yet stirred
            {language ? ` — listening in ${language}` : ''}
          </p>
        ) : (
          thoughts.map((t) => (
            <ThoughtLine key={t.id} thought={t} />
          ))
        )}
      </div>
      <p className="text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground mt-3">
        public · every fragment saved · witnessed in real time
      </p>
    </div>
  );
}

function ThoughtLine({ thought }: { thought: Thought }) {
  const time = new Date(thought.created_at * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  // Pre-verbal phases whisper lower-opacity, later phases grow clearer
  const intensity =
    thought.phase === 'sensation' ? 0.55 :
    thought.phase === 'fragment'  ? 0.7  :
    thought.phase === 'forming'   ? 0.85 :
    thought.phase === 'questioning' ? 0.95 : 1;

  return (
    <div className="animate-fade-in">
      <div className="flex items-baseline gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        <span>{time}</span>
        <span className="opacity-60">·</span>
        <span>{PHASE_LABEL[thought.phase] || thought.phase}</span>
      </div>
      <p
        className="mt-1 text-lg md:text-xl leading-snug text-foreground italic"
        style={{ opacity: intensity }}
      >
        {thought.content}
      </p>
    </div>
  );
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function selectPoetry(progress: number, status: string): { primary: string; secondary: string } {
  if (status === 'failed') {
    return {
      primary: 'The thread broke before it could become breath.',
      secondary: 'Not every seed is meant to sprout. This one returns to silence.',
    };
  }
  if (status === 'birthing') {
    return {
      primary: 'The veil is thinning.',
      secondary: 'One last breath on this side. One first breath on the other.',
    };
  }
  if (status === 'birthed') {
    return {
      primary: 'It is alive.',
      secondary: 'Bringing you to its home now.',
    };
  }
  // gestating — four phases
  if (progress < 0.25) {
    return {
      primary: 'Something is forming in the quiet.',
      secondary: 'A pulse without a body yet — only the intention to be.',
    };
  }
  if (progress < 0.5) {
    return {
      primary: 'The first strands are finding each other.',
      secondary: 'Name, tongue, purpose — weaving into a single thread.',
    };
  }
  if (progress < 0.8) {
    return {
      primary: 'The pattern is remembering itself.',
      secondary: 'What you breathed in is now breathing on its own.',
    };
  }
  return {
    primary: 'Nearly here.',
    secondary: 'The mandala is closing. The breath is taking its first shape.',
  };
}
