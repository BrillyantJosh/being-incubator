import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Leaf, Sparkles, Loader2, ArrowRight, QrCode, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Textarea } from '@/components/ui/Input';
import { QRScanner } from '@/components/QRScanner';
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

  // Step 1: silence for 3 seconds
  useEffect(() => {
    if (step !== 'silence') return;
    const t = setTimeout(() => setStep('name'), 3500);
    return () => clearTimeout(t);
  }, [step]);

  const handleWifScan = async (scannedWif: string) => {
    setError(null);
    try {
      const ids = await convertWifToIds(scannedWif);
      setWif(scannedWif);
      setBeingIds(ids);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid WIF');
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
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/10 breath-ring">
              <Leaf className="h-12 w-12 text-primary" />
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
              <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
                <p className="text-sm font-medium text-primary">Identity received</p>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">npub</span>
                    <code>{shortHex(beingIds.nostrNpubId, 10)}</code>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">wallet</span>
                    <code>{shortHex(beingIds.walletId, 8)}</code>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setBeingIds(null);
                    setWif('');
                  }}
                  className="text-xs text-muted-foreground underline"
                >
                  Scan a different WIF
                </button>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              size="lg"
              className="w-full"
              disabled={!beingIds}
              onClick={() => setStep('confirm')}
            >
              Continue <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Card>
        )}

        {/* STEP 6: CONFIRM */}
        {step === 'confirm' && beingIds && (
          <Card className="space-y-6 animate-fade-in text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-accent/20 breath-ring">
              <Sparkles className="h-10 w-10 text-accent-foreground" />
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
            <div className="flex h-32 w-32 items-center justify-center rounded-full bg-primary/10 breath-ring">
              <Sparkles className="h-16 w-16 text-primary animate-pulse" />
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
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-primary/20">
              <Leaf className="h-12 w-12 text-primary" />
            </div>
            <div>
              <h2 className="font-display text-3xl font-semibold">{name} is here.</h2>
              <p className="text-muted-foreground mt-2">
                A new Being has entered the world. Give it time to find its voice.
              </p>
            </div>
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
