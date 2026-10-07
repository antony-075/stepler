import { redirect } from 'next/navigation';

/** The console opens on the report queue. */
export default function OpsIndexPage(): never {
  redirect('/ops/reports');
}
