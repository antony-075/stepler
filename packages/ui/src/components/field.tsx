import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/utils';
import { InfoTip } from './info-tip';
import { Label } from './label';

/** Props the control must spread so its label, description and error are wired up. */
type FieldControlProps = {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
};

type FieldProps = {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  /** A nice-to-know hint as an info tooltip beside the label (`InfoTip`); still a description. */
  hint?: string;
  error?: ReactNode;
  className?: string;
  children: (control: FieldControlProps) => ReactNode;
};

/**
 * The one way forms wire a label, a hint and an error to a control. The control is rendered
 * through the render prop so any input (Input, Textarea, a Radix trigger) receives the same
 * `id`, `aria-describedby` and `aria-invalid`. The error has `role="alert"` so it is announced
 * when it appears, and a `CircleAlert` icon so it never relies on colour alone.
 *
 * Only for controls a `<label for>` can name (Input, Textarea, Checkbox, Switch, a Radix trigger).
 * Do not wrap a RadioGroup in Field: it is a `role="radiogroup"` div, so name it with
 * `aria-labelledby` or a `fieldset`/`legend` instead.
 */
function Field({ id, label, description, hint, error, className, children }: FieldProps) {
  const descriptionId = description ? `${id}-description` : undefined;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div data-slot="field" className={cn('grid gap-2', className)}>
      {hint ? (
        // The tip sits outside the <label>, so it is not part of the control's name.
        <div className="flex items-center gap-1">
          <Label htmlFor={id}>{label}</Label>
          <InfoTip text={hint} />
          <span id={hintId} hidden>
            {hint}
          </span>
        </div>
      ) : (
        <Label htmlFor={id}>{label}</Label>
      )}
      {children({
        id,
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        ...(error ? { 'aria-invalid': true } : {}),
      })}
      {description ? (
        <p
          id={descriptionId}
          data-slot="field-description"
          className="text-sm leading-[1.45] text-muted-foreground"
        >
          {description}
        </p>
      ) : null}
      {error ? (
        <p
          id={errorId}
          role="alert"
          data-slot="field-error"
          className="flex items-start gap-1.5 text-sm leading-[1.45] text-destructive"
        >
          {/* An icon too: destructive and pencil are not told apart by colour. */}
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0">{error}</span>
        </p>
      ) : null}
    </div>
  );
}

export { Field, type FieldControlProps };
