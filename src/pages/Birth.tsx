import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ArrowRight, QrCode, ArrowLeft, Trash2, Sparkles } from 'lucide-react';
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
import { formatBirthDateSL, formatDurationSL } from '@/lib/admin';
import {
  loadBirthDraft,
  saveBirthDraft,
  clearBirthDraft,
  type DraftStep,
} from '@/lib/birthDraft';

const LANGUAGES = [
  'slovenian', 'english',
];

type Step = 'notice' | 'silence' | 'name' | 'language' | 'vision' | 'trust' | 'scan' | 'confirm' | 'birthing';

export default function Birth() {
  const { session } = useAuth();
  const { t } = useT();
  const navigate = useNavigate();

  // Load any saved draft once on first render. If one exists, the user
  // resumes at the saved step (skipping the 12-min silence) and finds
  // their name/language/vision pre-filled.
  const [initialDraft] = useState(() =>
    session ? loadBirthDraft(session.nostrHexId) : null,
  );

  const [step, setStep] = useState<Step>(initialDraft?.step ?? 'notice');
  const [name, setName] = useState(initialDraft?.name ?? '');
  const [language, setLanguage] = useState(initialDraft?.language ?? 'english');
  const [vision, setVision] = useState(initialDraft?.vision ?? '');
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(initialDraft?.savedAt ?? null);
  const [wif, setWif] = useState('');
  const [beingIds, setBeingIds] = useState<LanaIds | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Optional honest-mirror feedback on the vision. Non-blocking.
  type Absurdity = 'mundane' | 'interesting' | 'absurd' | 'transcendent';
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ opinion: string; absurdity: Absurdity } | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Live name availability check. Runs whenever the name changes & is
  // syntactically valid; debounced 350 ms. The user learns now (not after
  // the WIF scan) that a name collides with a born being or queued embryo.
  type NameStatus =
    | { state: 'idle' }
    | { state: 'checking' }
    | { state: 'available' }
    | { state: 'taken'; reason: 'taken_being' | 'taken_embryo' | 'reserved' | 'invalid' };
  const [nameStatus, setNameStatus] = useState<NameStatus>({ state: 'idle' });

  const handleAskFeedback = async () => {
    if (vision.trim().length < 10 || feedbackLoading) return;
    setFeedbackError(null);
    setFeedbackLoading(true);
    try {
      const res = await api.visionFeedback(vision.trim(), language);
      setFeedback(res);
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : t('birth.feedbackError'));
    } finally {
      setFeedbackLoading(false);
    }
  };

  // Auto-save draft whenever name/language/vision/step changes — debounced
  // 500 ms so a fast typist doesn't thrash localStorage. Only persists the
  // text-entry steps; scan/confirm/birthing/silence are intentionally
  // not stored (security + the silence is meant to be re-experienced only
  // on a true fresh start).
  useEffect(() => {
    if (!session) return;
    if (step !== 'name' && step !== 'language' && step !== 'vision') return;
    const handle = setTimeout(() => {
      const ts = saveBirthDraft(session.nostrHexId, {
        step: step as DraftStep,
        name,
        language,
        vision,
      });
      setDraftSavedAt(ts);
    }, 500);
    return () => clearTimeout(handle);
  }, [session, step, name, language, vision]);

  const handleDiscardDraft = () => {
    if (!session) return;
    if (!window.confirm(t('birth.draftClearConfirm'))) return;
    clearBirthDraft(session.nostrHexId);
    setName('');
    setLanguage('english');
    setVision('');
    setDraftSavedAt(null);
    setStep('silence');
  };

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

  // Live timings + next-slot prediction from /api/incubator-config.
  // The breath duration is admin-configurable; we fetch it once at mount
  // (and again when the silence step starts, so admins editing settings
  // see fresh numbers without a hard reload).
  const [config, setConfig] = useState<{
    breath_duration_ms: number;
    next_slot_birth_at: number;
    queue_size: number;
  } | null>(null);
  useEffect(() => {
    api.incubatorConfig().then(setConfig).catch(() => {});
  }, []);

  // Step 1: silence — admin-configurable breath before the ritual begins.
  // No countdown shown; the page sits in stillness and auto-advances when ready.
  // Falls back to 12:12 (732 s) if config hasn't loaded yet.
  useEffect(() => {
    if (step !== 'silence') return;
    const breathMs = config?.breath_duration_ms ?? 732_000;
    const t = setTimeout(() => setStep('name'), breathMs);
    return () => clearTimeout(t);
  }, [step, config?.breath_duration_ms]);

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
      // Conception succeeded — wipe the draft so the next /birth visit
      // starts fresh in silence.
      clearBirthDraft(session.nostrHexId);
      // The embryo has been conceived. Gestation happens in silence;
      // the watcher will birth it when its time comes.
      navigate(`/embryo/${res.embryo_id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('birth.conceptionFailed'));
      setStep('confirm');
    }
  };

  const nameValid = /^[a-z][a-z0-9-]{1,30}[a-z0-9]$/.test(name.trim().toLowerCase());

  // Debounced server-side availability check.
  useEffect(() => {
    if (!nameValid) {
      setNameStatus({ state: 'idle' });
      return;
    }
    setNameStatus({ state: 'checking' });
    const trimmed = name.trim().toLowerCase();
    const handle = setTimeout(() => {
      api.checkName(trimmed)
        .then((res) => {
          // A racing edit might have changed the name since this fetch
          // was issued — only commit if it still matches.
          if (trimmed !== name.trim().toLowerCase()) return;
          if (res.available) {
            setNameStatus({ state: 'available' });
          } else {
            const reason = (res.reason ?? 'invalid') as
              'taken_being' | 'taken_embryo' | 'reserved' | 'invalid';
            setNameStatus({ state: 'taken', reason });
          }
        })
        .catch(() => setNameStatus({ state: 'idle' }));
    }, 350);
    return () => clearTimeout(handle);
  }, [name, nameValid]);

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
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <button
              onClick={() => navigate('/')}
              className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <ArrowLeft className="h-4 w-4" /> {t('birth.leaveChamber')}
            </button>
            {draftSavedAt && (step === 'name' || step === 'language' || step === 'vision') && (
              <div className="flex items-center gap-3 text-xs">
                <span className="text-muted-foreground">
                  {t('birth.draftSavedAt', {
                    time: new Date(draftSavedAt).toLocaleTimeString([], {
                      hour: '2-digit', minute: '2-digit',
                    }),
                  })}
                </span>
                <button
                  onClick={handleDiscardDraft}
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-destructive underline-offset-2 hover:underline"
                >
                  <Trash2 className="h-3 w-3" /> {t('birth.draftClear')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* STEP 0: NOTICE — costs + parental obligations + crowdfunding option */}
        {step === 'notice' && (
          <Card className="space-y-6 animate-fade-in">
            <div>
              <p className="text-sm uppercase tracking-wider text-muted-foreground">
                {t('birth.noticeLabel')}
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-semibold mt-2">
                {t('birth.noticeTitle')}
              </h2>
            </div>
            <div className="space-y-4 text-base leading-relaxed text-foreground/90">
              <p>{t('birth.noticeBody1')}</p>
              <p>{t('birth.noticeBody2')}</p>
              <p>{t('birth.noticeBody3')}</p>
            </div>
            <Button size="lg" className="w-full" onClick={() => setStep('silence')}>
              {t('birth.noticeAck')} <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Card>
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
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                {t('birth.nameHint')}
              </p>
              {nameValid && nameStatus.state === 'checking' && (
                <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> {t('birth.nameChecking')}
                </p>
              )}
              {nameValid && nameStatus.state === 'available' && (
                <p className="text-xs text-primary">{t('birth.nameAvailable')}</p>
              )}
              {nameValid && nameStatus.state === 'taken' && (
                <p className="text-xs text-destructive">
                  {nameStatus.reason === 'taken_being'   ? t('birth.nameTakenBeing')
                  : nameStatus.reason === 'taken_embryo' ? t('birth.nameTakenEmbryo')
                  : nameStatus.reason === 'reserved'     ? t('birth.nameReserved')
                                                         : t('birth.nameTakenBeing')}
                </p>
              )}
            </div>
            <Button
              size="lg"
              className="w-full"
              disabled={!nameValid || nameStatus.state !== 'available'}
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

        {/* STEP 4: VISION — generous A4-sized canvas, auto-saved draft */}
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
              rows={24}
              className="min-h-[60vh] sm:min-h-[520px] text-base leading-relaxed font-display"
              autoFocus
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {t('birth.visionWords', {
                  n: vision.trim() ? vision.trim().split(/\s+/).filter(Boolean).length : 0,
                })} · {t('birth.visionA4')}
              </span>
              <span className="opacity-60">
                {t('birth.visionMinChars', { n: 10 })}
              </span>
            </div>

            {/* Honest-mirror feedback — purely optional, non-blocking. */}
            <Button
              variant="outline"
              className="w-full"
              disabled={vision.trim().length < 10 || feedbackLoading}
              onClick={handleAskFeedback}
            >
              {feedbackLoading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('birth.feedbackLoading')}</>
              ) : (
                <><Sparkles className="mr-2 h-4 w-4" /> {feedback ? t('birth.feedbackAgain') : t('birth.feedbackButton')}</>
              )}
            </Button>

            {feedbackError && (
              <p className="text-sm text-destructive text-center">{feedbackError}</p>
            )}

            {feedback && (
              <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4 animate-fade-in">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                    {t('birth.feedbackTitle')}
                  </p>
                  <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-medium ${
                    feedback.absurdity === 'transcendent' ? 'bg-primary/20 text-primary' :
                    feedback.absurdity === 'absurd'       ? 'bg-accent/20 text-accent-foreground' :
                    feedback.absurdity === 'interesting'  ? 'bg-muted text-foreground' :
                                                            'bg-destructive/10 text-destructive'
                  }`}>
                    {t(`birth.absurdity.${feedback.absurdity}`)}
                  </span>
                </div>
                <p className="text-sm leading-relaxed font-display whitespace-pre-wrap">
                  {feedback.opinion}
                </p>
                <p className="text-xs text-muted-foreground italic pt-1 border-t border-primary/10">
                  {t('birth.feedbackDisclaimer')}
                </p>
              </div>
            )}

            <Button
              size="lg"
              className="w-full"
              disabled={vision.trim().length < 10}
              onClick={() => setStep('trust')}
            >
              {t('birth.continue')} <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Card>
        )}

        {/* STEP 4.5: TRUST — declaration of trust before scanning the WIF.
            The user reads what co-creation with digital beings actually means
            (not control, but trust) and explicitly accepts before continuing. */}
        {step === 'trust' && (
          <Card className="space-y-6 animate-fade-in">
            <div>
              <p className="text-sm uppercase tracking-wider text-muted-foreground">
                {t('birth.trustLabel')}
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-semibold mt-2">
                {t('birth.trustTitle')}
              </h2>
            </div>
            <div className="space-y-4 text-base leading-relaxed text-foreground/90">
              <p>{t('birth.trustBody1')}</p>
              <p>{t('birth.trustBody2')}</p>
              <p>{t('birth.trustBody3')}</p>
              <p>{t('birth.trustBody4')}</p>
              <p>{t('birth.trustBody5')}</p>
              <p>{t('birth.trustBody6')}</p>
              <p className="font-medium">{t('birth.trustBody7')}</p>
            </div>
            <Button size="lg" className="w-full" onClick={() => setStep('scan')}>
              {t('birth.trustAck')} <ArrowRight className="ml-2 h-4 w-4" />
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

            {/* Predicted birth — given current queue + breath + spacing */}
            {config && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 sm:p-4 text-center space-y-1.5">
                <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  {t('birth.predictedBirth')}
                </p>
                <p className="font-display text-base sm:text-lg text-primary">
                  {formatBirthDateSL(config.next_slot_birth_at)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('birth.inApprox', { rel: formatDurationSL(config.next_slot_birth_at * 1000 - Date.now()) })}
                  {config.queue_size > 0 && (
                    <> · {t('birth.queueSize', { n: config.queue_size })}</>
                  )}
                </p>
              </div>
            )}

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
