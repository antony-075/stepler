import { redirect } from 'next/navigation';

/** The account's preferences moved to «Акаунт» (owner review 2026-10-02: too many «Налаштування»). */
export default function OldSettingsPage() {
  redirect('/app/account');
}
