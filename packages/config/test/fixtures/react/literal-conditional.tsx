export function LiteralConditional({ open }: { open: boolean }) {
  return <p>{open ? 'Open' : `Closed`}</p>;
}
