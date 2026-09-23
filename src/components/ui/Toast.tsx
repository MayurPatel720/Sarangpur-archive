'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { IconAlertCircle, IconCheckCircle, IconInfoCircle, IconX } from './icons';

export type ToastTone = 'success' | 'error' | 'info';

type ToastItem = {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  duration: number;
};

type ToastApi = {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  dismiss: (id: string) => void;
};

const ToastCtx = createContext<ToastApi | null>(null);

const TONE_STYLES: Record<ToastTone, { rail: string; icon: string; Icon: typeof IconCheckCircle }> = {
  success: {
    rail: 'bg-good-mark',
    icon: 'text-good-mark',
    Icon: IconCheckCircle,
  },
  error: {
    rail: 'bg-danger-mark',
    icon: 'text-danger-mark',
    Icon: IconAlertCircle,
  },
  info: {
    rail: 'bg-accent',
    icon: 'text-accent',
    Icon: IconInfoCircle,
  },
};

function nextId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setItems((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (tone: ToastTone, title: string, description?: string) => {
      const id = nextId();
      const duration = tone === 'error' ? 6000 : 3500;
      setItems((list) => {
        const next = [...list, { id, tone, title, description, duration }];
        return next.slice(-4);
      });
      const timer = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const t of map.values()) clearTimeout(t);
      map.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, description) => push('success', title, description),
      error: (title, description) => push('error', title, description),
      info: (title, description) => push('info', title, description),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[200] flex flex-col items-center gap-2.5 p-4 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:items-end sm:p-0"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {items.map((t) => (
          <ToastCard key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const { rail, icon, Icon } = TONE_STYLES[item.tone];

  return (
    <div
      role={item.tone === 'error' ? 'alert' : 'status'}
      className="pointer-events-auto relative w-full max-w-[360px] overflow-hidden rounded-[10px] border border-line bg-surface shadow-lift"
      style={{ animation: 'toast-in 180ms ease-out' }}
    >
      <span className={`absolute inset-y-0 left-0 w-[4px] ${rail}`} aria-hidden />
      <div className="flex items-start gap-3 py-3 pl-4 pr-3">
        <span className={`mt-0.5 flex-shrink-0 ${icon}`} aria-hidden>
          <Icon size={16} />
        </span>
        <div className="min-w-0 flex-1 flex flex-col gap-0.5">
          <p className="m-0 text-[13px] font-semibold leading-snug text-ink">{item.title}</p>
          {item.description ? (
            <p className="m-0 text-[12px] leading-snug text-ink-3">{item.description}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="inline-flex h-7 w-7 flex-shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-ink-4 transition-colors hover:bg-surface-sunken hover:text-ink"
        >
          <IconX size={13} />
        </button>
      </div>
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          div[role="status"], div[role="alert"] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) {
    return {
      success() {},
      error() {},
      info() {},
      dismiss() {},
    };
  }
  return ctx;
}
