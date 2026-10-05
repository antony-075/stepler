/**
 * «На весь екран» in miniature: the cover over the whole card under a dark scrim, the white
 * title low on it, the apricot action, the dark sheet's edge. Decorative; the picker names it.
 */
export function FullscreenThumbnail() {
  return (
    <div
      aria-hidden="true"
      data-slot="template-thumbnail"
      className="relative grid aspect-[3/4] w-full content-end gap-1.5 overflow-hidden rounded-frame bg-[linear-gradient(180deg,#5A4A52_0%,#3E2D24_55%,#1B1917_100%)] p-2"
    >
      <div className="h-2 w-4/5 rounded-full bg-[#FFFFFF]" />
      <div className="h-1.5 w-3/5 rounded-full bg-[#FFFFFF]/60" />
      <div className="mt-1 h-3 rounded-[4px] bg-[#F2A65A]" />
      <div className="h-2 rounded-t-[6px] bg-[#1B1917]" />
    </div>
  );
}
