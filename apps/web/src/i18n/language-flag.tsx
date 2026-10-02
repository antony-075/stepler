import type { Locale } from './locales';

/**
 * A small flag beside a language's name in the language select: Ukraine for Ukrainian, the
 * United Kingdom for English. Inline SVG (emoji flags are letters on Windows). Decorative: the
 * name says the language.
 */
export function LanguageFlag({ locale }: { locale: Locale }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 60 40"
      className="h-3.5 w-[1.3125rem] shrink-0 rounded-[2px] ring-1 ring-foreground/15"
      preserveAspectRatio="none"
    >
      {locale === 'uk' ? (
        <>
          <rect width="60" height="20" fill="#0057B7" />
          <rect y="20" width="60" height="20" fill="#FFD700" />
        </>
      ) : (
        <>
          {/* The SVG's own box clips the diagonals. */}
          <g>
            <rect width="60" height="40" fill="#012169" />
            <path d="M0 0L60 40M60 0L0 40" stroke="#FFFFFF" strokeWidth="8" />
            <path d="M0 0L60 40M60 0L0 40" stroke="#C8102E" strokeWidth="3" />
            <path d="M30 0V40M0 20H60" stroke="#FFFFFF" strokeWidth="12" />
            <path d="M30 0V40M0 20H60" stroke="#C8102E" strokeWidth="7" />
          </g>
        </>
      )}
    </svg>
  );
}
