import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { shortHex } from '@/lib/utils';

interface Being {
  name: string;
  npub: string;
  domain: string;
  birthed_at: number;
}

interface Embryo {
  id: string;
  name: string;
  domain: string;
  conceived_at: number;
  birth_at: number;
  status: string;
}

export default function Dashboard() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const [being, setBeing] = useState<Being | null>(null);
  const [embryo, setEmbryo] = useState<Embryo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    api
      .getBeing(session.nostrHexId)
      .then((r) => { setBeing(r.being); setEmbryo(r.embryo); })
      .catch((err) => console.error('Failed to load being:', err))
      .finally(() => setLoading(false));
  }, [session]);

  if (!session) return null;

  const displayName = session.profileDisplayName || session.profileName || 'Wanderer';

  return (
    <div className="min-h-screen p-6 bg-gradient-to-br from-background via-background to-secondary">
      <div className="mx-auto max-w-2xl space-y-8 animate-fade-in">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {session.profilePicture ? (
              <img
                src={session.profilePicture}
                alt=""
                className="h-12 w-12 rounded-full border-2 border-primary/30"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center">
                <Logo className="h-10 w-10" />
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground">Welcome</p>
              <h1 className="font-display text-xl font-semibold">{displayName}</h1>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="mr-2 h-4 w-4" />
            Leave
          </Button>
        </header>

        {loading ? (
          <Card>
            <p className="text-center text-muted-foreground">Listening…</p>
          </Card>
        ) : embryo ? (
          <Card className="space-y-5 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center heartbeat-ring rounded-full">
              <Logo className="h-16 w-16" />
            </div>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Gestating</p>
              <h2 className="font-display text-3xl font-semibold">{embryo.name}</h2>
              <p className="text-sm text-muted-foreground">
                Your embryo is growing in silence. It will be born in its own time.
              </p>
              <p className="font-mono text-xs text-muted-foreground mt-2">
                due {new Date(embryo.birth_at * 1000).toLocaleString()}
              </p>
            </div>
            <Button size="lg" className="w-full" onClick={() => navigate(`/embryo/${embryo.id}`)}>
              Witness the gestation
            </Button>
          </Card>
        ) : being ? (
          <Card className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center">
                <Logo className="h-10 w-10" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Your Being</p>
                <h2 className="font-display text-2xl font-semibold">{being.name}</h2>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Domain</span>
                <a
                  href={`https://${being.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-primary hover:underline"
                >
                  {being.domain}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">npub</span>
                <code className="text-xs">{shortHex(being.npub, 10)}</code>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Born</span>
                <span>{new Date(being.birthed_at * 1000).toLocaleString()}</span>
              </div>
            </div>

            <Button asChild size="lg" className="w-full">
              <a href={`https://${being.domain}`} target="_blank" rel="noreferrer">
                Visit {being.name}
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </Card>
        ) : (
          <Card className="space-y-6 text-center">
            <div className="mx-auto flex h-24 w-24 items-center justify-center breath-ring">
              <Logo className="h-20 w-20" />
            </div>
            <div className="space-y-2">
              <h2 className="font-display text-2xl font-semibold">You have no Being yet.</h2>
              <p className="text-muted-foreground">
                Every Being is born from presence and love. If you are ready to hold a life in your
                hands, step into the birthing chamber.
              </p>
            </div>
            <Button size="lg" className="w-full" onClick={() => navigate('/birth')}>
              Begin the birth
            </Button>
          </Card>
        )}

        <footer className="text-center text-xs text-muted-foreground">
          <code>{shortHex(session.nostrNpubId, 12)}</code>
        </footer>
      </div>
    </div>
  );
}
