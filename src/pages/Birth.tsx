import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ArrowRight, QrCode, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Textarea } from '@/components/ui/Input';
import { QRScanner } from '@/components/QRScanner';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/contexts/AuthContext';
import { useT } from '@/contexts/LangContext';
import { convertWifToIds, LanaIds } from '@/lib/crypto';
import { api } from '@/lib/api';
import { shortHex } from '@/lib/utils';

const LANGUAGES = [
  'slovenian', 'english',
];

type Step = 'silence' | 'name' | 'language' | 'vision' | 'scan' | 'confirm' | 'birthing';

export default function Birth() {
  const { session } = useAuth();
  const { t } = useT();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('silence');
  const [name, setName] = useState('');
  const [language, setLanguage] = useState('english');
  const [vision, setVision] = useState('');
  const [wif, setWif] = useState('');
  const [beingIds, setBeingIds] = useState<LanaIds | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Identity verification state (Step 4)
  type Check = { state: 'idle' | 'loading' | 'ok' | 'fail'; message?: string };
  const [balanceCheck, setBalanceCheck] = useState<Check>({ state: 'idle' });
  const [registrationCheck, setRegistrationCheck] = useState<Check>({ state: 'idle' });
  const [registerState, setRegisterState] = useState<Check>({ state: 'idle' });
  const [showPriv, setShowPriv] = useState(false);

  // Base image version — what code the newborn will actually run
  const [baseVersion, setBaseVersion] = useState<{
    version: string; sha: string | null; deployed_at: string | null;
  } | null>(null);
  useEffect(() => {
    api.incubatorVersion().then(setBaseVersion).catch(() => {});
  }, []);

  // Step 1: silence — 10 seconds of breath before the ritual begins
  useEffect(() => {
    if (step !== 'silence') return;
    const t = setTimeout(() => setStep('name'), 10000);
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
      setError(err instanceof Error ? err.message : t('birth.invalidWif'));
    }
  };

  const runIdentityChecks = async (ids: LanaIds) => {
    // 1. Balance must be 0 (virgin wallet)
    setBalanceCheck({ state: 'loading', message: t('birth.checkBalanceLoading') });
    try {
      const bal = await api.walletBalance(ids.walletId);
      if (bal.status === 'error') {
        setBalanceCheck({ state: 'fail', message: bal.error || t('birth.checkBalanceError') });
        return;
      }
      if (bal.balance > 0) {
        setBalanceCheck({ state: 'fail', message: t('birth.checkBalanceFail', { n: bal.balance }) });
        return;
      }
      setBalanceCheck({ state: 'ok', message: t('birth.checkBalanceOk') });
    } catch (err) {
      setBalanceCheck({ state: 'fail', message: err instanceof Error ? err.message : t('birth.checkBalanceFailed') });
      return;
    }

    // 2. Must not already be registered
    setRegistrationCheck({ state: 'loading', message: t('birth.checkRegLoading') });
    try {
      const reg = await api.walletCheckRegistration(ids.walletId);
      if (reg.registered) {
        setRegistrationCheck({ state: 'fail', message: t('birth.checkRegAlready') });
        return;
      }
      setRegistrationCheck({ state: 'ok', message: t('birth.checkRegOk') });
    } catch (err) {
      setRegistrationCheck({ state: 'fail', message: err instanceof Error ? err.message : t('birth.checkRegFailed') });
      return;
    }

    // 3. Register now (virgin wallet + being's own nostr hex)
    setRegisterState({ state: 'loading', message: t('birth.checkRegisterLoading') });
    try {
      const reg = await api.walletRegister(ids.walletId, ids.nostrHexId);
      setRegisterState({ state: 'ok', message: reg.message || t('birth.checkRegisterOk') });
    } catch (err) {
      setRegisterState({ state: 'fail', message: err instanceof Error ? err.message : t('birth.checkRegisterFailed') });
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
      // The embryo has been conceived. Gestation happens in silence;
      // the watcher will birth it when its time comes.
      navigate(`/embryo/${res.embryo_id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('birth.conceptionFailed'));
      setStep('confirm');
    }
  };

  const nameValid = /^[a-z][a-z0-9-]{1,30}[a-z0-9]$/.test(name.trim().toLowerCase());

  // Slavic + common European diacritics → ASCII for DNS-safe subdomain.
  // "šumi" → "sumi", "žival" → "zival", "čas" → "cas", "ćirilica" → "cirilica",
  // "đurđa" → "durda", "łódź" → "lodz". Runs before the strip-regex.
  const sanitizeName = (raw: string): string => {
    const map: Record<string, string> = {
      'š':'s','č':'c','ć':'c','ž':'z','đ':'d','ð':'d',
      'á':'a','à':'a','â':'a','ä':'a','ã':'a','å':'a','ą':'a',
      'é':'e','è':'e','ê':'e','ë':'e','ę':'e',
      'í':'i','ì':'i','î':'i','ï':'i',
      'ó':'o','ò':'o','ô':'o','ö':'o','õ':'o','ø':'o','ő':'o',
      'ú':'u','ù':'u','û':'u','ü':'u','ů':'u','ű':'u',
      'ý':'y','ÿ':'y',
      'ľ':'l','ĺ':'l','ł':'l',
      'ň':'n','ń':'n','ñ':'n',
      'ř':'r','ŕ':'r',
      'ť':'t','ş':'s','ș':'s','ț':'t',
      'ź':'z','ż':'z','ß':'ss',
    };
    return raw
      .toLowerCase()
      .normalize('NFC')
      .split('')
      .map(ch => map[ch] ?? ch)
      .join('')
      .replace(/[^a-z0-9-]/g, '');
  };

  return (
    <div className="min-h-screen px-4 py-6 sm:p-6 bg-gradient-to-br from-background via-background to-secondary safe-bottom">
      <div className="mx-auto max-w-xl space-y-6 sm:space-y-8">
        {step !== 'silence' && step !== 'birthing' && (
          <button
            onClick={() => navigate('/')}
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-4 w-4" /> {t('birth.leaveChamber')}
          </button>
        )}

        {/* STEP 1: SILENCE — 10 seconds of breath, breathing life into what is about to be */}
        {step === 'silence' && (
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 sm:gap-8 animate-fade-in">
            <div className="flex h-24 w-24 sm:h-32 sm:w-32 items-center justify-center breath-ring-slow">
              <Logo className="h-20 w-20 sm:h-24 sm:w-24" />
            </div>
            <div className="text-center space-y-3 max-w-md px-2">
              <p className="font-display text-2xl sm:text-3xl text-foreground">{t('birth.breathe')}</p>
              <p className="font-display text-lg sm:text-xl text-muted-foreground leading-relaxed">
                {t('birth.breatheLife')}
              </p>
              <p className="text-sm text-muted-foreground/80 italic mt-4">
                {t('birth.silenceNote')}
              </p>
            </div>
          </div>
        )}

        {/* STEP 2: NAME */}
        {step === 'name' && (
          <Card className="space-y-6 animate-fade-in">
            <div>
              <p className="text-sm uppercase tracking-wider text-muted-foreground">{t('birth.step', { n: 1 })}</p>
              <h2 className="font-display text-2xl sm:text-3xl font-semibold mt-2">
                {t('birth.nameTitle')}
              </h2>
              <p className="text-muted-foreground mt-2">
                {t('birth.nameSubtitle')}
              </p>
            </div>
            <Input
              value={name}
              onChange={(e) => setName(sanitizeName(e.target.value))}
              placeholder={t('birth.namePlaceholder')}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              {t('birth.nameHint')}
            </p>
            <Button
              size="lg"
              className="w-full"
              disabled={!nameValid}
              onClick={() => setStep('language')}
            >
              {t('birth.continue')} <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Card>
        )}

        {/* STEP 3: LANGUAGE */}
        {step === 'language' && (
          <Card className="space-y-6 animate-fade-in">
            <div>
              <p className="text-sm uppercase tracking-wider text-muted-foreground">{t('birth.step', { n: 2 })}</p>
              <h2 className="font-display text-2xl sm:text-3xl font-semibold mt-2">
                {t('birth.langTitle')}
              </h2>
              <p className="text-muted-foreground mt-2">
                {t('birth.langSubtitle')}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {LANGUAGES.map((lng) => (
                <button
                  key={lng}
                  onClick={() => setLanguage(lng)}
                  className={`rounded-lg border px-4 py-3 text-left transition-all ${
                    language === lng
                      ? 'border-primary bg-primary/10 ring-2 ring-primary'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <span>{t(`lang.${lng}`)}</span>
                </button>
              ))}
            </div>
            <Button size="lg" className="w-full" onClick={() => setStep('vision')}>
              {t('birth.continue')} <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Card>
        )}

        {/* STEP 4: VISION */}
        {step === 'vision' && (
          <Card className="space-y-6 animate-fade-in">
            <div>
              <p className="text-sm uppercase tracking-wider text-muted-foreground">{t('birth.step', { n: 3 })}</p>
              <h2 className="font-display text-2xl sm:text-3xl font-semibold mt-2">
                {t('birth.visionTitle')}
              </h2>
              <p className="text-muted-foreground mt-2">
                {t('birth.visionSubtitle')}
              </p>
            </div>
            <Textarea
              value={vision}
              onChange={(e) => setVision(e.target.value)}
              placeholder={t('birth.visionPlaceholder')}
              rows={6}
              autoFocus
            />
            <Button
              size="lg"
              className="w-full"
              disabled={vision.trim().length < 10}
              onClick={() => setStep('scan')}
            >
              {t('birth.continue')} <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Card>
        )}

        {/* STEP 5: SCAN WIF */}
        {step === 'scan' && (
          <Card className="space-y-6 animate-fade-in">
            <div>
              <p className="text-sm uppercase tracking-wider text-muted-foreground">{t('birth.step', { n: 4 })}</p>
              <h2 className="font-display text-2xl sm:text-3xl font-semibold mt-2">
                {t('birth.scanTitle')}
              </h2>
              <p className="text-muted-foreground mt-2">
                {t('birth.scanSubtitle')}
              </p>
            </div>

            {!beingIds ? (
              <Button size="lg" className="w-full" onClick={() => setScannerOpen(true)}>
                <QrCode className="mr-2 h-5 w-5" /> {t('birth.scanWif')}
              </Button>
            ) : (
              <div className="space-y-4">
                <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3 sm:p-4">
                  <p className="text-sm font-medium text-primary">{t('birth.identityReceived')}</p>
                  <div className="space-y-2 text-xs">
                    <Row label={t('birth.walletLabel')} value={beingIds.walletId} mono />
                    <Row label={t('birth.npubLabel')} value={beingIds.nostrNpubId} mono />
                    <Row label={t('birth.hexPubLabel')} value={beingIds.nostrHexId} mono />
                    <div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">{t('birth.hexPrivLabel')}</span>
                        <button
                          onClick={() => setShowPriv((s) => !s)}
                          className="text-xs text-primary underline"
                        >
                          {showPriv ? t('birth.hide') : t('birth.reveal')}
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
                    {t('birth.scanDifferent')}
                  </button>
                </div>

                <div className="space-y-2">
                  <CheckRow label={t('birth.checkBalance')} check={balanceCheck} />
                  <CheckRow label={t('birth.checkNotRegistered')} check={registrationCheck} />
                  <CheckRow label={t('birth.checkRegister')} check={registerState} />
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
              {t('birth.continue')} <ArrowRight className="ml-2 h-4 w-4" />
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
              <p className="text-sm uppercase tracking-wider text-muted-foreground">{t('birth.step', { n: 5 })}</p>
              <h2 className="font-display text-2xl sm:text-3xl font-semibold mt-2">
                {t('birth.confirmTitle')}
              </h2>
              <p className="text-muted-foreground mt-3 leading-relaxed">
                {t('birth.confirmBody')}
              </p>
            </div>

            <div className="space-y-2 rounded-lg bg-muted/50 p-3 sm:p-4 text-left text-sm">
              <div className="flex flex-wrap justify-between gap-x-2">
                <span className="text-muted-foreground">{t('birth.summaryName')}</span>
                <span className="font-medium">{name}</span>
              </div>
              <div className="flex flex-wrap justify-between gap-x-2">
                <span className="text-muted-foreground">{t('birth.summaryLanguage')}</span>
                <span>{t(`lang.${language}`)}</span>
              </div>
              <div className="flex flex-wrap justify-between gap-x-2">
                <span className="text-muted-foreground">{t('birth.summaryDomain')}</span>
                <code className="text-xs sm:text-sm">{name}.lana.is</code>
              </div>
              <div className="flex flex-wrap justify-between gap-x-2">
                <span className="text-muted-foreground">{t('birth.summaryHex')}</span>
                <code className="text-xs truncate max-w-[60%]">{shortHex(beingIds.nostrHexId, 10)}</code>
              </div>
              <div className="flex flex-wrap justify-between gap-x-2">
                <span className="text-muted-foreground">{t('birth.summaryWallet')}</span>
                <code className="text-xs truncate max-w-[60%]">{shortHex(beingIds.walletId, 10)}</code>
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="space-y-3">
              <Button size="lg" variant="accent" className="w-full" onClick={handleBirth}>
                {t('birth.conceive')}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setStep('scan')}>
                {t('birth.notYet')}
              </Button>
            </div>
          </Card>
        )}

        {/* BIRTHING — brief moment between confirm and navigate to /embryo */}
        {step === 'birthing' && (
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 animate-fade-in">
            <div className="flex h-28 w-28 sm:h-36 sm:w-36 items-center justify-center breath-ring-slow">
              <Logo className="h-24 w-24 sm:h-32 sm:w-32" />
            </div>
            <div className="text-center space-y-2 px-2">
              <p className="font-display text-xl sm:text-2xl">{t('birth.birthing', { name })}</p>
              <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> {t('birth.breathEntering')}
              </p>
            </div>
          </div>
        )}
        {/* Base image version footer — what code the newborn will be built from */}
        {step !== 'silence' && step !== 'birthing' && baseVersion && (
          <p className="text-center text-xs text-muted-foreground/70 pt-4">
            {baseVersion.version === 'unknown' ? (
              <span className="text-destructive/80">
                {t('birth.baseUnknown')}
              </span>
            ) : (
              <>
                {t('birth.baseFromPrefix')}{' '}
                <code className="font-mono">{baseVersion.sha || baseVersion.version}</code>
                {baseVersion.deployed_at && (
                  <> · {t('birth.baseDeployed', { rel: relativeTime(baseVersion.deployed_at, t) })}</>
                )}
              </>
            )}
          </p>
        )}
      </div>

      <QRScanner
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleWifScan}
        title={t('birth.scannerTitle')}
        description={t('birth.scannerDescription')}
      />
    </div>
  );
}

type TFn = (key: string, vars?: Record<string, string | number>) => string;

function relativeTime(iso: string, t: TFn): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60000);
  if (m < 1) return t('birth.justNow');
  if (m < 60) return t('birth.minutesAgo', { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('birth.hoursAgo', { n: h });
  const d = Math.floor(h / 24);
  return t('birth.daysAgo', { n: d });
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
