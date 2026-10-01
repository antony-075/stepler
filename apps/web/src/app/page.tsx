import { redirect } from 'next/navigation';
import { getSessionUser } from '@/api/server';
import { SignInLanding } from './login/sign-in-landing';

// The main page is the sign-in landing until a marketing page exists. Signed in → the admin area;
// signed out or API unavailable → the landing as usual.
export default async function HomePage() {
  const user = await getSessionUser();
  if (user !== null && user !== 'unavailable') redirect('/app');
  return <SignInLanding />;
}
