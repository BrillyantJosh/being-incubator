/**
 * Pulsing favicon — draws /logo.png onto a 32×32 canvas with a slow
 * breathing alpha cycle and rewrites the <link rel="icon"> href on a tick.
 *
 * Universal: works in every browser that supports canvas favicons
 * (Chrome ignores SMIL inside SVG favicons, so we go canvas instead).
 */

const TICK_MS = 80;          // ~12 fps, smooth enough for a slow pulse
const PERIOD_MS = 2400;      // one full breath every ~2.4s
const MIN_ALPHA = 0.45;      // never invisible — keep the shape readable
const MAX_ALPHA = 1.0;
const SIZE = 32;             // standard favicon size

let started = false;

export function startPulsingFavicon(src = '/logo.png') {
  if (started) return;
  started = true;

  if (typeof document === 'undefined') return;

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = src;

  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Remove static icon links so the dynamic one wins unambiguously.
    document.querySelectorAll('link[rel~="icon"]').forEach((el) => el.parentNode?.removeChild(el));

    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    document.head.appendChild(link);

    const startAt = performance.now();

    const tick = () => {
      const elapsed = performance.now() - startAt;
      // Smooth sine: 0 at edges, 1 at peak. Map to [MIN_ALPHA, MAX_ALPHA].
      const phase = (elapsed % PERIOD_MS) / PERIOD_MS;          // 0..1
      const wave = (1 - Math.cos(phase * 2 * Math.PI)) / 2;     // 0..1..0
      const alpha = MIN_ALPHA + (MAX_ALPHA - MIN_ALPHA) * wave;

      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, 0, 0, SIZE, SIZE);
      ctx.globalAlpha = 1;

      link.href = canvas.toDataURL('image/png');
    };

    tick();
    setInterval(tick, TICK_MS);
  };

  img.onerror = () => {
    // Image failed to load — leave existing static favicons as fallback.
    started = false;
  };
}
