'use client';

import { useState } from 'react';
import { describeRawValue } from '@/lib/format';
import type { DataQuality } from '@/lib/types';

/**
 * REQUIREMENT 6 — the visible fallback state.
 *
 * Shows exactly what is wrong, field by field, with the offending raw value
 * available for inspection. The point is that a broken lot looks broken: no
 * substituted placeholder values, no quietly-omitted fields.
 */
export function DataQualityPanel({ quality, itemId }: { quality: DataQuality; itemId: string }) {
  const [expanded, setExpanded] = useState(false);

  if (quality.ok) return null;

  const hasCritical = quality.issues.some((i) => i.severity === 'critical');

  return (
    <div
      role="alert"
      data-testid={`data-quality-${itemId}`}
      className={`rounded-lg border px-3 py-2.5 ${
        hasCritical
          ? 'border-red-800/80 bg-red-950/40'
          : 'border-amber-800/70 bg-amber-950/30'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span aria-hidden="true" className={hasCritical ? 'text-red-400' : 'text-amber-400'}>
            {hasCritical ? '⛔' : '⚠'}
          </span>
          <h4
            className={`text-xs font-semibold uppercase tracking-wide ${
              hasCritical ? 'text-red-300' : 'text-amber-300'
            }`}
          >
            {hasCritical ? 'Corrupt data — bidding disabled' : 'Data quality warning'}
          </h4>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] transition ${
            hasCritical
              ? 'text-red-400 hover:bg-red-900/50'
              : 'text-amber-400 hover:bg-amber-900/40'
          }`}
        >
          {expanded ? 'hide raw' : 'raw'}
        </button>
      </div>

      <ul className="mt-2 space-y-1.5">
        {quality.issues.map((issue) => (
          <li key={`${issue.field}-${issue.code}`} className="text-xs leading-relaxed">
            <span
              className={`font-mono text-[10px] ${
                issue.severity === 'critical' ? 'text-red-400/80' : 'text-amber-400/80'
              }`}
            >
              {issue.code}
            </span>
            <p className={hasCritical ? 'text-red-200/85' : 'text-amber-200/85'}>{issue.message}</p>

            {expanded && (
              <pre className="mt-1 overflow-x-auto rounded bg-ink-950/70 px-2 py-1 font-mono text-[10px] text-ink-300">
                {issue.field} = {describeRawValue(issue.rawValue)}
              </pre>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
