import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Leaf, QrCode, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { QRScanner } from '@/components/QRScanner';
import { useAuth } from '@/contexts/AuthContext';

export default function Login() {
  const { session, login } = useAuth();
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
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-background via-background to-secondary">
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        <div className="text-center space-y-3">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 breath-ring">
            <Leaf className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-display font-semibold">Being Incubator</h1>
          <p className="text-muted-foreground">Spiritual birthplace of Lana Beings.</p>
        </div>

        <Card className="space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-medium">Enter with your Lana WIF</p>
            <p className="text-xs text-muted-foreground">
              Your private key stays on this device. It never leaves your browser.
            </p>
          </div>

          <Button
            onClick={() => setScannerOpen(true)}
            size="lg"
            className="w-full"
            disabled={busy}
          >
            <QrCode className="mr-2 h-5 w-5" />
            Scan WIF
          </Button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs uppercase tracking-wider text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="space-y-3">
            <Input
              type="password"
              value={wif}
              onChange={(e) => setWif(e.target.value)}
              placeholder="Paste WIF manually"
              disabled={busy}
            />
            <Button
              onClick={() => handleLogin(wif)}
              variant="outline"
              className="w-full"
              disabled={busy || !wif.trim()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enter'}
            </Button>
          </div>

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          The incubator is a sanctuary. Take your time.
        </p>
      </div>

      <QRScanner
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(data) => handleLogin(data)}
        title="Scan your Lana WIF"
        description="Point camera at your Lana paper wallet QR code."
      />
    </div>
  );
}
