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
    request<{
      being: null | { name: string; npub: string; domain: string; birthed_at: number };
      beings: Array<{ name: string; npub: string; domain: string; language: string; birthed_at: number }>;
      embryo: null | { id: string; name: string; domain: string; conceived_at: number; birth_at: number; status: string };
      can_create: boolean;
    }>(`/api/beings?owner=${encodeURIComponent(ownerHex)}`),

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
    request<{
      ok: true;
      embryo_id: string;
      name: string;
      domain: string;
      conceived_at: number;
      birth_at: number;
      gestation_ms: number;
      queue_position: number;
    }>('/api/beings/birth', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getEmbryo: (id: string) =>
    request<{
      id: string;
      name: string;
      domain: string;
      npub: string;
      language: string;
      vision: string;
      conceived_at: number;
      birth_at: number;
      birthed_at: number | null;
      status: 'gestating' | 'birthing' | 'birthed' | 'failed';
      progress: number;
      time_remaining_ms: number;
      queue_position: number;
      event_id: string | null;
      birth_error: string | null;
      now: number;
    }>(`/api/embryo/${encodeURIComponent(id)}`),

  getEmbryoThoughts: (id: string, since = 0) =>
    request<{
      embryo_id: string;
      name: string;
      language: string | null;
      count: number;
      thoughts: Array<{
        id: number;
        created_at: number;
        phase: 'sensation' | 'fragment' | 'forming' | 'questioning' | 'recognition';
        progress: number;
        content: string;
      }>;
    }>(`/api/embryo/${encodeURIComponent(id)}/thoughts${since ? `?since=${since}` : ''}`),

  abandonEmbryo: (id: string, owner_hex: string) =>
    request<{ ok: true }>(`/api/embryo/${encodeURIComponent(id)}/abandon`, {
      method: 'POST',
      body: JSON.stringify({ owner_hex }),
    }),

  incubatorVersion: () =>
    request<{
      version: string;
      sha: string | null;
      date: string | null;
      branch: string | null;
      deployed_at: string | null;
    }>('/api/incubator-version'),

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

  // Public timings + next-slot ETA used by the birth flow.
  incubatorConfig: () =>
    request<{
      breath_duration_ms: number;
      birth_spacing_ms: number;
      next_slot_birth_at: number;
      queue_size: number;
      server_now: number;
    }>('/api/incubator-config'),

  // Admin endpoints — admin_hex is checked server-side against the hardcoded
  // ADMIN_HEX. A wrong/missing hex returns 401/403.
  adminGetSettings: (admin_hex: string) =>
    request<{
      breath_duration_ms: number;
      birth_spacing_ms: number;
      updated_at: number | null;
      updated_by_hex: string | null;
    }>(`/api/admin/settings?admin_hex=${encodeURIComponent(admin_hex)}`),

  adminUpdateSettings: (admin_hex: string, breath_duration_ms: number, birth_spacing_ms: number) =>
    request<{
      breath_duration_ms: number;
      birth_spacing_ms: number;
      updated_at: number;
      updated_by_hex: string;
    }>('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify({ admin_hex, breath_duration_ms, birth_spacing_ms }),
    }),

  adminGetQueue: (admin_hex: string) =>
    request<{
      embryos: Array<{
        id: string;
        owner_hex: string;
        name: string;
        domain: string;
        npub: string;
        language: string | null;
        vision: string | null;
        conceived_at: number;
        birth_at: number;
        status: string;
        progress: number;
        time_remaining_s: number;
        owner_name: string | null;
        owner_npub: string | null;
        owner_picture: string | null;
      }>;
      queue_size: number;
      settings: { breath_duration_ms: number; birth_spacing_ms: number };
      next_slot_birth_at: number;
      server_now: number;
    }>(`/api/admin/queue?admin_hex=${encodeURIComponent(admin_hex)}`),
};
