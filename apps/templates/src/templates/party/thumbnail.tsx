/**
 * «Вечірка» in miniature: near-black with a violet glow, a heavy title, a round emblem and a
 * glowing lime pill, a bento of tiles. Decorative; the picker names it.
 */
export function PartyThumbnail() {
  return (
    <div
      aria-hidden="true"
      data-slot="template-thumbnail"
      className="relative grid aspect-[3/4] w-full content-start gap-1.5 overflow-hidden rounded-frame bg-[radial-gradient(circle_at_10%_0%,rgb(165_107_255/0.35),transparent_60%),#110F15] p-2"
    >
      <div className="flex items-start justify-between gap-1">
        <div className="grid flex-1 gap-1">
          <div className="h-2.5 w-full rounded-full bg-[#F3EEFB]" />
          <div className="h-2.5 w-3/4 rounded-full bg-[#F3EEFB]" />
        </div>
        <div className="size-6 rounded-full border border-[#C9A6FF] bg-[linear-gradient(160deg,#6B4AA0,#2C2042)]" />
      </div>
      <div className="mt-1 h-3 rounded-full bg-[#C5F04A] shadow-[0_0_8px_rgb(197_240_74/0.6)]" />
      <div className="mt-1 grid grid-cols-3 gap-0.5">
        <div className="col-span-2 row-span-2 aspect-square rounded-[3px] bg-[#2C2042]" />
        <div className="aspect-square rounded-[3px] bg-[#1F1830]" />
        <div className="aspect-square rounded-[3px] bg-[#2C2042]" />
      </div>
    </div>
  );
}
