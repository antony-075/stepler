export function LiteralAriaConditional({ open }: { open: boolean }) {
  return <button type="button" aria-label={open ? 'Close' : 'Open'} />;
}
