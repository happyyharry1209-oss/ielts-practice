import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(locale === 'zh-TW' ? 'zh-TW' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(locale === 'zh-TW' ? 'zh-TW' : 'en-GB', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function letterFor(index: number): string {
  return String.fromCharCode(65 + index);
}

export function bandColor(band: number | null | undefined): string {
  if (band == null) return 'text-slate-400';
  if (band >= 7.5) return 'text-emerald-600';
  if (band >= 6.5) return 'text-sky-600';
  if (band >= 5.5) return 'text-amber-600';
  return 'text-rose-600';
}

export function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/**
 * Resolve a public asset path against the Vite base URL.
 * GitHub Pages serves the app from /<repo>/, so "/audio/x.mp3" would 404.
 */
export function assetUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = import.meta.env.BASE_URL || '/';
  const prefix = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${prefix}${path.startsWith('/') ? path : `/${path}`}`;
}
