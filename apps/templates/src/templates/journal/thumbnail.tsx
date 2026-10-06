/**
 * «Журнал» in miniature: warm paper, a centred serif title over a small ornament, a matted 3:4
 * print, a burgundy action and two quiet frames. Decorative; the picker names it.
 */
export function JournalThumbnail() {
  return (
    <div
      aria-hidden="true"
      data-slot="template-thumbnail"
      className="flex aspect-[3/4] w-full flex-col items-center gap-1.5 overflow-hidden rounded-frame border border-[#DCCFBE] bg-[#F1EADF] p-2"
    >
      <div className="mt-0.5 h-2 w-3/4 shrink-0 rounded-full bg-[#2A211B]" />
      <div className="h-px w-1/3 shrink-0 bg-[#B9A894]" />
      <div className="flex min-h-0 w-3/5 flex-1 bg-[#FAF6EF] p-1 shadow-[0_0_0_1px_#DCCFBE]">
        <div className="flex-1" style={{ background: 'linear-gradient(176deg,#C7AE98,#64493B)' }} />
      </div>
      <div className="h-3 w-full shrink-0 rounded-[1px] bg-[#7A2E3A]" />
      <div className="grid w-full shrink-0 grid-cols-2 gap-1">
        <div className="aspect-[4/3] bg-[#E3D6C5]" />
        <div className="aspect-[4/3] bg-[#D9C7B2]" />
      </div>
    </div>
  );
}
