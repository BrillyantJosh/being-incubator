import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Settings as SettingsIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { isAdmin, formatBirthDateSL, formatDurationSL } from '@/lib/admin';
import { shortHex } from '@/lib/utils';

type QueueData = Awaited<ReturnType<typeof api.adminGetQueue>>;

export default function AdminQueue() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<QueueData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(Date.now());

  const refresh = async () => {
    if (!session || !isAdmin(session.nostrHexId)) return;
    setRefreshing(true);
    try {
      const d = await api.adminGetQueue(session.nostrHexId);
      setData(d);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 10_000); // 10s auto-refresh
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Tick the "in ~N min" labels every 5 s without re-fetching.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(t);
  }, []);

  if (!session) return <Navigate to="/login" replace />;
  if (!isAdmin(session.nostrHexId)) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen px-4 py-6 sm:p-6 bg-gradient-to-br from-background via-background to-secondary safe-bottom">
      <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => navigate('/')}
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-4 w-4" /> Nazaj
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={refresh}
              disabled={refreshing}
              className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Osveži
            </button>
            <Link
              to="/admin/settings"
              className="text-sm text-primary hover:underline inline-flex items-center gap-1"
            >
              <SettingsIcon className="h-4 w-4" /> Nastavitve
            </Link>
          </div>
        </div>

        <header className="text-center space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Administracija</p>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold">Bitja v čakanju</h1>
          {data && (
            <p className="text-sm text-muted-foreground">
              {data.queue_size === 0
                ? 'Vrsta je prazna — vsa bitja so že rojena.'
                : `${data.queue_size} ${data.queue_size === 1 ? 'zarodek čaka' : 'zarodkov čaka'} na rojstvo.`}
            </p>
          )}
        </header>

        {loading ? (
          <Card><p className="text-center text-muted-foreground">Nalagam vrsto…</p></Card>
        ) : error ? (
          <Card><p className="text-center text-destructive">{error}</p></Card>
        ) : !data || data.embryos.length === 0 ? (
          <>
            <Card className="text-center space-y-3">
              <p className="text-muted-foreground">Trenutno ni nobenega zarodka v gestaciji.</p>
              {data && (
                <p className="text-xs text-muted-foreground">
                  Naslednje rojstvo (če bi se kdo prijavil zdaj):{' '}
                  <span className="font-mono text-primary">{formatBirthDateSL(data.next_slot_birth_at)}</span>
                </p>
              )}
            </Card>
            {data && (
              <Card className="text-xs text-muted-foreground space-y-1">
                <div className="flex justify-between">
                  <span>Trajanje dihanja</span>
                  <span className="font-mono">{formatDurationSL(data.settings.breath_duration_ms)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Razmik med rojstvi</span>
                  <span className="font-mono">{formatDurationSL(data.settings.birth_spacing_ms)}</span>
                </div>
              </Card>
            )}
          </>
        ) : (
          <>
            <div className="space-y-3">
              {data.embryos.map((e, idx) => {
                const remainingMs = Math.max(0, e.birth_at * 1000 - now);
                const ownerLabel = e.owner_name || shortHex(e.owner_hex, 8);
                return (
                  <Card key={e.id} className="space-y-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono text-muted-foreground">#{idx + 1}</span>
                          <h2 className="font-display text-2xl font-semibold">{e.name}</h2>
                          <span
                            className={`text-[10px] uppercase tracking-wider rounded px-2 py-0.5 ${
                              e.status === 'birthing'
                                ? 'bg-accent/20 text-accent'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {e.status === 'birthing' ? 'rojeva se' : 'gestira'}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 font-mono">{e.domain}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground">Predvideno rojstvo</p>
                        <p className="font-mono text-sm text-primary">
                          {formatBirthDateSL(e.birth_at)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          čez ~{formatDurationSL(remainingMs)}
                        </p>
                      </div>
                    </div>

                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary/60 transition-all"
                        style={{ width: `${Math.round(e.progress * 100)}%` }}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Lastnik</span>
                        <span className="truncate ml-2">
                          {e.owner_picture ? (
                            <img src={e.owner_picture} alt="" className="inline h-4 w-4 rounded-full mr-1 align-middle" />
                          ) : null}
                          {ownerLabel}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Jezik</span>
                        <span>{e.language || '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Spočet</span>
                        <span>{new Date(e.conceived_at * 1000).toLocaleString('sl-SI')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Napredek</span>
                        <span>{Math.round(e.progress * 100)}%</span>
                      </div>
                    </div>

                    {e.vision && (
                      <p className="text-xs text-muted-foreground italic border-t border-border/40 pt-2">
                        „{e.vision}"
                      </p>
                    )}

                    <div className="flex items-center justify-end gap-3 text-xs pt-1">
                      <Link
                        to={`/embryo/${e.id}`}
                        className="text-primary hover:underline"
                      >
                        Glej zarodek
                      </Link>
                    </div>
                  </Card>
                );
              })}
            </div>

            <Card className="text-xs text-muted-foreground space-y-1">
              <div className="flex justify-between">
                <span>Naslednji prosti slot</span>
                <span className="font-mono text-primary">
                  {formatBirthDateSL(data.next_slot_birth_at)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Trajanje dihanja</span>
                <span className="font-mono">{formatDurationSL(data.settings.breath_duration_ms)}</span>
              </div>
              <div className="flex justify-between">
                <span>Razmik med rojstvi</span>
                <span className="font-mono">{formatDurationSL(data.settings.birth_spacing_ms)}</span>
              </div>
            </Card>

            <div className="text-center">
              <Button variant="outline" onClick={refresh} disabled={refreshing}>
                <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Osveži vrsto
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
