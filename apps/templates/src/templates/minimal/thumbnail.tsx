/**
 * «Мінімалізм» in miniature: white, a large title, hairline rules around a blue action and an
 * underlined link, quiet grey tiles. Decorative; the picker names it.
 */
export function MinimalThumbnail() {
  return (
    <div
      aria-hidden="true"
      data-slot="template-thumbnail"
      className="grid aspect-[3/4] w-full content-start gap-1.5 overflow-hidden rounded-frame border border-[#E6E7E9] bg-[#FFFFFF] p-2"
    >
      <div className="mt-3 h-2.5 w-11/12 rounded-full bg-[#15171A]" />
      <div className="h-2.5 w-2/3 rounded-full bg-[#15171A]" />
      <div className="h-1.5 w-3/4 rounded-full bg-[#63676C]/50" />
      <div className="mt-1 flex items-center gap-1 border-y border-[#E6E7E9] py-1">
        <div className="h-3 w-1/2 rounded-[2px] bg-[#2443D0]" />
        <div className="h-0.5 w-1/4 bg-[#15171A]" />
      </div>
      <div className="mt-1 grid grid-cols-3 gap-1">
        <div className="aspect-square rounded-[2px] bg-[#E3E5E8]" />
        <div className="aspect-square rounded-[2px] bg-[#EEF1FC]" />
        <div className="aspect-square rounded-[2px] bg-[#E3E5E8]" />
      </div>
    </div>
  );
}
