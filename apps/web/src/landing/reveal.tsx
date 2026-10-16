'use client';

import { useEffect } from 'react';

/** How far into the window a block must come before it rises (a tenth of it, 10% from the edge). */
const OBSERVER: IntersectionObserverInit = { rootMargin: '0px 0px -10% 0px', threshold: 0.1 };

/**
 * The landing's scroll reveal, once per block: marks the page `data-reveal-ready` (the CSS hides
 * not-yet-seen `[data-reveal]` blocks only then, so without JavaScript nothing is ever hidden)
 * and sets `data-revealed` on each block as it first comes into view. Under reduced motion the
 * CSS does nothing. Renders nothing.
 */
export function Reveal() {
  useEffect(() => {
    const page = document.querySelector<HTMLElement>('.landing');
    if (page === null || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.setAttribute('data-revealed', '');
        observer.unobserve(entry.target);
      }
    }, OBSERVER);
    for (const block of page.querySelectorAll('[data-reveal]')) observer.observe(block);
    page.setAttribute('data-reveal-ready', '');
    return () => observer.disconnect();
  }, []);
  return null;
}
