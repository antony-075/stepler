/**
 * «На весь екран» in miniature: the cover over the whole page under a dark scrim, the white
 * title low on it, the apricot action, the dark sheet's edge with frames peeking. Decorative;
 * the picker names it.
 */
export function FullscreenThumbnail() {
  return (
    <div
      aria-hidden="true"
      data-slot="template-thumbnail"
      className="flex aspect-[3/4] w-full flex-col justify-end gap-1.5 overflow-hidden rounded-frame p-2"
      style={{
        background: 'linear-gradient(180deg,#8C7A80 0%,#5A4A52 30%,#3E2D24 62%,#1B1917 100%)',
      }}
    >
      <div className="h-2.5 w-4/5 rounded-full bg-[#FFFFFF]" />
      <div className="h-1.5 w-3/5 rounded-full bg-[#FFFFFF]/60" />
      <div className="mt-1 h-3 rounded-[4px] bg-[#F2A65A]" />
      <div className="-mx-2 -mb-2 mt-1 grid grid-cols-3 gap-0.5 rounded-t-[6px] bg-[#1B1917] p-1.5 pb-2">
        <div className="aspect-square rounded-[2px] bg-[#3A3330]" />
        <div className="aspect-square rounded-[2px] bg-[#4A3E36]" />
        <div className="aspect-square rounded-[2px] bg-[#332C2A]" />
      </div>
    </div>
  );
}
