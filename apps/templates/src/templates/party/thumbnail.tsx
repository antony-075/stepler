/**
 * «Вечірка» in miniature: near-black with a violet glow, a heavy title, a round emblem, the
 * glowing lime pill and a bento of tiles filling the rest. Decorative; the picker names it.
 */
export function PartyThumbnail() {
  return (
    <div
      aria-hidden="true"
      data-slot="template-thumbnail"
      className="flex aspect-[3/4] w-full flex-col gap-1.5 overflow-hidden rounded-frame p-2"
      style={{
        background:
          'radial-gradient(circle at 10% 0%, rgb(165 107 255 / 0.4), transparent 60%), #110F15',
      }}
    >
      <div className="flex shrink-0 items-start justify-between gap-1">
        <div className="grid flex-1 gap-1">
          <div className="h-2.5 w-full rounded-full bg-[#F3EEFB]" />
          <div className="h-2.5 w-3/4 rounded-full bg-[#F3EEFB]" />
        </div>
        <div
          className="size-6 rounded-full border border-[#C9A6FF]"
          style={{ background: 'linear-gradient(160deg,#8D63D2,#2C2042)' }}
        />
      </div>
      <div className="h-1.5 w-2/3 shrink-0 rounded-full bg-[#A99FBC]/60" />
      <div className="h-3 shrink-0 rounded-full bg-[#C5F04A] shadow-[0_0_8px_rgb(197_240_74/0.6)]" />
      <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-3 gap-0.5">
        <div
          className="col-span-2 row-span-2 rounded-[3px]"
          style={{ background: 'linear-gradient(150deg,#6B4AA0,#2C2042)' }}
        />
        <div className="rounded-[3px] bg-[#3A2A5C]" />
        <div className="rounded-[3px] bg-[#4B3478]" />
        <div className="rounded-[3px] bg-[#2C2042]" />
        <div className="rounded-[3px] bg-[#5A3F8C]" />
        <div className="rounded-[3px] bg-[#3A2A5C]" />
      </div>
    </div>
  );
}
