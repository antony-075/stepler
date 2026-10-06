/**
 * «Класика» in miniature for the editor's template picker, in the T1 colours: the light table,
 * a 16:10 cover over the title, the pencil action and the frames filling the rest. Decorative;
 * the picker names it. Every thumbnail is a full 3:4 phone page (owner 2026-10-06).
 */
export function ClassicThumbnail() {
  return (
    <div
      aria-hidden="true"
      data-slot="template-thumbnail"
      className="flex aspect-[3/4] w-full flex-col gap-1.5 overflow-hidden rounded-frame border border-[#D6D8D2] bg-[#F0F1EE] p-2"
    >
      <div
        className="aspect-[16/10] shrink-0 rounded-[3px]"
        style={{ background: 'linear-gradient(165deg,#D7C9BE,#B4A194)' }}
      />
      <div className="h-2 w-4/5 shrink-0 rounded-full bg-[#141614]" />
      <div className="h-1.5 w-3/5 shrink-0 rounded-full bg-[#5A5D58]/50" />
      <div className="mt-0.5 h-3 shrink-0 rounded-[3px] bg-[#B83E26]" />
      <div className="h-2.5 shrink-0 rounded-[3px] border border-[#83877F] bg-[#FFFFFF]" />
      <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-2 gap-0.5">
        <div className="rounded-[2px] bg-[#CDD3C8]" />
        <div className="rounded-[2px] bg-[#FBECE8]" />
        <div className="rounded-[2px] bg-[#C9D5DF]" />
        <div className="rounded-[2px] bg-[#E2D6CC]" />
        <div className="rounded-[2px] bg-[#D5DCCF]" />
        <div className="rounded-[2px] bg-[#EFE2DA]" />
      </div>
    </div>
  );
}
