import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { QrCode, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { QRScanner } from '@/components/QRScanner';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/contexts/AuthContext';
import { useT } from '@/contexts/LangContext';

export default function Login() {
  const { session, login } = useAuth();
  const { t } = useT();
  const navigate = useNavigate();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [wif, setWif] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session) navigate('/', { replace: true });
  }, [session, navigate]);

  const handleLogin = async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      await login(value);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.loginFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-background via-background to-secondary">
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        <div className="text-center space-y-3">
          <div className="mx-auto flex h-20 w-20 items-center justify-center breath-ring">
            <Logo className="h-16 w-16" />
          </div>
          <h1 className="text-3xl font-display font-semibold">{t('login.title')}</h1>
          <p className="text-muted-foreground">{t('login.tagline')}</p>
        </div>

        <Card className="space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-medium">{t('login.enterWithWif')}</p>
            <p className="text-xs text-muted-foreground">
              {t('login.keyStaysOnDevice')}
            </p>
          </div>

          <Button
            onClick={() => setScannerOpen(true)}
            size="lg"
            className="w-full"
            disabled={busy}
          >
            <QrCode className="mr-2 h-5 w-5" />
            {t('login.scanWif')}
          </Button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs uppercase tracking-wider text-muted-foreground">{t('login.or')}</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="space-y-3">
            <Input
              type="password"
              value={wif}
              onChange={(e) => setWif(e.target.value)}
              placeholder={t('login.pasteWif')}
              disabled={busy}
            />
            <Button
              onClick={() => handleLogin(wif)}
              variant="outline"
              className="w-full"
              disabled={busy || !wif.trim()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t('login.enter')}
            </Button>
          </div>

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          {t('login.sanctuary')}
        </p>
      </div>

      <QRScanner
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(data) => handleLogin(data)}
        title={t('login.scannerTitle')}
        description={t('login.scannerDescription')}
      />
    </div>
  );
}
