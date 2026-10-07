// AppealDialog: the collection admin appeals an operator measure (slice 9b; DESIGN-SYSTEM.md §5.12).
// Design pass (frontend-design, ui-ux-pro-max, web-design-guidelines, responsive-design):
// - The ReportDialog's sibling: presentational, every word and the callbacks come in as props;
//   the app owns the request. Full width minus 16px gutters on phones, 480px from `sm`.
// - One required field: the admin's explanation. The description above it says what is being
//   appealed and that the Stepler team answers in the app (no e-mail to the admin, Q-A5).
// - Submit stays enabled; an empty text shows its message on submit and focuses the field
//   (DESIGN-SYSTEM §9). The counter is data (Geist Mono, right) and turns destructive past the
//   limit, which also blocks the submit with a message: never colour alone.
// - `sent` swaps the form for the confirmation and moves focus to its heading.
import { CircleCheck } from 'lucide-react';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { cn } from '../lib/utils';
import { Alert } from './alert';
import { Button } from './button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';
import { Field } from './field';
import { Textarea } from './textarea';

type AppealDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** What is appealed and how the answer comes back. */
  description: string;
  textLabel: string;
  textHint: string;
  /** Shown when the form is sent with no text. */
  textRequiredLabel: string;
  /** Shown when the text is over `maxText` code points. */
  textTooLongLabel: string;
  /** `{count}/{max}` as the app formats it. */
  counterLabel: (count: number, max: number) => string;
  submitLabel: string;
  submittingLabel: string;
  cancelLabel: string;
  sentTitle: string;
  sentText: string;
  closeLabel: string;
  state: 'idle' | 'submitting' | 'sent';
  /** The failed request's message; the form stays as it was. */
  error: string | null;
  maxText: number;
  onSubmit: (values: { text: string }) => void;
};

const COUNTER = 'type-data block text-right';
const codePoints = (value: string) => [...value].length;

function AppealDialog(props: AppealDialogProps) {
  const { open, onOpenChange, closeLabel, state } = props;
  const changeOpen = (next: boolean) => {
    if (!next && state === 'submitting') return;
    onOpenChange(next);
  };
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      {/* The content unmounts when closed, so each opening starts with an empty form. */}
      <DialogContent
        closeLabel={closeLabel}
        aria-describedby={undefined}
        showCloseButton={state !== 'sent'}
      >
        <AppealBody {...props} />
      </DialogContent>
    </Dialog>
  );
}

function AppealBody({
  title,
  description,
  textLabel,
  textHint,
  textRequiredLabel,
  textTooLongLabel,
  counterLabel,
  submitLabel,
  submittingLabel,
  cancelLabel,
  sentTitle,
  sentText,
  closeLabel,
  state,
  error,
  maxText,
  onSubmit,
}: AppealDialogProps) {
  const id = useId();
  const [text, setText] = useState('');
  const [tried, setTried] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const sentHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (state === 'sent') sentHeading.current?.focus();
  }, [state]);

  // The field takes focus, not the corner close button.
  useEffect(() => {
    if (state !== 'sent') field.current?.focus();
    // Only on mount: later focus follows the admin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const length = codePoints(text.trim());
  const empty = length === 0;
  const tooLong = length > maxText;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (state === 'submitting') return;
    setTried(true);
    if (empty || tooLong) {
      field.current?.focus();
      return;
    }
    onSubmit({ text: text.trim() });
  };

  const fieldError = tooLong ? textTooLongLabel : tried && empty ? textRequiredLabel : undefined;

  if (state === 'sent') {
    return (
      <div data-slot="appeal-sent" className="grid justify-items-center gap-3 py-4 text-center">
        <CircleCheck aria-hidden="true" className="size-10 text-success" />
        <DialogTitle asChild>
          <h2 ref={sentHeading} tabIndex={-1} className="type-h2 outline-none">
            {sentTitle}
          </h2>
        </DialogTitle>
        <DialogDescription className="max-w-[36ch]">{sentText}</DialogDescription>
        <DialogFooter className="w-full">
          <DialogClose asChild>
            <Button className="w-full sm:w-auto">{closeLabel}</Button>
          </DialogClose>
        </DialogFooter>
      </div>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <form noValidate className="grid gap-5" onSubmit={submit}>
        {error === null ? null : <Alert variant="error">{error}</Alert>}
        <Field
          id={`${id}-text`}
          label={textLabel}
          description={
            <>
              <span className="block">{textHint}</span>
              <span
                data-slot="appeal-counter"
                className={cn(COUNTER, tooLong && 'text-destructive')}
              >
                {counterLabel(length, maxText)}
              </span>
            </>
          }
          error={fieldError}
        >
          {(control) => (
            <Textarea
              {...control}
              ref={field}
              rows={5}
              required
              aria-required="true"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          )}
        </Field>
        <DialogFooter>
          <DialogClose asChild>
            <Button
              type="button"
              variant="outline"
              aria-disabled={state === 'submitting' || undefined}
            >
              {cancelLabel}
            </Button>
          </DialogClose>
          <Button type="submit" aria-disabled={state === 'submitting' || undefined}>
            {state === 'submitting' ? submittingLabel : submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

export { AppealDialog, type AppealDialogProps };
