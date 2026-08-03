/**
 * Defensive formatters.
 *
 * Requirement 6 means these receive genuinely broken values — nulls, negative
 * numbers, strings where numbers belong. They never throw and never invent a
 * plausible-looking substitute; unusable input returns an explicit marker the
 * UI renders as a fault, not as data.
 */

export const UNRENDERABLE = '—';

export function formatMoney(value: unknown): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return UNRENDERABLE;
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function isRenderableMoney(value: unknown): value is number {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return UNRENDERABLE;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return UNRENDERABLE;

  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return UNRENDERABLE;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return UNRENDERABLE;
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

/** Renders any unknown value as inspectable text for a fault panel. */
export function describeRawValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '[uninspectable object]';
    }
  }
  return String(value);
}
