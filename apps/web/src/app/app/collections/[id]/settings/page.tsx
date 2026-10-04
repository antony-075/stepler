import { redirect } from 'next/navigation';

/** The collection's options are its «Параметри колекції» tab now (owner review 2026-10-02). */
export default async function OldCollectionSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/app/collections/${id}?tab=settings`);
}
