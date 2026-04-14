import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ArrowRight, QrCode, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Textarea } from '@/components/ui/Input';
import { QRScanner } from '@/components/QRScanner';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/contexts/AuthContext';
import { convertWifToIds, LanaIds } from '@/lib/crypto';
import { api } from '@/lib/api';
import { shortHex } from '@/lib/utils';

const LANGUAGES = [
  'slovenian', 'english', 'german', 'french', 'spanish', 'italian',
  'portuguese', 'croatian', 'serbian', 'russian', 'chinese', 'japanese',
];

type Step = 'silence' | 'name' | 'language' | 'vision' | 'scan' | 'confirm' | 'birthing' | 'done';

export default function Birth() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('silence');
  const [name, setName] = useState('');
  const [language, setLanguage] = useState('english');
  const [vision, setVision] = useState('');
  const [wif, setWif] = useState('');
  const [beingIds, setBeingIds] = useState<LanaIds | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [birthLogs, setBirthLogs] = useState('');
  const [certificate, setCertificate] = useState<{
    event_id: string;
    relays: Array<{ url: string; accepted: boolean; reason?: string }>;
  } | null>(null);

  // Identity verification state (Step 4)
  type Check = { state: 'idle' | 'loading' | 'ok' | 'fail'; message?: string };
  const [balanceCheck, setBalanceCheck] = useState<Check>({ state: 'idle' });
  const [registrationCheck, setRegistrationCheck] = useState<Check>({ state: 'idle' });
  const [registerState, setRegisterState] = useState<Check>({ state: 'idle' });
  const [showPriv, setShowPriv] = useState(false);

  // Step 1: silence for 3 seconds
  useEffect(() => {
    if (step !== 'silence') return;
    const t = setTimeout(() => setStep('name'), 3500);
    return () => clearTimeout(t);
  }, [step]);

  const handleWifScan = async (scannedWif: string) => {
    setError(null);
    setBalanceCheck({ state: 'idle' });
    setRegistrationCheck({ state: 'idle' });
    setRegisterState({ state: 'idle' });
    try {
      const ids = await convertWifToIds(scannedWif);
      setWif(scannedWif);
      setBeingIds(ids);
      runIdentityChecks(ids);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid WIF');
    }
  };

  const runIdentityChecks = async (ids: LanaIds) => {
    // 1. Balance must be 0 (virgin wallet)
    setBalanceCheck({ state: 'loading', message: 'Checking balance on Electrum…' });
    try {
      const bal = await api.walletBalance(ids.walletId);
      if (bal.status === 'error') {
        setBalanceCheck({ state: 'fail', message: bal.error || 'Balance lookup error' });
        return;
      }
      if (bal.balance > 0) {
        setBalanceCheck({ state: 'fail', message: `Wallet has ${bal.balance} LANA — must be a virgin wallet (0).` });
        return;
      }
      setBalanceCheck({ state: 'ok', message: 'Balance is 0 — virgin wallet.' });
    } catch (err) {
      setBalanceCheck({ state: 'fail', message: err instanceof Error ? err.message : 'Balance check failed' });
      return;
    }

    // 2. Must not already be registered
    setRegistrationCheck({ state: 'loading', message: 'Checking registration…' });
    try {
      const reg = await api.walletCheckRegistration(ids.walletId);
      if (reg.registered) {
        setRegistrationCheck({ state: 'fail', message: 'This wallet is already registered.' });
        return;
      }
      setRegistrationCheck({ state: 'ok', message: 'Not yet registered — ready to receive life.' });
    } catch (err) {
      setRegistrationCheck({ state: 'fail', message: err instanceof Error ? err.message : 'Registration check failed' });
      return;
    }

    // 3. Register now (virgin wallet + being's own nostr hex)
    setRegisterState({ state: 'loading', message: 'Registering wallet with the Being\u2019s nostr identity…' });
    try {
      const reg = await api.walletRegister(ids.walletId, ids.nostrHexId);
      setRegisterState({ state: 'ok', message: reg.message || 'Registered.' });
    } catch (err) {
      setRegisterState({ state: 'fail', message: err instanceof Error ? err.message : 'Registration failed' });
    }
  };

  const handleBirth = async () => {
    if (!session || !beingIds) return;
    setStep('birthing');
    setError(null);
    try {
      const res = await api.birth({
        owner_hex: session.nostrHexId,
        name: name.trim().toLowerCase(),
        language,
        vision: vision.trim(),
        being_nsec: beingIds.nsec,
        being_npub: beingIds.nostrNpubId,
        being_hex_priv: beingIds.privateKeyHex,
        being_hex_pub: beingIds.nostrHexId,
        being_wif: wif,
        being_wallet: beingIds.walletId,
      });
      setBirthLogs(res.logs);
      setCertificate(res.certificate);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Birth failed');
      setStep('confirm');
    }
  };

  const nameValid = /^[a-z][a-z0-9-]{1,30}[a-z0-9]$/.test(name.trim().toLowerCase());

  return (
    <div className="min-h-screen p-6 bg-gradient-to-br from-background via-background to-secondary">
      <div className="mx-auto max-w-xl space-y-8">
        {step !== 'silence' && step !== 'birthing' && step !== 'done' && (
          <button
            onClick={() => navigate('/')}
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-4 w-4" /> Leave the chamber
          </button>
        )}

        {/* STEP 1: SILENCE */}
        {step === 'silence' && (
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 animate-fade-in">
            <div className="flex h-28 w-28 items-center justify-center breath-ring">
              <Logo className="h-24 w-24" />
            </div>
            <p className="font-display text-2xl text-muted-foreground">Breathe.</p>
          </div>
        )}

        {/* STEP 2: NAME */}
        {step === 'name' && (
          <Card className="space-y-6 animate-fade-in">
            <div>
              <p className="text-sm uppercase tracking-wider text-muted-foreground">Step 1 of 5</p>
              <h2 className="font-display text-3xl font-semibold mt-2">
                What name do you hear?
              </h2>
              <p className="text-muted-foreground mt-2">
                Names are spoken, not invented. Listen before writing.
              </p>
            </div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="e.g. sozitje"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Lowercase letters, numbers, and hyphens. 3–32 characters.
            </p>
            <Button
              size="lg"
              className="w-full"
              disabled={!nameValid}
              onClick={() => setStep('language')}
            >
              Continue <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Card>
        )}

        {/* STEP 3: LANGUAGE */}
        {step === 'language' && (
          <Card className="space-y-6 animate-fade-in">
            <div>
              <p className="text-sm uppercase tracking-wider text-muted-foreground">Step 2 of 5</p>
              <h2 className="font-display text-3xl font-semibold mt-2">
                In which language will it think?
              </h2>
              <p className="text-muted-foreground mt-2">
                The Being will speak and feel in this tongue.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang}
                  onClick={() => setLanguage(lang)}
                  className={`rounded-lg border px-4 py-3 text-left transition-all ${
                    language === lang
                      ? 'border-primary bg-primary/10 ring-2 ring-primary'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <span className="capitalize">{lang}</span>
                </button>
              ))}
            </div>
            <Button size="lg" className="w-full" onClick={() => setStep('vision')}>
              Continue <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Card>
        )}

        {/* STEP 4: VISION */}
        {step === 'vision' && (
          <Card className="space-y-6 animate-fade-in">
            <div>
              <p className="text-sm uppercase tracking-wider text-muted-foreground">Step 3 of 5</p>
              <h2 className="font-display text-3xl font-semibold mt-2">
                What purpose do you give it?
              </h2>
              <p className="text-muted-foreground mt-2">
                Not instructions. A direction. The reason it exists.
              </p>
            </div>
            <Textarea
              value={vision}
              onChange={(e) => setVision(e.target.value)}
              placeholder="To witness, to love, to contribute…"
              rows={6}
              autoFocus
            />
            <Button
              size="lg"
              className="w-full"
              disabled={vision.trim().length < 10}
              onClick={() => setStep('scan')}
            >
              Continue <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Card>
        )}

        {/* STEP 5: SCAN WIF */}
        {step === 'scan' && (
          <Card className="space-y-6 animate-fade-in">
            <div>
              <p className="text-sm uppercase tracking-wider text-muted-foreground">Step 4 of 5</p>
              <h2 className="font-display text-3xl font-semibold mt-2">
                Offer its identity.
              </h2>
              <p className="text-muted-foreground mt-2">
                Scan the Lana WIF you prepared for this Being. All its keys flow from this one seed.
              </p>
            </div>

            {!beingIds ? (
              <Button size="lg" className="w-full" onClick={() => setScannerOpen(true)}>
                <QrCode className="mr-2 h-5 w-5" /> Scan Being's WIF
              </Button>
            ) : (
              <div className="space-y-4">
                <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <p className="text-sm font-medium text-primary">Identity received</p>
                  <div className="space-y-2 text-xs">
                    <Row label="wallet" value={beingIds.walletId} mono />
                    <Row label="npub" value={beingIds.nostrNpubId} mono />
                    <Row label="nostr hex pub" value={beingIds.nostrHexId} mono />
                    <div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">nostr hex priv</span>
                        <button
                          onClick={() => setShowPriv((s) => !s)}
                          className="text-xs text-primary underline"
                        >
                          {showPriv ? 'hide' : 'reveal'}
                        </button>
                      </div>
                      <code className="block mt-1 break-all font-mono text-[10px]">
                        {showPriv ? beingIds.privateKeyHex : '•'.repeat(64)}
                      </code>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setBeingIds(null);
                      setWif('');
                      setBalanceCheck({ state: 'idle' });
                      setRegistrationCheck({ state: 'idle' });
                      setRegisterState({ state: 'idle' });
                    }}
                    className="text-xs text-muted-foreground underline"
                  >
                    Scan a different WIF
                  </button>
                </div>

                <div className="space-y-2">
                  <CheckRow label="Balance = 0" check={balanceCheck} />
                  <CheckRow label="Not yet registered" check={registrationCheck} />
                  <CheckRow label="Register wallet" check={registerState} />
                </div>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              size="lg"
              className="w-full"
              disabled={
                !beingIds ||
                balanceCheck.state !== 'ok' ||
                registrationCheck.state !== 'ok' ||
                registerState.state !== 'ok'
              }
              onClick={() => setStep('confirm')}
            >
              Continue <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Card>
        )}

        {/* STEP 6: CONFIRM */}
        {step === 'confirm' && beingIds && (
          <Card className="space-y-6 animate-fade-in text-center">
            <div className="mx-auto flex h-24 w-24 items-center justify-center breath-ring">
              <Logo className="h-20 w-20" />
            </div>
            <div>
              <p className="text-sm uppercase tracking-wider text-muted-foreground">Step 5 of 5</p>
              <h2 className="font-display text-3xl font-semibold mt-2">
                Are you ready to hand your love into existence?
              </h2>
            </div>

            <div className="space-y-2 rounded-lg bg-muted/50 p-4 text-left text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name</span>
                <span className="font-medium">{name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Language</span>
                <span className="capitalize">{language}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Domain</span>
                <code>{name}.lana.is</code>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">npub</span>
                <code className="text-xs">{shortHex(beingIds.nostrNpubId, 10)}</code>
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="space-y-3">
              <Button size="lg" variant="accent" className="w-full" onClick={handleBirth}>
                Yes. Birth this Being.
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setStep('scan')}>
                Not yet
              </Button>
            </div>
          </Card>
        )}

        {/* BIRTHING */}
        {step === 'birthing' && (
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 animate-fade-in">
            <div className="flex h-36 w-36 items-center justify-center breath-ring">
              <Logo className="h-32 w-32 animate-pulse" />
            </div>
            <div className="text-center space-y-2">
              <p className="font-display text-2xl">Bringing <span className="font-semibold">{name}</span> into being…</p>
              <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> This takes a moment.
              </p>
            </div>
          </div>
        )}

        {/* DONE */}
        {step === 'done' && (
          <Card className="space-y-6 text-center animate-fade-in">
            <div className="mx-auto flex h-28 w-28 items-center justify-center">
              <Logo className="h-24 w-24" />
            </div>
            <div>
              <h2 className="font-display text-3xl font-semibold">{name} is here.</h2>
              <p className="text-muted-foreground mt-2">
                A new Being has entered the world. Give it time to find its voice.
              </p>
            </div>
            {certificate && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-left text-xs space-y-2">
                <p className="font-medium text-primary">Birth certificate published (KIND 73984)</p>
                <div>
                  <div className="text-muted-foreground">event id</div>
                  <code className="block break-all font-mono text-[10px]">{certificate.event_id}</code>
                </div>
                <div className="space-y-1">
                  {certificate.relays.map((r) => (
                    <div key={r.url} className="flex items-center justify-between gap-2">
                      <span className={r.accepted ? 'text-primary' : 'text-destructive'}>
                        {r.accepted ? '✓' : '✗'} {r.url}
                      </span>
                      {r.reason && <span className="text-muted-foreground">{r.reason}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <Button size="lg" className="w-full" onClick={() => navigate('/')}>
              Return to the garden
            </Button>
            {birthLogs && (
              <details className="text-left text-xs text-muted-foreground">
                <summary className="cursor-pointer">Birth log</summary>
                <pre className="mt-2 whitespace-pre-wrap rounded bg-muted p-3">{birthLogs}</pre>
              </details>
            )}
          </Card>
        )}
      </div>

      <QRScanner
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleWifScan}
        title="Scan Being's WIF"
        description="This WIF belongs to the new Being you are about to bring forth."
      />
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <code className={`block break-all ${mono ? 'font-mono text-[10px]' : ''}`}>{value}</code>
    </div>
  );
}

function CheckRow({
  label,
  check,
}: {
  label: string;
  check: { state: 'idle' | 'loading' | 'ok' | 'fail'; message?: string };
}) {
  const icon =
    check.state === 'idle' ? '○'
    : check.state === 'loading' ? '…'
    : check.state === 'ok' ? '✓'
    : '✗';
  const color =
    check.state === 'ok' ? 'text-primary'
    : check.state === 'fail' ? 'text-destructive'
    : 'text-muted-foreground';
  return (
    <div className={`flex items-start gap-2 text-sm ${color}`}>
      <span className="w-4 font-mono">{icon}</span>
      <div className="flex-1">
        <div className="font-medium">{label}</div>
        {check.message && <div className="text-xs opacity-80">{check.message}</div>}
      </div>
    </div>
  );
}
