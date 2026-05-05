import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date) {
  const d = new Date(date);
  if (isNaN(d.getTime())) return "N/A";
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

export function getNormalizedLocation(loc: string | undefined | null) {
  if (!loc) return '';
  const s = String(loc).trim();
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  if (isEmail) return '';
  
  // Replace hyphens and multiple spaces with a single space for cross-consistency
  const lower = s.toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (lower === 'unspecified' || lower === 'unknown' || lower === 'n/a' || lower === '') return '';
  
  // Title case for consistency
  return lower.split(' ').map(word => {
    if (word.length === 0) return '';
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' ');
}

export function normalizeId(id: any) {
  if (!id) return '';
  const s = id.toString().trim().toLowerCase();
  if (/^\d+$/.test(s)) return parseInt(s, 10).toString();
  return s;
}
