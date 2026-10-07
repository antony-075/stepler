// ReportDialog: a guest reports another guest's frame (slice 9, R1; DESIGN-SYSTEM.md §5.12).
// Design pass (frontend-design, ui-ux-pro-max, web-design-guidelines, responsive-design):
// - Presentational: every word, the reasons and the callbacks come in as props, so it has no
//   literal copy and no API; the app owns the state, the request and the idempotency key.
// - The Stepler look, not the guest template's: it portals like every Dialog (the name prompt
//   precedent), full width minus 16px gutters on phones, 480px from `sm`.
// - One required choice first (a radio list of five full-row 44px targets, a fieldset with its
//   legend), then two optional fields that say they are optional. Submit stays enabled; a
//   missing reason shows its message on submit (DESIGN-SYSTEM §9), focus goes to the first radio.
// - The description's counter is data (Geist Mono, right) and turns destructive past the limit,
//   which also blocks the submit with a message: never colour alone.
// - `sent` swaps the form for the confirmation (a ✓, the heading, one line, «Закрити») and moves
//   focus to the heading, so a screen reader hears the outcome.
import { CircleAlert, CircleCheck } from 'lucide-react';
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
import { Input } from './input';
import { RadioGroup, RadioGroupItem } from './radio-group';
import { Textarea } from './textarea';

type ReportDialogValues = { reason: string; description: string; email: string };

type ReportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  reasonsLegend: string;
  reasons: { value: string; label: string }[];
  /** Shown when the form is sent without a reason. */
  reasonRequiredLabel: string;
  descriptionLabel: string;
  descriptionHint: string;
  /** Shown when the description is over `maxDescription` code points. */
  descriptionTooLongLabel: string;
  emailLabel: string;
  emailHint: string;
  /** Shown when the address is not an e-mail address. */
  emailInvalidLabel: string;
  submitLabel: string;
  submittingLabel: string;
  cancelLabel: string;
  sentTitle: string;
  sentText: string;
  closeLabel: string;
  /** `{count}/{max}` as the app formats it. */
  counterLabel: (count: number, max: number) => string;
  state: 'idle' | 'submitting' | 'sent';
  /** The failed request's message; the form stays as it was. */
  error: string | null;
  maxDescription: number;
  onSubmit: (values: ReportDialogValues) => void;
};

const COUNTER = 'type-data block text-right';
const COUNTER_OVER = 'text-destructive';
const EMPTY: ReportDialogValues = { reason: '', description: '', email: '' };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const codePoints = (value: string) => [...value].length;

function ReportDialog(props: ReportDialogProps) {
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
        // The confirmation has its own «Закрити»; one is enough.
        showCloseButton={state !== 'sent'}
      >
        <ReportBody {...props} />
      </DialogContent>
    </Dialog>
  );
}

function ReportBody({
  title,
  reasonsLegend,
  reasons,
  reasonRequiredLabel,
  descriptionLabel,
  descriptionHint,
  descriptionTooLongLabel,
  emailLabel,
  emailHint,
  emailInvalidLabel,
  submitLabel,
  submittingLabel,
  cancelLabel,
  sentTitle,
  sentText,
  closeLabel,
  counterLabel,
  state,
  error,
  maxDescription,
  onSubmit,
}: ReportDialogProps) {
  const id = useId();
  const [values, setValues] = useState<ReportDialogValues>(EMPTY);
  const [tried, setTried] = useState(false);
  const firstRadio = useRef<HTMLButtonElement>(null);
  const sentHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (state === 'sent') sentHeading.current?.focus();
  }, [state]);

  const length = codePoints(values.description.trim());
  const tooLong = length > maxDescription;
  const emailInvalid = values.email.trim() !== '' && !EMAIL.test(values.email.trim());
  const reasonMissing = values.reason === '';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (state === 'submitting') return;
    setTried(true);
    if (reasonMissing) {
      firstRadio.current?.focus();
      return;
    }
    if (tooLong || emailInvalid) return;
    onSubmit(values);
  };

  const legendId = `${id}-legend`;
  const reasonErrorId = `${id}-reason-error`;
  const showReasonError = tried && reasonMissing;

  // The first radio takes focus, not the corner close button.
  useEffect(() => {
    if (state !== 'sent') firstRadio.current?.focus();
    // Only on mount: later focus follows the guest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {state === 'sent' ? (
        <div data-slot="report-sent" className="grid justify-items-center gap-3 py-4 text-center">
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
      ) : (
        <>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <form noValidate className="grid gap-5" onSubmit={submit}>
            {error === null ? null : <Alert variant="error">{error}</Alert>}
            <fieldset
              className="grid gap-1"
              aria-describedby={showReasonError ? reasonErrorId : undefined}
            >
              <legend id={legendId} className="mb-1 text-[0.9375rem] font-semibold">
                {reasonsLegend}
              </legend>
              <RadioGroup
                aria-labelledby={legendId}
                aria-required="true"
                aria-invalid={showReasonError || undefined}
                value={values.reason}
                onValueChange={(reason) => setValues((v) => ({ ...v, reason }))}
                className="gap-0"
              >
                {reasons.map((reason, index) => (
                  <RadioGroupItem
                    key={reason.value}
                    value={reason.value}
                    {...(index === 0 ? { ref: firstRadio } : {})}
                  >
                    {reason.label}
                  </RadioGroupItem>
                ))}
              </RadioGroup>
              {showReasonError ? (
                <p
                  id={reasonErrorId}
                  role="alert"
                  className="flex items-center gap-1.5 text-[0.875rem] text-destructive"
                >
                  <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
                  {reasonRequiredLabel}
                </p>
              ) : null}
            </fieldset>
            <Field
              id={`${id}-description`}
              label={
                <>
                  {descriptionLabel}{' '}
                  <span className="font-normal text-muted-foreground">{descriptionHint}</span>
                </>
              }
              description={
                <span data-slot="report-counter" className={cn(COUNTER, tooLong && COUNTER_OVER)}>
                  {counterLabel(length, maxDescription)}
                </span>
              }
              error={tooLong ? descriptionTooLongLabel : undefined}
            >
              {(control) => (
                <Textarea
                  {...control}
                  rows={3}
                  value={values.description}
                  onChange={(event) =>
                    setValues((v) => ({ ...v, description: event.target.value }))
                  }
                />
              )}
            </Field>
            <Field
              id={`${id}-email`}
              label={emailLabel}
              description={emailHint}
              error={tried && emailInvalid ? emailInvalidLabel : undefined}
            >
              {(control) => (
                <Input
                  {...control}
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={values.email}
                  onChange={(event) => setValues((v) => ({ ...v, email: event.target.value }))}
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
      )}
    </>
  );
}

export { ReportDialog, type ReportDialogProps, type ReportDialogValues };
