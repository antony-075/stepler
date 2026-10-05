/**
 * «Класика» in miniature for the editor's template picker: a cover over the title, the pencil
 * action and a row of frames, in the page's own colours. Decorative; the picker names it.
 */
export function ClassicThumbnail() {
  return (
    <div
      aria-hidden="true"
      data-slot="template-thumbnail"
      className="grid aspect-[3/4] w-full content-start gap-1.5 overflow-hidden rounded-frame border bg-background p-2"
    >
      <div className="aspect-[16/10] rounded-[3px] bg-tint-sand" />
      <div className="h-2 w-4/5 rounded-full bg-foreground" />
      <div className="h-1.5 w-3/5 rounded-full bg-muted-foreground/50" />
      <div className="mt-1 h-3 rounded-[3px] bg-pencil" />
      <div className="mt-1 grid grid-cols-3 gap-0.5">
        <div className="aspect-square bg-tint-sage" />
        <div className="aspect-square bg-tint-lavender" />
        <div className="aspect-square bg-tint-sky" />
      </div>
    </div>
  );
}
