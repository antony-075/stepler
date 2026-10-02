import { formatFrameNumber } from '@stepler/ui/components/empty-state';
import { cn } from '@stepler/ui/lib/utils';
import { Play } from 'lucide-react';
import type { CSSProperties } from 'react';

type SheetFrame = {
  number: number;
  time: string;
  kind: 'photo' | 'video' | 'document';
  /** Light and dark gradient stops of the tonal placeholder (photos and the video). */
  tone?: readonly [light: [string, string], dark: [string, string]];
  /** The one frame the wax pencil circles on load. */
  marked?: boolean;
};

// Tonal placeholders taken from the direction C artboards (C-guest, C-guest-dark): no people, no
// stock photos. The only raw colours in the app; `light-dark()` follows the page's
// `color-scheme`, so an explicit theme choice wins over the OS. Where `light-dark()` is not
// supported the inline style is dropped and the frame stays `--muted`.
const FRAMES: readonly SheetFrame[] = [
  {
    number: 1,
    time: '19:42',
    kind: 'photo',
    tone: [
      ['#D2C3BA', '#B9A79C'],
      ['#5C4C45', '#463A35'],
    ],
  },
  {
    number: 2,
    time: '19:45',
    kind: 'photo',
    tone: [
      ['#CCD0C7', '#B4B9AF'],
      ['#4A5450', '#3A423E'],
    ],
  },
  {
    number: 3,
    time: '19:51',
    kind: 'video',
    tone: [
      ['#9FA59D', '#888F86'],
      ['#59605A', '#454B46'],
    ],
  },
  {
    number: 4,
    time: '20:02',
    kind: 'photo',
    tone: [
      ['#BEC4C9', '#A3AAB0'],
      ['#3E4651', '#30363F'],
    ],
  },
  {
    number: 5,
    time: '20:09',
    kind: 'photo',
    tone: [
      ['#C7C1D3', '#ADA6BF'],
      ['#4C4459', '#3A3446'],
    ],
  },
  {
    number: 6,
    time: '20:14',
    kind: 'photo',
    marked: true,
    tone: [
      ['#D9D0C2', '#C3B8A8'],
      ['#5A5046', '#463E36'],
    ],
  },
  { number: 7, time: '20:18', kind: 'document' },
  {
    number: 8,
    time: '20:25',
    kind: 'photo',
    tone: [
      ['#ADB3A9', '#959C91'],
      ['#4A5450', '#3A423E'],
    ],
  },
];

function toneStyle(tone: SheetFrame['tone']): CSSProperties | undefined {
  if (tone === undefined) return undefined;
  const [[lightFrom, lightTo], [darkFrom, darkTo]] = tone;
  return {
    backgroundImage: `linear-gradient(170deg, light-dark(${lightFrom}, ${darkFrom}), light-dark(${lightTo}, ${darkTo}))`,
  };
}

// The hand-drawn circle of the C artboards; it starts and ends slightly apart, like a pencil.
// The stroke scales with the frame: `vector-effect: non-scaling-stroke` would also take the dash
// pattern to screen space and break the `pathLength="1"` draw, so the width (in viewBox units)
// steps with the sheet's width instead, to stay about 2.5px (§2.5).
const CIRCLE =
  'M60 3 C84 5 98 22 97 49 C96 77 77 97 49 96 C22 95 3 77 4 50 C5 24 22 5 49 4 C57 4 64 6 69 9';

type SignInSheetProps = {
  /** The accessible name of the whole illustration. */
  label: string;
  /** The document type shown inside the document frame, e.g. "PDF". */
  documentKind: string;
  className?: string;
};

/**
 * The sign-in illustration (DESIGN-SYSTEM.md §6.9): a contact sheet of eight tonal frames with
 * their number and time, one circled in wax pencil once on load (400ms after a 300ms delay;
 * drawn at once under reduced motion). One image for assistive technology. A one-off: the
 * library `PencilMark` and `FrameGrid` arrive with migration step 7.
 */
export function SignInSheet({ label, documentKind, className }: SignInSheetProps) {
  return (
    <div role="img" aria-label={label} className={cn('@container', className)}>
      <div className="grid grid-cols-4 gap-px overflow-hidden rounded-sheet border bg-border">
        {FRAMES.map((frame) => (
          <div
            key={frame.number}
            className="flex min-w-0 flex-col gap-1 bg-card p-1.5 pb-1 @lg:gap-1.5 @lg:p-2 @lg:pb-1.5"
          >
            <div
              className="relative grid aspect-square place-items-center rounded-frame bg-muted"
              style={toneStyle(frame.tone)}
            >
              {frame.kind === 'video' && (
                <Play className="size-4 fill-current text-white @lg:size-5" strokeWidth={0} />
              )}
              {frame.kind === 'document' && (
                <span className="font-mono text-xs font-medium text-link @lg:text-sm">
                  {documentKind}
                </span>
              )}
              {frame.marked === true && (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className="pointer-events-none absolute -top-1 -left-1 size-[calc(100%+0.5rem)] overflow-visible @lg:-top-1.5 @lg:-left-1.5 @lg:size-[calc(100%+0.75rem)]"
                >
                  <path
                    data-pencil-mark=""
                    d={CIRCLE}
                    pathLength={1}
                    fill="none"
                    stroke="var(--pencil)"
                    strokeLinecap="round"
                    className="[stroke-dasharray:1] [stroke-width:3] @md:[stroke-width:2.25] @xl:[stroke-width:1.65] motion-safe:animate-[pencil-draw_400ms_var(--ease-out)_300ms_both]"
                  />
                </svg>
              )}
            </div>
            <div className="flex items-baseline justify-between gap-1 type-data text-muted-foreground">
              <span className="text-foreground">{formatFrameNumber(frame.number)}</span>
              <span className="@max-[22rem]:hidden">{frame.time}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
