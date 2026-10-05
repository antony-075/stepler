/**
 * «Класика» in miniature for the editor's template picker, in the T1 colours: the light table,
 * a 16:10 cover over the title, the pencil action and a row of frames. Decorative; the picker
 * names it.
 */
export function ClassicThumbnail() {
  return (
    <div
      aria-hidden="true"
      data-slot="template-thumbnail"
      className="grid aspect-[3/4] w-full content-start gap-1.5 overflow-hidden rounded-frame border border-[#D6D8D2] bg-[#F0F1EE] p-2"
    >
      <div className="aspect-[16/10] rounded-[3px] bg-[linear-gradient(165deg,#D7C9BE,#B4A194)]" />
      <div className="h-2 w-4/5 rounded-full bg-[#141614]" />
      <div className="h-1.5 w-3/5 rounded-full bg-[#5A5D58]/50" />
      <div className="mt-1 h-3 rounded-[3px] bg-[#B83E26]" />
      <div className="h-2.5 rounded-[3px] border border-[#83877F] bg-[#FFFFFF]" />
      <div className="mt-1 grid grid-cols-3 gap-0.5">
        <div className="aspect-square rounded-[2px] bg-[#CDD3C8]" />
        <div className="aspect-square rounded-[2px] bg-[#FBECE8]" />
        <div className="aspect-square rounded-[2px] bg-[#C9D5DF]" />
      </div>
    </div>
  );
}
