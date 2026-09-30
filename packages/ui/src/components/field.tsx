import type { ReactNode } from 'react';
import { cn } from '../lib/utils';
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
  error?: ReactNode;
  className?: string;
  children: (control: FieldControlProps) => ReactNode;
};

/**
 * The one way forms wire a label, a hint and an error to a control. The control is rendered
 * through the render prop so any input (Input, Textarea, a Radix trigger) receives the same
 * `id`, `aria-describedby` and `aria-invalid`. The error has `role="alert"` so it is announced
 * when it appears.
 */
function Field({ id, label, description, error, className, children }: FieldProps) {
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div data-slot="field" className={cn('grid gap-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({
        id,
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        ...(error ? { 'aria-invalid': true } : {}),
      })}
      {description ? (
        <p
          id={descriptionId}
          data-slot="field-description"
          className="text-sm text-muted-foreground"
        >
          {description}
        </p>
      ) : null}
      {error ? (
        <p
          id={errorId}
          role="alert"
          data-slot="field-error"
          className="text-sm font-medium text-destructive"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export { Field, type FieldControlProps };
