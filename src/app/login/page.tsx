'use client';

/**
 * Sign-in page. Lives outside the `(app)` shell so there is no sidebar or header.
 * Split-screen editorial: a dark cinematic brand panel on the left, a floating
 * sign-in card on the right. On success the user lands on `/dashboard` (or the
 * `next` path the proxy saved when it bounced them here).
 *
 * "Remember username" only persists the username in this browser's localStorage
 * so the field is prefilled next visit — the session itself stays 12h either way.
 */

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import {
  IconAlertTriangle,
  IconEye,
  IconEyeOff,
  IconFileAudio,
  IconFileImage,
  IconFileVideo,
  IconLock,
  IconShield,
  IconUser,
} from '@/components/ui/icons';

const REMEMBER_KEY = 'archive-tracker.username';

const FORMATS = [
  { icon: IconFileImage, label: 'Photo' },
  { icon: IconFileVideo, label: 'Video' },
  { icon: IconFileAudio, label: 'Audio' },
] as const;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/dashboard';

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill a remembered login (username or email) from this browser.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(REMEMBER_KEY);
      if (saved) {
        setIdentifier(saved);
        setRemember(true);
      }
    } catch {
      // Private mode etc. — sign-in works fine without remembering.
    }
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await signIn('credentials', {
        identifier: identifier.trim(),
        password,
        redirect: false,
      });
      if (!result || result.error) {
        setError('Wrong username/email or password.');
        return;
      }
      try {
        if (remember) {
          window.localStorage.setItem(REMEMBER_KEY, identifier.trim());
        } else {
          window.localStorage.removeItem(REMEMBER_KEY);
        }
      } catch {
        // Non-fatal — the sign-in already succeeded.
      }
      router.push(next);
      router.refresh();
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const fieldClass = (hasError: boolean) =>
    [
      'flex h-12 items-center gap-2.5 rounded-[10px] border bg-surface px-3.5 transition-all',
      hasError
        ? 'border-danger'
        : 'border-line focus-within:border-accent focus-within:ring-4 focus-within:ring-accent-soft',
    ].join(' ');

  const inputClass =
    'login-field-input h-full w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-4';

  const iconClass = (hasError: boolean) =>
    `flex-shrink-0 transition-colors ${hasError ? 'text-danger' : 'text-ink-4 group-focus-within:text-accent'}`;

  const failed = error !== null;

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel — compact banner on mobile, full cinematic column on desktop. */}
      <section className="flex flex-col bg-rail px-6 py-5 sm:px-10 lg:min-h-dvh lg:justify-between lg:px-14 lg:py-12">
        <div className="login-enter flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] bg-accent">
            <span className="text-[13px] font-semibold tracking-[0.03em] text-white">SA</span>
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-semibold text-rail-text-strong">
              Sarangpur Archive
            </p>
            <p className="font-mono text-[10.5px] tracking-[0.14em] text-rail-muted uppercase">
              Archive Program
            </p>
          </div>
        </div>

        <div className="login-enter-late mt-8 hidden max-w-[440px] lg:block">
          <div className="h-px w-12 bg-accent-bright" aria-hidden="true" />
          <h1 className="mt-6 font-display text-[44px] leading-[1.08] font-medium text-white">
            Every frame of Sarangpur, preserved.
          </h1>
          <p className="mt-5 max-w-[380px] text-[14.5px] leading-relaxed text-rail-text">
            One register for every photo, video and audio lot — from intake
            through decision, digitization and return.
          </p>

          <ul className="mt-10 flex gap-3">
            {FORMATS.map(({ icon: FormatIcon, label }) => (
              <li
                key={label}
                className="flex flex-1 items-center gap-2.5 rounded-[10px] border border-rail-line bg-rail-raised px-3.5 py-3"
              >
                <FormatIcon size={17} className="flex-shrink-0 text-accent-tint" />
                <span className="text-[13px] font-medium text-rail-text-strong">{label}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="login-enter-late mt-8 hidden font-mono text-[11px] tracking-[0.08em] text-rail-muted uppercase lg:block">
          Internal tool — staff access only
        </p>
      </section>

      {/* Sign-in panel. */}
      <section className="relative flex items-center justify-center overflow-hidden bg-canvas px-6 py-10 sm:px-10 lg:py-12">
        <div
          className="pointer-events-none absolute -top-24 right-[-120px] h-[320px] w-[320px] rounded-full bg-accent-soft blur-3xl"
          aria-hidden="true"
        />
        <div className="login-enter-late relative w-full max-w-[400px]">
          <h2 className="text-[26px] font-semibold tracking-[-0.01em] text-ink">Welcome back</h2>
          <p className="mt-1.5 text-[14px] text-ink-3">Sign in to the Archive Tracker.</p>

          <div className="mt-7 rounded-[20px] border border-line bg-surface p-6 shadow-lift sm:p-7">
            <form onSubmit={onSubmit}>
              <label className="block text-[13.5px] font-medium text-ink-2" htmlFor="identifier">
                Username or email
              </label>
              <div className={`group mt-1.5 ${fieldClass(failed)}`}>
                <IconUser size={17} className={iconClass(failed)} />
                <input
                  id="identifier"
                  className={inputClass}
                  autoComplete="username"
                  autoFocus
                  placeholder="e.g. s.dave or you@example.org"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                />
              </div>

              <label
                className="mt-5 block text-[13.5px] font-medium text-ink-2"
                htmlFor="password"
              >
                Password
              </label>
              <div className={`group mt-1.5 ${fieldClass(failed)}`}>
                <IconLock size={17} className={iconClass(failed)} />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className={inputClass}
                  autoComplete="current-password"
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="flex h-9 w-9 flex-shrink-0 cursor-pointer items-center justify-center rounded-[8px] border-0 bg-transparent text-ink-3 transition-colors hover:text-ink"
                >
                  {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                </button>
              </div>

              <label
                htmlFor="remember"
                className="mt-4 flex cursor-pointer items-center gap-2.5 text-[13.5px] text-ink-2"
              >
                <input
                  id="remember"
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 flex-shrink-0 cursor-pointer rounded accent-accent"
                />
                Remember my login on this device
              </label>

              {error && (
                <p
                  role="alert"
                  className="mt-4 flex items-start gap-2 rounded-[10px] border border-danger-line bg-danger-bg px-3.5 py-2.5 text-[13.5px] text-danger"
                >
                  <IconAlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="mt-6 flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] border-0 bg-gradient-to-b from-accent to-accent-hover text-[15px] font-semibold text-white shadow-accent transition-all hover:brightness-110 disabled:cursor-wait disabled:opacity-60 disabled:hover:brightness-100"
              >
                {busy && (
                  <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                    aria-hidden="true"
                  />
                )}
                {busy ? 'Signing in' : 'Sign in'}
              </button>
            </form>

            <p className="mt-5 border-t border-line-soft pt-4 text-center text-[12.5px] text-ink-3">
              Internal tool. Ask an admin for an account.
            </p>
          </div>

          <div className="mt-4 flex items-start gap-3 rounded-[14px] border border-line bg-surface px-4 py-3.5 shadow-panel">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[8px] bg-accent-soft">
              <IconShield size={16} className="text-accent" />
            </span>
            <p className="text-[12.5px] leading-relaxed text-ink-3">
              Locked out or need an account? Accounts are created by an admin —
              ask your lead reviewer.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
