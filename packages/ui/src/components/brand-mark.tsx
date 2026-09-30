import type { ComponentProps } from 'react';

/** The Stepler mark: a staple pinning a small stack. Decorative; label the link around it. */
function BrandMark(props: ComponentProps<'svg'>) {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true" {...props}>
      <rect width="36" height="36" rx="10" fill="var(--primary)" />
      <rect
        x="9"
        y="17"
        width="18"
        height="11"
        rx="2.5"
        fill="var(--primary-foreground)"
        opacity=".35"
        transform="rotate(-6 18 22)"
      />
      <rect x="9" y="15" width="18" height="12" rx="2.5" fill="var(--primary-foreground)" />
      <path
        d="M11.5 18.5V10.5h13v8"
        fill="none"
        stroke="var(--accent-warm)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export { BrandMark };
