// UploadDock: the guest's actions in the thumb zone (DESIGN-SYSTEM.md §5.11, §7.3).
// Design pass (frontend-design, ui-ux-pro-max, web-design-guidelines, responsive-design):
// - Phones (< 640): fixed to the bottom, full width, `--card` with a 1px top edge, 12/16 padding
//   plus `env(safe-area-inset-bottom)`; the page reserves room below its content. 640–1023:
//   sticky at the bottom of the centred 560px column. From 1024 the page shows its actions in the
//   left column instead (the dock is hidden there).
// - Order top to bottom: the mini strip of own frames (only while there is a queue), the pencil
//   main action (56px), the quiet secondary action, then the «Не закривайте сторінку…» note while
//   uploads run. The note is plain text: `beforeunload` is the actual guard.
// - `data-toast-avoid` lifts toasts above it.
import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

type UploadDockProps = {
  /** The main action, a `pencil` `guest`-size button («Додати фото» / «Додати ще»). */
  primary: ReactNode;
  /** A quieter action under it («Написати побажання»). */
  secondary?: ReactNode;
  /** The strip of own frames above the actions, while the queue is not empty. */
  mini?: ReactNode;
  /** «Не закривайте сторінку, доки кадри завантажуються», while uploads run. */
  note?: string;
  className?: string;
};

/** The guest's bottom dock: fixed on phones, sticky in the tablet column, hidden from 1024px. */
function UploadDock({ primary, secondary, mini, note, className }: UploadDockProps) {
  return (
    <div
      data-slot="upload-dock"
      data-toast-avoid=""
      className={cn(
        'fixed inset-x-0 bottom-0 z-(--z-dock) border-t bg-card px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:sticky sm:mx-auto sm:mt-8 sm:max-w-[560px] sm:rounded-t-sheet sm:border-x lg:hidden',
        className,
      )}
    >
      <div className="grid gap-2">
        {mini ? <div className="min-w-0">{mini}</div> : null}
        {primary}
        {secondary}
        {note ? <p className="text-center type-caption text-muted-foreground">{note}</p> : null}
      </div>
    </div>
  );
}

export { UploadDock, type UploadDockProps };
