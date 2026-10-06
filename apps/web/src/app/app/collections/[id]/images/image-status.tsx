'use client';

import { Button } from '@stepler/ui/components/button';
import { cn } from '@stepler/ui/lib/utils';
import { RotateCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useState } from 'react';

/**
 * Preparing an image takes seconds; past this it is not normal any more (the worker is down or
 * far behind, owner remark 81): the tile says so and offers to check again or remove it.
 */
export const SLOW_PROCESSING_MS = 2 * 60_000;

/** One line of an admin image's status, beside its tile. */
export function StatusLine({
  children,
  strong = false,
  tone,
}: {
  children: ReactNode;
  strong?: boolean;
  tone?: 'muted' | 'destructive';
}) {
  return (
    <p
      className={cn('text-sm text-pretty', {
        'font-semibold': strong,
        'text-muted-foreground': tone === 'muted',
        'text-destructive': tone === 'destructive',
      })}
    >
      {children}
    </p>
  );
}

/**
 * «Готується…», and once it has taken longer than `SLOW_PROCESSING_MS` since this screen first
 * saw it, the slow state with «Перевірити ще раз». Mounted only while the image is processing,
 * so its clock starts over for the next image.
 */
export function ImageProcessing({ onCheck }: { onCheck: () => void }) {
  const t = useTranslations('guestPage.image');
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_PROCESSING_MS);
    return () => window.clearTimeout(timer);
  }, []);
  if (!slow) {
    return (
      <>
        <StatusLine strong>{t('processing')}</StatusLine>
        <StatusLine tone="muted">{t('processingText')}</StatusLine>
      </>
    );
  }
  return (
    <>
      <StatusLine strong>{t('slow')}</StatusLine>
      <StatusLine tone="muted">{t('slowText')}</StatusLine>
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 justify-self-start text-link pointer-coarse:min-h-11"
        onClick={onCheck}
      >
        <RotateCw aria-hidden="true" />
        {t('check')}
      </Button>
    </>
  );
}
