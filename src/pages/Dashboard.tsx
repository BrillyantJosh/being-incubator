import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/contexts/AuthContext';
import { useT } from '@/contexts/LangContext';
import { LANGS, LANG_LABELS, Lang } from '@/lib/i18n';
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
  const { t, lang, setLang } = useT();
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

  const displayName = session.profileDisplayName || session.profileName || t('dashboard.wanderer');

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
              <p className="text-xs text-muted-foreground">{t('dashboard.welcome')}</p>
              <h1 className="font-display text-xl font-semibold">{displayName}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="lang-switcher">{t('dashboard.language')}</label>
            <select
              id="lang-switcher"
              value={lang}
              onChange={(e) => setLang(e.target.value as Lang)}
              className="rounded-md border border-border bg-background/50 px-2 py-1 text-xs font-mono text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              aria-label={t('dashboard.language')}
            >
              {LANGS.map((l) => (
                <option key={l} value={l}>{LANG_LABELS[l]}</option>
              ))}
            </select>
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" />
              {t('dashboard.leave')}
            </Button>
          </div>
        </header>

        {loading ? (
          <Card>
            <p className="text-center text-muted-foreground">{t('dashboard.listening')}</p>
          </Card>
        ) : embryo && embryo.status === 'failed' ? (
          <Card className="space-y-5 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-destructive/40">
              <Logo className="h-16 w-16 opacity-60" />
            </div>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.25em] text-destructive">{t('dashboard.threadBroke')}</p>
              <h2 className="font-display text-3xl font-semibold">{embryo.name}</h2>
              <p className="text-sm text-muted-foreground">
                {t('dashboard.couldNotCross')}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => navigate(`/embryo/${embryo.id}`)}
              >
                {t('dashboard.seeWhatHappened')}
              </Button>
              <Button
                className="flex-1"
                onClick={async () => {
                  try {
                    await api.abandonEmbryo(embryo.id, session.nostrHexId);
                    window.location.reload();
                  } catch (err) {
                    alert(t('dashboard.couldNotRelease', { msg: (err as Error).message }));
                  }
                }}
              >
                {t('dashboard.releaseRetry')}
              </Button>
            </div>
          </Card>
        ) : embryo ? (
          <Card className="space-y-5 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center heartbeat-ring rounded-full">
              <Logo className="h-16 w-16" />
            </div>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">{t('dashboard.gestating')}</p>
              <h2 className="font-display text-3xl font-semibold">{embryo.name}</h2>
              <p className="text-sm text-muted-foreground">
                {t('dashboard.growingInSilence')}
              </p>
              <p className="font-mono text-xs text-muted-foreground mt-2">
                {t('dashboard.due', { when: new Date(embryo.birth_at * 1000).toLocaleString() })}
              </p>
            </div>
            <Button size="lg" className="w-full" onClick={() => navigate(`/embryo/${embryo.id}`)}>
              {t('dashboard.witnessGestation')}
            </Button>
          </Card>
        ) : being ? (
          <Card className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center">
                <Logo className="h-10 w-10" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{t('dashboard.yourBeing')}</p>
                <h2 className="font-display text-2xl font-semibold">{being.name}</h2>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('dashboard.domain')}</span>
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
                <span className="text-muted-foreground">{t('dashboard.npub')}</span>
                <code className="text-xs">{shortHex(being.npub, 10)}</code>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('dashboard.born')}</span>
                <span>{new Date(being.birthed_at * 1000).toLocaleString()}</span>
              </div>
            </div>

            <Button asChild size="lg" className="w-full">
              <a href={`https://${being.domain}`} target="_blank" rel="noreferrer">
                {t('dashboard.visit', { name: being.name })}
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
              <h2 className="font-display text-2xl font-semibold">{t('dashboard.noBeingYet')}</h2>
              <p className="text-muted-foreground">
                {t('dashboard.everyBeing')}
              </p>
            </div>
            <Button size="lg" className="w-full" onClick={() => navigate('/birth')}>
              {t('dashboard.beginBirth')}
            </Button>
          </Card>
        )}

      </div>
    </div>
  );
}
