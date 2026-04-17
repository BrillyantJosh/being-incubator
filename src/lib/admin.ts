// Admin identity for the incubator's settings & queue pages.
// Only this hex sees the admin link in the dashboard, and only this hex
// is accepted by /api/admin/* on the server side.
export const ADMIN_HEX = '56e8670aa65491f8595dc3a71c94aa7445dcdca755ca5f77c07218498a362061';

export function isAdmin(hex: string | undefined | null): boolean {
  if (!hex) return false;
  return hex.toLowerCase() === ADMIN_HEX;
}

// Format ms as the most natural unit + value pair for the settings UI.
// e.g. 732_000 → { value: 12.2, unit: 'minutes' }, 86400_000 → { value: 1, unit: 'days' }.
export function msToBest(ms: number): { value: number; unit: 'seconds' | 'minutes' | 'hours' | 'days' } {
  if (ms >= 86400_000 && ms % 86400_000 === 0) return { value: ms / 86400_000, unit: 'days' };
  if (ms >= 3600_000  && ms % 3600_000  === 0) return { value: ms / 3600_000,  unit: 'hours' };
  if (ms >= 60_000    && ms % 60_000    === 0) return { value: ms / 60_000,    unit: 'minutes' };
  return { value: Math.round(ms / 1000),       unit: 'seconds' };
}

export function unitToMs(value: number, unit: 'seconds' | 'minutes' | 'hours' | 'days'): number {
  switch (unit) {
    case 'seconds': return Math.round(value * 1000);
    case 'minutes': return Math.round(value * 60_000);
    case 'hours':   return Math.round(value * 3600_000);
    case 'days':    return Math.round(value * 86400_000);
  }
}

// Pleasant Slovenian formatter for "v X" (in N minutes / hours / days).
export function formatDurationSL(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = m / 60;
  if (h < 24) {
    const hr = Math.round(h * 10) / 10;
    return Number.isInteger(hr) ? `${hr} h` : `${hr.toFixed(1)} h`;
  }
  const d = h / 24;
  const dr = Math.round(d * 10) / 10;
  return Number.isInteger(dr) ? `${dr} dni` : `${dr.toFixed(1)} dni`;
}

// Pleasant date+time formatter — Slovenian locale.
export function formatBirthDateSL(epoch_s: number): string {
  const d = new Date(epoch_s * 1000);
  return d.toLocaleString('sl-SI', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
