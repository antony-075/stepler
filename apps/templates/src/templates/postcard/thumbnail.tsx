/**
 * «Листівка» in miniature: dotted blue paper, a cream card in an airmail border with a tilted
 * polaroid and two stamps. Decorative; the picker names it.
 */
export function PostcardThumbnail() {
  return (
    <div
      aria-hidden="true"
      data-slot="template-thumbnail"
      className="grid aspect-[3/4] w-full place-items-center overflow-hidden rounded-frame bg-[radial-gradient(rgb(255_255_255/0.6)_1px,transparent_1.4px)_0_0/8px_8px,#C9D7E8] p-1.5"
    >
      <div className="grid w-full gap-1 rounded-[4px] bg-[repeating-linear-gradient(135deg,#B3303B_0_4px,#FFFCF5_4px_6px,#2E4E8F_6px_10px,#FFFCF5_10px_12px)] p-[3px]">
        <div className="grid justify-items-center gap-1 rounded-[2px] bg-[#FFFCF5] p-1.5">
          <div className="-rotate-3 bg-[#FFFFFF] p-0.5 pb-1.5 shadow-sm">
            <div className="size-8 bg-[linear-gradient(160deg,#F2C6A8,#C97F62)]" />
          </div>
          <div className="h-1.5 w-4/5 rounded-full bg-[#24304F]" />
          <div className="grid w-full grid-cols-2 gap-1">
            <div className="h-3 -rotate-2 bg-[#B3303B]" />
            <div className="h-3 rotate-1 border border-[#2E4E8F] bg-[#FFFCF5]" />
          </div>
        </div>
      </div>
    </div>
  );
}
