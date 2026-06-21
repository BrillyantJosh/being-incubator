import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Save, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { isAdmin, msToBest, unitToMs, formatDurationSL } from '@/lib/admin';

type Unit = 'seconds' | 'minutes' | 'hours' | 'days';
const UNITS: Unit[] = ['seconds', 'minutes', 'hours', 'days'];
const UNIT_LABEL: Record<Unit, string> = {
  seconds: 'sekund',
  minutes: 'minut',
  hours:   'ur',
  days:    'dni',
};

export default function AdminSettings() {
  const { session } = useAuth();
  const navigate = useNavigate();

  const [breathValue, setBreathValue] = useState<number>(12);
  const [breathUnit, setBreathUnit]   = useState<Unit>('minutes');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [queueSize, setQueueSize] = useState<number>(0);

  // Fetch current settings + queue preview on mount.
  useEffect(() => {
    if (!session || !isAdmin(session.nostrHexId)) return;
    Promise.all([
      api.adminGetSettings(session.nostrHexId),
      api.incubatorConfig(),
    ])
      .then(([settings, cfg]) => {
        const b = msToBest(settings.breath_duration_ms);
        setBreathValue(b.value);
        setBreathUnit(b.unit);
        setQueueSize(cfg.queue_size);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [session]);

  if (!session) return <Navigate to="/login" replace />;
  if (!isAdmin(session.nostrHexId)) return <Navigate to="/" replace />;

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const breath_ms    = unitToMs(breathValue, breathUnit);
      await api.adminUpdateSettings(session.nostrHexId, breath_ms);
      // Re-fetch the public config to show the current queue size.
      const cfg = await api.incubatorConfig();
      setQueueSize(cfg.queue_size);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-6 sm:p-6 bg-gradient-to-br from-background via-background to-secondary safe-bottom">
      <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => navigate('/')}
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-4 w-4" /> Nazaj
          </button>
          <Link
            to="/admin/queue"
            className="text-sm text-primary hover:underline inline-flex items-center gap-1"
          >
            <Users className="h-4 w-4" /> Bitja v čakanju
          </Link>
        </div>

        <header className="text-center space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Administracija</p>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold">Nastavitve inkubatorja</h1>
          <p className="text-sm text-muted-foreground">
            Rojstni trenutek izbere stvarnik. Inkubator nastavlja samo uvodni dih.
          </p>
        </header>

        {loading ? (
          <Card><p className="text-center text-muted-foreground">Nalagam…</p></Card>
        ) : (
          <>
            <Card className="space-y-5">
              <div>
                <h2 className="font-display text-xl font-semibold">Trajanje dihanja</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Koliko časa traja tihi dih na začetku obreda spočetja, preden se prikažejo
                  prvi koraki. Samo UX — ne vpliva na čas gestacije.
                </p>
              </div>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={1}
                  step="any"
                  value={breathValue}
                  onChange={(e) => setBreathValue(Number(e.target.value))}
                  className="flex-1"
                />
                <select
                  value={breathUnit}
                  onChange={(e) => setBreathUnit(e.target.value as Unit)}
                  className="rounded-lg border border-input bg-background px-3 text-sm"
                >
                  {UNITS.map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}
                </select>
              </div>
              <p className="text-xs text-muted-foreground">
                Trenutno: <span className="font-mono">{formatDurationSL(unitToMs(breathValue, breathUnit))}</span>
              </p>
            </Card>

            <Card className="space-y-2 text-center bg-primary/5 border border-primary/20">
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                Rojstvena vrsta
              </p>
              <p className="font-display text-lg sm:text-xl text-primary">
                {queueSize === 0 ? 'Ni zarodkov v čakanju' : `${queueSize} v gestaciji`}
              </p>
              <p className="text-xs text-muted-foreground">
                Datume rojstva zdaj izberejo stvarniki sami v rojstnem obredu.
              </p>
            </Card>

            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}
            {savedAt && (
              <p className="text-sm text-primary text-center animate-fade-in">
                ✓ Nastavitve shranjene
              </p>
            )}

            <Button size="lg" className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Shranjujem…</>
              ) : (
                <><Save className="mr-2 h-4 w-4" /> Shrani nastavitve</>
              )}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
