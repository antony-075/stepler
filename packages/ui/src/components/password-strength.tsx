import { Check, X } from 'lucide-react';
import { cn } from '../lib/utils';

type StrengthRule = {
  id: string;
  /** What the rule asks, in the page's language («Щонайменше 8 символів»). */
  label: string;
  met: boolean;
};

type PasswordStrengthProps = {
  /** The rules in display order; the meter has one segment per rule. */
  rules: readonly StrengthRule[];
  /** The meter's accessible name («Надійність пароля»). */
  label: string;
  /** The level in words for the current count («Слабкий», «Майже», «Надійний»). */
  levelText: string;
  /** One polite sentence for screen readers, e.g. «Ще потрібна велика літера і цифра». */
  summary: string;
  /** The words a met / missing rule carries for screen readers («виконано», «ще потрібно»). */
  metText: string;
  missingText: string;
  /** Before any typing the rules are a quiet list, not a row of red crosses. */
  pristine?: boolean;
  id?: string;
  className?: string;
};

const SEGMENT_ON = 'scale-x-100';
const SEGMENT_OFF = 'scale-x-0';
const LEVEL_QUIET = 'text-muted-foreground';
const LEVEL_SHOWN = 'text-foreground';
const RULE_MET = 'text-foreground';
const RULE_MISSING = 'text-muted-foreground';
const MARK_MET = 'bg-success text-card';
const MARK_PRISTINE = 'border border-input';
const MARK_MISSING = 'bg-destructive/10 text-destructive';
const MATCH_YES = 'text-success';
const MATCH_NO = 'text-destructive';

/** A rule's state for screen readers, after its label. */
function stateText(state: string): string {
  return `: ${state}`;
}

/** The fill per number of met rules: red, amber, then indigo, green when every rule holds. */
function fill(met: number, total: number): string {
  if (met >= total) return 'bg-success';
  if (met >= total - 1) return 'bg-primary';
  if (met >= 2) return 'bg-warning';
  return 'bg-destructive';
}

/**
 * The password meter (owner remark 2026-10-16, ADR 0019; ui-ux-pro-max pass): a row of segments,
 * one per rule, that fill left to right as rules are met and change colour by level; the level in
 * words beside it; the checklist under it, each rule with a check or a cross AND its state in
 * words for screen readers, so nothing relies on colour. A polite live region repeats only the
 * summary («Ще потрібна…»), not every keystroke's list. Segments grow with a short transition
 * that stops under reduced motion.
 */
function PasswordStrength({
  rules,
  label,
  levelText,
  summary,
  metText,
  missingText,
  pristine = false,
  id,
  className,
}: PasswordStrengthProps) {
  const met = rules.filter((rule) => rule.met).length;
  const tone = fill(met, rules.length);
  const valueText = `${levelText}: ${met} / ${rules.length}`;
  const columns = { gridTemplateColumns: `repeat(${rules.length}, minmax(0, 1fr))` };
  return (
    <div id={id} data-slot="password-strength" className={cn('grid gap-2.5', className)}>
      <div className="flex items-center gap-3">
        <div
          role="meter"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={rules.length}
          aria-valuenow={met}
          aria-valuetext={valueText}
          className="grid flex-1 gap-1"
          style={columns}
        >
          {rules.map((rule, index) => (
            <span
              key={rule.id}
              aria-hidden="true"
              className="relative h-1.5 overflow-hidden rounded-full bg-muted"
            >
              <span
                className={cn(
                  'absolute inset-0 origin-left rounded-full transition-[transform,background-color] duration-(--duration-develop) ease-out motion-reduce:transition-none',
                  tone,
                  index < met ? SEGMENT_ON : SEGMENT_OFF,
                )}
                style={{ transitionDelay: `${index * 40}ms` }}
              />
            </span>
          ))}
        </div>
        <span
          aria-hidden="true"
          className={cn(
            'min-w-[5.5rem] text-right text-sm font-medium tabular-nums',
            pristine ? LEVEL_QUIET : LEVEL_SHOWN,
          )}
        >
          {levelText}
        </span>
      </div>
      <ul className="grid gap-1.5 text-sm">
        {rules.map((rule) => (
          <li
            key={rule.id}
            className={cn(
              'flex items-center gap-2 transition-colors duration-(--duration-base) motion-reduce:transition-none',
              rule.met ? RULE_MET : RULE_MISSING,
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'flex size-4.5 shrink-0 items-center justify-center rounded-full transition-colors duration-(--duration-base) motion-reduce:transition-none',
                rule.met ? MARK_MET : pristine ? MARK_PRISTINE : MARK_MISSING,
              )}
            >
              {rule.met ? (
                <Check className="size-3" strokeWidth={3} />
              ) : pristine ? null : (
                <X className="size-3" strokeWidth={3} />
              )}
            </span>
            <span>
              {rule.label}
              <span className="sr-only">{stateText(rule.met ? metText : missingText)}</span>
            </span>
          </li>
        ))}
      </ul>
      <p aria-live="polite" className="sr-only">
        {pristine ? null : summary}
      </p>
    </div>
  );
}

type PasswordMatchProps = {
  /** `null` until the second field has text. */
  matches: boolean | null;
  matchText: string;
  mismatchText: string;
  id?: string;
};

/** Under «Підтвердіть пароль»: a check and «Паролі збігаються», or a cross and the mismatch. */
function PasswordMatch({ matches, matchText, mismatchText, id }: PasswordMatchProps) {
  return (
    <p id={id} aria-live="polite" className="min-h-5 text-sm">
      {matches === null ? null : (
        <span className={cn('inline-flex items-center gap-1.5', matches ? MATCH_YES : MATCH_NO)}>
          {matches ? (
            <Check aria-hidden="true" className="size-4" strokeWidth={2.5} />
          ) : (
            <X aria-hidden="true" className="size-4" strokeWidth={2.5} />
          )}
          {matches ? matchText : mismatchText}
        </span>
      )}
    </p>
  );
}

export {
  PasswordMatch,
  type PasswordMatchProps,
  PasswordStrength,
  type PasswordStrengthProps,
  type StrengthRule,
};
