/**
 * «Листівка» in miniature: dotted blue paper filling the page, a cream card in an airmail border
 * with a stamp in its corner, a tilted polaroid, the title and the two stamp buttons.
 * Decorative; the picker names it.
 */
export function PostcardThumbnail() {
  return (
    <div
      aria-hidden="true"
      data-slot="template-thumbnail"
      className="flex aspect-[3/4] w-full overflow-hidden rounded-frame p-1.5"
      style={{
        background:
          'radial-gradient(rgb(255 255 255 / 0.6) 1px, transparent 1.4px) 0 0 / 8px 8px, #C9D7E8',
      }}
    >
      <div
        className="flex flex-1 rounded-[4px] p-[3px]"
        style={{
          background:
            'repeating-linear-gradient(135deg,#B3303B 0 4px,#FFFCF5 4px 6px,#2E4E8F 6px 10px,#FFFCF5 10px 12px)',
        }}
      >
        <div className="relative flex flex-1 flex-col items-center justify-center gap-1.5 rounded-[2px] bg-[#FFFCF5] p-1.5">
          <div className="absolute top-1 right-1 size-3 border border-dashed border-[#B3303B] bg-[#F7E3DF]" />
          <div className="-rotate-3 bg-[#FFFFFF] p-0.5 pb-1.5 shadow-[0_1px_3px_rgb(36_48_79/0.25)]">
            <div
              className="aspect-square w-9"
              style={{ background: 'linear-gradient(160deg,#F2C6A8,#C97F62)' }}
            />
          </div>
          <div className="h-1.5 w-4/5 rounded-full bg-[#24304F]" />
          <div className="h-1 w-3/5 rounded-full bg-[#24304F]/40" />
          <div className="grid w-full grid-cols-2 gap-1">
            <div className="h-3 -rotate-2 bg-[#B3303B]" />
            <div className="h-3 rotate-1 border border-[#2E4E8F] bg-[#FFFCF5]" />
          </div>
        </div>
      </div>
    </div>
  );
}
