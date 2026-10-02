import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * The link above an admin page's title (`PageHeader` `back`): 14px/600 muted, 44px tall. A long
 * label (a collection title) is cut to one line; pass the full text as `title`. The max width
 * adds back the 6px pulled in by `-ml-1.5`, so a short label never truncates.
 */
export function BackLink({
  href,
  title,
  children,
}: {
  href: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      title={title}
      className={cn(
        '-ml-1.5 inline-flex min-h-11 max-w-[calc(100%+0.375rem)] items-center gap-1.5 rounded-control px-1.5 text-sm font-semibold text-muted-foreground no-underline transition-colors duration-(--duration-fast) hover:text-foreground motion-reduce:transition-none',
        focusRing,
      )}
    >
      <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0 truncate">{children}</span>
    </Link>
  );
}
