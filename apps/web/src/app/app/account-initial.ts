/** The avatar's letter: the name's first letter, or the email's when there is no name. */
export function accountInitial(displayName: string | null, email: string): string {
  const source = displayName?.trim() || email;
  return (Array.from(source)[0] ?? '?').toLocaleUpperCase();
}
