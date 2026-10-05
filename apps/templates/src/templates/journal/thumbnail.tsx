/**
 * «Журнал» in miniature: warm paper, a centred serif title over a small ornament, a matted 3:4
 * print and a burgundy action. Decorative; the picker names it.
 */
export function JournalThumbnail() {
  return (
    <div
      aria-hidden="true"
      data-slot="template-thumbnail"
      className="grid aspect-[3/4] w-full content-start justify-items-center gap-1.5 overflow-hidden rounded-frame border border-[#DCCFBE] bg-[#F1EADF] p-2"
    >
      <div className="mt-0.5 h-2 w-3/4 rounded-full bg-[#2A211B]" />
      <div className="h-px w-1/3 bg-[#B9A894]" />
      <div className="bg-[#FAF6EF] p-1 shadow-[0_0_0_1px_#DCCFBE]">
        <div className="aspect-[3/4] w-9 bg-[linear-gradient(176deg,#C7AE98,#64493B)]" />
      </div>
      <div className="h-3 w-full rounded-[1px] bg-[#7A2E3A]" />
    </div>
  );
}
