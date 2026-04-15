import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useMemo } from 'react';
import { Lang, LANGS, normaliseLang, t as translate } from '@/lib/i18n';
import { useAuth } from '@/contexts/AuthContext';

const STORAGE_KEY = 'being_incubator_lang';

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const LangContext = createContext<LangContextValue | null>(null);

function readStoredLang(): Lang | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && (LANGS as string[]).includes(raw)) return raw as Lang;
  } catch {
    // ignore
  }
  return null;
}

function initialLang(profileLang?: string): Lang {
  const stored = readStoredLang();
  if (stored) return stored;
  if (profileLang) return normaliseLang(profileLang);
  if (typeof navigator !== 'undefined' && navigator.language) {
    return normaliseLang(navigator.language);
  }
  return 'en';
}

export function LangProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [lang, setLangState] = useState<Lang>(() => initialLang(undefined));

  // When session arrives (or changes), prefer profileLang — but never overwrite
  // an explicit user choice stored in localStorage.
  useEffect(() => {
    if (!session?.profileLang) return;
    const stored = readStoredLang();
    if (stored) return;
    const next = normaliseLang(session.profileLang);
    setLangState(next);
  }, [session?.profileLang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo<LangContextValue>(
    () => ({
      lang,
      setLang,
      t: (key, vars) => translate(lang, key, vars),
    }),
    [lang, setLang],
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useT() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useT must be used within LangProvider');
  return ctx;
}
