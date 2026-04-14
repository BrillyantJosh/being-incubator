import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function shortHex(hex: string, n = 8): string {
  if (!hex) return '';
  return `${hex.slice(0, n)}…${hex.slice(-n)}`;
}
