import { VALIDATION_LIMITS } from '../types';

export function formatRelativeTime(timestampMs: number): string {
  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestampMs) / 1000));
  if (diffSeconds < 60) return 'Just now';
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Intl.DateTimeFormat('en-MY', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(timestampMs));
}

export function formatCoordinates(lat: number, lng: number): string {
  return `${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E`;
}

export function clampKlLatLng(lat: number, lng: number): { lat: number; lng: number } {
  return {
    lat: Math.min(VALIDATION_LIMITS.LAT_MAX, Math.max(VALIDATION_LIMITS.LAT_MIN, Number(lat.toFixed(5)))),
    lng: Math.min(VALIDATION_LIMITS.LNG_MAX, Math.max(VALIDATION_LIMITS.LNG_MIN, Number(lng.toFixed(5)))),
  };
}

export function isWithinKlBounds(lat: number, lng: number): boolean {
  return (
    lat >= VALIDATION_LIMITS.LAT_MIN &&
    lat <= VALIDATION_LIMITS.LAT_MAX &&
    lng >= VALIDATION_LIMITS.LNG_MIN &&
    lng <= VALIDATION_LIMITS.LNG_MAX
  );
}
