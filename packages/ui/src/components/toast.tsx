'use client';

import { CircleAlert, CircleCheck, Info, TriangleAlert, X, type LucideIcon } from 'lucide-react';
import { Toast as ToastPrimitive } from 'radix-ui';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { focusRing } from '../lib/focus';
import { cn } from '../lib/utils';
import { closeButtonClassName } from './button';

/**
 * The colour of the state the thing is in now (DESIGN-SYSTEM.md §5.17): `success` when it works
 * (saved, created, resumed), `warning` when it is on hold and needs a later look (paused),
 * `info` when it is neutral or gone (archived, revoked, deleted), `error` when it failed.
 */
type ToastVariant = 'info' | 'success' | 'warning' | 'error';

type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
};

type ToastItem = Required<Pick<ToastInput, 'title' | 'variant' | 'durationMs'>> &
  Pick<ToastInput, 'description'> & { id: number; open: boolean };

const MAX_VISIBLE = 3;
const DEFAULT_DURATION_MS = 5000;
const ERROR_DURATION_MS = 8000;

type ToastContextValue = {
  toasts: ToastItem[];
  toast: (input: ToastInput) => void;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

type ToastProviderProps = {
  /** Spoken before each toast's text by screen readers (e.g. "Сповіщення"). */
  announcementLabel: string;
  children: ReactNode;
};

// Toast state lives in React context (not a global store) next to Radix's provider, which owns
// the timers, pause-on-hover/focus, swipe and the screen-reader announcement.
function ToastProvider({ announcementLabel, children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const toast = useCallback((input: ToastInput) => {
    const variant = input.variant ?? 'info';
    const item: ToastItem = {
      id: nextId.current++,
      title: input.title,
      description: input.description,
      variant,
      durationMs:
        input.durationMs ?? (variant === 'error' ? ERROR_DURATION_MS : DEFAULT_DURATION_MS),
      open: true,
    };
    // Closed toasts only stay long enough to play their exit animation; the oldest open ones
    // are dropped so at most MAX_VISIBLE are on screen.
    setToasts((current) => [...current.filter((t) => t.open), item].slice(-MAX_VISIBLE));
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.map((t) => (t.id === id ? { ...t, open: false } : t)));
  }, []);

  const value = useMemo(() => ({ toasts, toast, dismiss }), [toasts, toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider label={announcementLabel} swipeDirection="right">
        {children}
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

function useToastContext(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}

/**
 * Shows a short confirmation of a completed action. Errors the user must act on stay inline
 * (`Alert` or a field error); a toast is never their only copy.
 */
function useToast(): { toast: (input: ToastInput) => void } {
  const { toast } = useToastContext();
  return useMemo(() => ({ toast }), [toast]);
}

const ICONS: Record<ToastVariant, { icon: LucideIcon; className: string }> = {
  info: { icon: Info, className: 'text-link' },
  success: { icon: CircleCheck, className: 'text-success' },
  warning: { icon: TriangleAlert, className: 'text-warning' },
  error: { icon: CircleAlert, className: 'text-destructive' },
};

// Radix `foreground` toasts are announced assertively; only errors interrupt.
const ANNOUNCE_TYPE: Record<ToastVariant, 'foreground' | 'background'> = {
  info: 'background',
  success: 'background',
  warning: 'background',
  error: 'foreground',
};

/** Elements that toasts must not cover, such as a fixed bottom action bar. */
const AVOID_SELECTOR = '[data-toast-avoid]';

/**
 * Lifts the viewport above any fixed bottom element marked `data-toast-avoid`, so a toast never
 * covers the page's primary action. Active only while toasts are shown. It re-measures when the
 * set of open toasts changes, on window resize, when a watched bar is shown, hidden or resized
 * (ResizeObserver), and when bars mount or unmount (a MutationObserver on the body re-queries
 * them and re-observes).
 *
 * @param openKey the ids of the open toasts joined into a string; empty when none are open.
 */
function useAvoidOffset(openKey: string): number {
  const [offset, setOffset] = useState(0);

  useLayoutEffect(() => {
    if (!openKey) return;
    let bars: Element[] = [];
    const measure = () => {
      const tops = bars
        .map((element) => element.getBoundingClientRect())
        .filter((rect) => rect.height > 0 && rect.bottom >= window.innerHeight - 1)
        .map((rect) => rect.top);
      setOffset(tops.length ? Math.max(0, window.innerHeight - Math.min(...tops)) : 0);
    };
    const resizeObserver = new ResizeObserver(measure);
    const watchBars = () => {
      bars = Array.from(document.querySelectorAll(AVOID_SELECTOR));
      resizeObserver.disconnect();
      for (const bar of bars) resizeObserver.observe(bar);
      measure();
    };
    watchBars();
    // Only element additions/removals matter; attribute changes (like our own `bottom`) do not.
    const mutationObserver = new MutationObserver(watchBars);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', measure);
    return () => {
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [openKey]);

  return offset;
}

type ToasterProps = {
  /** Name of the notifications region (e.g. "Сповіщення"); `{hotkey}` is replaced with F8. */
  label: string;
  /** Accessible name of each toast's close button. */
  closeLabel: string;
  className?: string;
};

// Based on shadcn/ui (new-york) toast. Deviations: rendered from context by one `Toaster`,
// bottom-centre on phones (full width minus the 16px gutter, above the safe area) and
// bottom-right from `sm`, the popover surface (8px radius, `--shadow-popover`), a built-in icon
// per variant, a 44px close button, `error` toasts use Radix's `foreground` type (announced
// assertively), and motion is off under reduced motion: enter = fade + 8px rise (180ms), exit =
// fade (120ms).
function Toaster({ label, closeLabel, className }: ToasterProps) {
  const { toasts, dismiss } = useToastContext();
  const openKey = toasts
    .filter((t) => t.open)
    .map((t) => t.id)
    .join(',');
  const offset = useAvoidOffset(openKey);

  return (
    <>
      {toasts.map(({ id, title, description, variant, durationMs, open }) => {
        const { icon: Icon, className: iconClassName } = ICONS[variant];
        return (
          <ToastPrimitive.Root
            key={id}
            data-slot="toast"
            data-variant={variant}
            type={ANNOUNCE_TYPE[variant]}
            duration={durationMs}
            open={open}
            onOpenChange={(next) => {
              if (!next) dismiss(id);
            }}
            className={cn(
              'pointer-events-auto grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 rounded-control border bg-popover p-4 pr-2 text-sm text-popover-foreground shadow-popover [overflow-wrap:anywhere]',
              focusRing,
              'ease-out animation-duration-[var(--duration-base)] data-[state=closed]:animation-duration-[var(--duration-fast)]',
              'motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in motion-safe:data-[state=open]:slide-in-from-bottom-2',
              'motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out',
              // The swipe itself follows the finger; only the snap-back and the exit are animated.
              'data-[swipe=cancel]:translate-x-0 motion-safe:data-[swipe=cancel]:transition-transform data-[swipe=end]:translate-x-(--radix-toast-swipe-end-x) motion-safe:data-[swipe=end]:animate-out motion-safe:data-[swipe=end]:fade-out data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x) data-[swipe=move]:transition-none',
            )}
          >
            <Icon aria-hidden="true" className={cn('mt-px size-5 shrink-0', iconClassName)} />
            <div className="grid min-w-0 gap-1 pt-px">
              <ToastPrimitive.Title data-slot="toast-title" className="leading-5 font-semibold">
                {title}
              </ToastPrimitive.Title>
              {description ? (
                <ToastPrimitive.Description
                  data-slot="toast-description"
                  className="leading-5 text-muted-foreground"
                >
                  {description}
                </ToastPrimitive.Description>
              ) : null}
            </div>
            <ToastPrimitive.Close
              aria-label={closeLabel}
              className={cn(closeButtonClassName, '-my-3')}
            >
              <X aria-hidden="true" className="size-4" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        );
      })}
      <ToastPrimitive.Viewport
        data-slot="toast-viewport"
        label={label}
        style={{ bottom: offset }}
        className={cn(
          'pointer-events-none fixed inset-x-0 z-(--z-toast) m-0 flex max-h-dvh list-none flex-col gap-2 p-4 outline-none sm:left-auto sm:w-[420px] sm:max-w-full',
          // Above a bottom bar the bar already clears the safe area; only the gutter remains.
          { 'pb-[max(1rem,env(safe-area-inset-bottom))]': offset === 0 },
          className,
        )}
      />
    </>
  );
}

export { Toaster, ToastProvider, useToast, type ToastInput, type ToastVariant };
