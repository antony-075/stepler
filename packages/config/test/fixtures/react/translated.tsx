declare function t(key: string): string;

export function Translated({ open, count, role }: { open: boolean; count: number; role: string }) {
  return (
    <button
      type="button"
      className={open ? 'text-sm' : 'text-base'}
      aria-label={open ? t('close') : t('open')}
    >
      {t('title')}
      {count > 0 && t('items')}
      {role === 'admin' ? t('admin') : null}
    </button>
  );
}
