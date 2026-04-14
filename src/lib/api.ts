async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

export const api = {
  profileLookup: (hex: string) =>
    request<{ name?: string; display_name?: string; picture?: string; lang?: string } | null>(
      '/api/profile-lookup',
      { method: 'POST', body: JSON.stringify({ hex }) },
    ),

  registerUser: (u: { hex: string; npub: string; walletId: string; name?: string; picture?: string }) =>
    request<{ ok: true }>('/api/users', { method: 'POST', body: JSON.stringify(u) }),

  getBeing: (ownerHex: string) =>
    request<{ being: null | {
      name: string; npub: string; domain: string; birthed_at: number;
    } }>(`/api/beings?owner=${encodeURIComponent(ownerHex)}`),

  birth: (payload: {
    owner_hex: string;
    name: string;
    language: string;
    vision: string;
    being_nsec: string;
    being_npub: string;
    being_hex_priv: string;
    being_hex_pub: string;
    being_wif?: string;
    being_wallet?: string;
  }) =>
    request<{ ok: true; domain: string; logs: string }>('/api/beings/birth', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  health: () => request<{ ok: true; beings: number; version: string }>('/health'),

  walletBalance: (address: string) =>
    request<{
      wallet_id: string; balance: number; confirmed: number; unconfirmed: number;
      status: 'active' | 'inactive' | 'error'; error?: string;
    }>(`/api/wallet/balance/${encodeURIComponent(address)}`),

  walletCheckRegistration: (wallet_id: string) =>
    request<{ success?: boolean; registered?: boolean; wallet?: { frozen?: boolean }; [k: string]: any }>(
      '/api/wallet/check-registration',
      { method: 'POST', body: JSON.stringify({ wallet_id }) },
    ),

  walletRegister: (wallet_id: string, nostr_id_hex: string) =>
    request<{ status?: string; message?: string; [k: string]: any }>(
      '/api/wallet/register',
      { method: 'POST', body: JSON.stringify({ wallet_id, nostr_id_hex }) },
    ),
};
