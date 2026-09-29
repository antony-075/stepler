declare function t(key: string): string;

export function Translated() {
  return (
    <button type="button" className="text-sm" aria-label={t('close')}>
      {t('title')}
    </button>
  );
}
