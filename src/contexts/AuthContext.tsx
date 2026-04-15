import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { convertWifToIds, LanaIds } from '@/lib/crypto';
import { api } from '@/lib/api';

export interface Session extends LanaIds {
  profileName?: string;
  profileDisplayName?: string;
  profilePicture?: string;
  profileLang?: string;
  expiresAt: number;
}

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  login: (wif: string) => Promise<Session>;
  logout: () => void;
}

const SESSION_KEY = 'being_incubator_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8h

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const parsed: Session = JSON.parse(raw);
        if (parsed.expiresAt > Date.now()) setSession(parsed);
        else localStorage.removeItem(SESSION_KEY);
      }
    } catch {
      // ignore corrupted session
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (wif: string): Promise<Session> => {
    const ids = await convertWifToIds(wif);
    let profile: { name?: string; display_name?: string; picture?: string; lang?: string } | null = null;
    try {
      profile = await api.profileLookup(ids.nostrHexId);
    } catch (err) {
      console.warn('Profile lookup failed (non-fatal):', err);
    }
    const newSession: Session = {
      ...ids,
      profileName: profile?.name,
      profileDisplayName: profile?.display_name,
      profilePicture: profile?.picture,
      profileLang: profile?.lang,
      expiresAt: Date.now() + SESSION_TTL_MS,
    };
    try {
      await api.registerUser({
        hex: ids.nostrHexId,
        npub: ids.nostrNpubId,
        walletId: ids.walletId,
        name: profile?.display_name || profile?.name,
        picture: profile?.picture,
      });
    } catch (err) {
      console.warn('User registration failed (non-fatal):', err);
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(newSession));
    setSession(newSession);
    return newSession;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
  }, []);

  return <AuthContext.Provider value={{ session, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
