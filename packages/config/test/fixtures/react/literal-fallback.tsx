export function LiteralFallback({ name }: { name?: string }) {
  return <p>{name || 'Guest'}</p>;
}
