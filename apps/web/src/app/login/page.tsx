import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { fetchAuthMethods } from '@/api/server';
import { LoginForm } from './login-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('login');
  return { title: t('pageTitle') };
}

const CALLBACK_ERRORS = ['OAUTH_FAILED', 'ACCOUNT_BLOCKED'] as const;
type CallbackError = (typeof CALLBACK_ERRORS)[number];

function callbackError(value: unknown): CallbackError | null {
  return CALLBACK_ERRORS.find((code) => code === value) ?? null;
}

// Placeholder layout; the visual design lands with the Phase 3 design system.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ error }, methods, t] = await Promise.all([
    searchParams,
    fetchAuthMethods(),
    getTranslations('login'),
  ]);
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-md content-center px-4 py-10">
      <div className="rounded-xl border bg-card p-5 shadow-sm sm:p-8">
        {methods === null ? (
          <p role="alert">{t('unavailable')}</p>
        ) : (
          <LoginForm
            turnstileSiteKey={methods.turnstileSiteKey}
            googleEnabled={methods.google}
            initialError={callbackError(error)}
          />
        )}
      </div>
    </main>
  );
}
