import { cn } from '@stepler/ui/lib/utils';

const INTRO_TONE = { default: 'text-foreground-soft', inverse: 'text-white/75' } as const;

/** Every landing section's h2 (one scale for all, so the page reads as one), with its intro. */
export function SectionHeading({
  id,
  title,
  intro,
  tone = 'default',
  className,
}: {
  id: string;
  title: string;
  intro?: string;
  /** `inverse`: on the blue closing block. */
  tone?: 'default' | 'inverse';
  className?: string;
}) {
  return (
    <div data-reveal className={cn('grid max-w-[44rem] gap-4', className)}>
      <h2
        id={id}
        className="text-[clamp(1.875rem,1.3rem+2.2vw,3rem)] leading-[1.08] font-[660] tracking-[-0.026em] text-balance"
      >
        {title}
      </h2>
      {intro ? (
        <p className={cn('max-w-[52ch] text-lg leading-relaxed text-pretty', INTRO_TONE[tone])}>
          {intro}
        </p>
      ) : null}
    </div>
  );
}
