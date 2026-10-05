'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectGroup,
  SelectTrigger,
  SelectValue,
} from '@stepler/ui/components/select';
import { cn } from '@stepler/ui/lib/utils';
import {
  CircleDashed,
  Eye,
  Image,
  Images,
  LayoutGrid,
  Lock,
  type LucideIcon,
  Pause,
  Upload,
  UserRound,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  contentRefusal,
  PREVIEW_ACCESS,
  PREVIEW_CONTENT,
  type PreviewAccess,
  type PreviewContent,
  type PreviewState,
  withAccess,
} from '@/guest-page/preview-state';

const ACCESS_ICONS: Record<PreviewAccess, LucideIcon> = {
  all: Users,
  own: UserRound,
  view: Eye,
  paused: Pause,
  closed: Lock,
};

const CONTENT_ICONS: Record<PreviewContent, LucideIcon> = {
  empty: CircleDashed,
  mine: Image,
  others: Images,
  both: LayoutGrid,
  uploading: Upload,
};

/**
 * Which guest page the preview draws (owner remark 92, replacing one long «Стан сторінки» list):
 * two compact selects, each option an icon and a word or two. «Доступ за посиланням» first (what
 * the link lets the guest do), then «Вміст» (what is on the page). A content option that cannot
 * go with the chosen access stays in the list, disabled, with its reason on a second line; choosing
 * an access keeps the content when it still makes sense, else takes the access's natural one.
 * Selects rather than segmented icons: ten icons at the toolbar's width would need tooltips to be
 * read, the words do not. The short group name shows beside each on a wide pane; the trigger's
 * accessible name always says it.
 */
export function PreviewStateControls({
  value,
  onChange,
  className,
}: {
  value: PreviewState;
  onChange: (state: PreviewState) => void;
  className?: string;
}) {
  const t = useTranslations('guestPage.preview');
  const contentLocked = value.access === 'paused' || value.access === 'closed';
  return (
    <div
      className={cn('flex min-w-0 flex-wrap items-center gap-2', className)}
      data-slot="preview-state"
    >
      <Select
        value={value.access}
        onValueChange={(next) => onChange(withAccess(value, next as PreviewAccess))}
      >
        <SelectTrigger
          aria-label={t('access.trigger', { name: t(`access.${value.access}`) })}
          data-slot="preview-access"
          className="h-10 w-auto max-w-[15rem] min-w-0 shrink gap-2 bg-background px-3"
        >
          {/* The chosen option's icon and words (Radix renders the item's text here). */}
          <span className="min-w-0 truncate">
            <SelectValue />
          </span>
        </SelectTrigger>
        <SelectContent align="start">
          <SelectGroup>
            <SelectLabel>{t('access.label')}</SelectLabel>
            {PREVIEW_ACCESS.map((access) => {
              const Icon = ACCESS_ICONS[access];
              return (
                <SelectItem key={access} value={access}>
                  <Icon aria-hidden="true" />
                  {t(`access.${access}`)}
                </SelectItem>
              );
            })}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select
        value={value.content}
        disabled={contentLocked}
        onValueChange={(next) => onChange({ ...value, content: next as PreviewContent })}
      >
        <SelectTrigger
          aria-label={t('content.trigger', { name: t(`content.${value.content}`) })}
          data-slot="preview-content"
          className="h-10 w-auto max-w-[15rem] min-w-0 shrink gap-2 bg-background px-3 disabled:opacity-60"
        >
          <span className="min-w-0 truncate">
            <SelectValue />
          </span>
        </SelectTrigger>
        <SelectContent align="start" className="max-w-80">
          <SelectGroup>
            <SelectLabel>{t('content.label')}</SelectLabel>
            {PREVIEW_CONTENT.map((content) => {
              const Icon = CONTENT_ICONS[content];
              const refusal = contentRefusal(value.access, content);
              return (
                <SelectItem key={content} value={content} disabled={refusal !== null}>
                  <Icon aria-hidden="true" />
                  <span className="grid">
                    <span>{t(`content.${content}`)}</span>
                    {refusal === null ? null : (
                      <span className="type-caption text-pretty text-muted-foreground">
                        {t(`content.refusal.${refusal}`)}
                      </span>
                    )}
                  </span>
                </SelectItem>
              );
            })}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
