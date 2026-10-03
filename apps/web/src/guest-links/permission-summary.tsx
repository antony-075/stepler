import type { GuestLinkPermissions } from '@stepler/contracts';
import { useTranslations } from 'next-intl';
import { permissionSummary, SUMMARY_SEPARATOR } from './link-permissions';

/**
 * A link's permissions in one compact line (owner 2026-10-03): what guests may add
 * («Фото · Відео · Побажання», «Лише перегляд») in the text colour, then whose content they see
 * («Бачать лише своє» / «Бачать усе»), muted, after one more «·».
 */
export function PermissionSummary({ permissions }: { permissions: GuestLinkPermissions }) {
  const t = useTranslations('guestLinks.summary');
  const { add, see } = permissionSummary(permissions, t);
  return (
    <>
      <span className="text-foreground">{add}</span>
      <span className="text-muted-foreground">
        {SUMMARY_SEPARATOR}
        {see}
      </span>
    </>
  );
}
