import { Eye, EyeOff } from 'lucide-react';
import { type ComponentProps, useState } from 'react';
import { focusRing } from '../lib/focus';
import { cn } from '../lib/utils';
import { Input } from './input';

type PasswordInputProps = Omit<ComponentProps<'input'>, 'type'> & {
  /** The toggle's names, in the page's language («Показати пароль» / «Сховати пароль»). */
  showLabel: string;
  hideLabel: string;
};

/**
 * A password field with a show/hide toggle inside its right edge (ui-ux-pro-max: «Let users see
 * the password while typing»). The toggle is a real 44px button on touch, named by what it does
 * and `aria-pressed` while the password shows; it never takes the field's focus order first.
 */
function PasswordInput({ className, showLabel, hideLabel, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  return (
    <div data-slot="password-input" className="relative">
      <Input
        type={visible ? 'text' : 'password'}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className={cn('pr-12', className)}
        {...props}
      />
      <button
        type="button"
        aria-label={visible ? hideLabel : showLabel}
        aria-pressed={visible}
        onClick={() => setVisible((shown) => !shown)}
        disabled={props.disabled}
        className={cn(
          'absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-control text-muted-foreground hover:text-foreground disabled:pointer-events-none',
          focusRing,
        )}
      >
        <Icon aria-hidden="true" className="size-[18px]" />
      </button>
    </div>
  );
}

export { PasswordInput, type PasswordInputProps };
