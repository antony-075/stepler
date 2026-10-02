'use client';

import { cn } from '@stepler/ui/lib/utils';
import { useEffect, useRef, type ReactNode } from 'react';

/** How much of the section must be on screen before it reveals. */
const THRESHOLD = 0.25;

/**
 * A once-only reveal for one section (DESIGN-SYSTEM.md §8: one orchestrated moment, never on
 * every scroll). The server HTML is the finished state, so without JavaScript, under reduced
 * motion, or when the section is already on screen at load, nothing moves. Otherwise the section
 * is `data-reveal="armed"` (children hide through `group-data-[reveal=armed]/reveal:` classes)
 * until it first scrolls into view, then `shown` (they play their entrance once) for good.
 */
export function Reveal({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (element === null || typeof IntersectionObserver === 'undefined') return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = element.getBoundingClientRect();
    if (rect.top < window.innerHeight) return;

    element.dataset.reveal = 'armed';
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        element.dataset.reveal = 'shown';
        observer.disconnect();
      },
      { threshold: THRESHOLD },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} data-slot="reveal" className={cn('group/reveal', className)}>
      {children}
    </div>
  );
}
