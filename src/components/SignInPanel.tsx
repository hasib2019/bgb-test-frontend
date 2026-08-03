'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

/**
 * Sign-in with one-click demo accounts.
 *
 * The quick-switch buttons exist so the concurrency and RBAC behaviour can be
 * demonstrated live: open two browsers, sign in as Alice and Bob, and race them
 * against the same lot.
 */
const DEMO_ACCOUNTS = [
  { label: 'Alice (standard)', email: 'alice@auction.test', role: 'USER' as const },
  { label: 'Bob (standard)',   email: 'bob@auction.test',   role: 'USER' as const },
  { label: 'Carla (standard)', email: 'carla@auction.test', role: 'USER' as const },
  { label: 'Amara (admin)',    email: 'admin@auction.test', role: 'ADMIN' as const },
];

export function SignInPanel() {
  const { login, error } = useAuth();
  const [email, setEmail] = useState('alice@auction.test');
  const [password, setPassword] = useState('password123');
  const [busy, setBusy] = useState(false);

  async function submit(withEmail = email) {
    setBusy(true);
    try {
      await login(withEmail, password);
    } catch {
      /* surfaced via `error` from the auth context */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900/70 p-4">
      <h2 className="text-sm font-semibold text-ink-200">Sign in to bid</h2>
      <p className="mt-0.5 text-xs text-ink-500">
        Seeded accounts all use the password <code className="text-ink-400">password123</code>
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="mt-3 flex flex-wrap gap-2"
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email"
          aria-label="Email"
          className="min-w-[190px] flex-1 rounded-lg border border-ink-700 bg-ink-950/80 px-3 py-1.5
            text-sm text-ink-200 placeholder:text-ink-600 focus:border-brass-500/60
            focus:outline-none focus:ring-2 focus:ring-brass-500/30"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          aria-label="Password"
          className="min-w-[150px] flex-1 rounded-lg border border-ink-700 bg-ink-950/80 px-3 py-1.5
            text-sm text-ink-200 placeholder:text-ink-600 focus:border-brass-500/60
            focus:outline-none focus:ring-2 focus:ring-brass-500/30"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-brass-500 px-4 py-1.5 text-sm font-semibold text-ink-950
            transition hover:bg-brass-400 disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {DEMO_ACCOUNTS.map((account) => (
          <button
            key={account.email}
            type="button"
            disabled={busy}
            onClick={() => {
              setEmail(account.email);
              void submit(account.email);
            }}
            className={`rounded-md border px-2 py-1 text-[11px] font-medium transition disabled:opacity-50 ${
              account.role === 'ADMIN'
                ? 'border-brass-500/40 bg-brass-500/10 text-brass-300 hover:bg-brass-500/20'
                : 'border-ink-700 text-ink-400 hover:border-ink-500 hover:text-ink-200'
            }`}
          >
            {account.label}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
