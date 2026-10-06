import { cn } from '@stepler/ui/lib/utils';
import { useTranslations } from 'next-intl';

/**
 * The V1 mark (DESIGN-SYSTEM.md §0.7): the brand's lowercase initial on a 20px indigo square
 * before the wordmark. Decorative: the link around it is named by the wordmark.
 */
export function BrandMark({ className }: { className?: string }) {
  const t = useTranslations('brand');
  return (
    <span
      aria-hidden="true"
      translate="no"
      className={cn(
        'inline-grid size-5 shrink-0 place-items-center rounded-[5px] bg-primary text-xs leading-none font-bold text-primary-foreground lowercase',
        className,
      )}
    >
      {t('name').slice(0, 1)}
    </span>
  );
}
