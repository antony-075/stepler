'use client';

import { Check, ChevronDown } from 'lucide-react';
import { Select as SelectPrimitive } from 'radix-ui';
import { createContext, useContext, useState, type ComponentProps } from 'react';
import { popoverSurfaceClassName } from '../lib/surfaces';
import { cn } from '../lib/utils';
import { fieldClassName } from './input';

/**
 * Whether the open select was driven by a pointer, for two rings a mouse user should not see.
 * Radix focuses the selected option from script on open, which Chromium shows as
 * `:focus-visible`; the list carries `data-input="pointer"` until a key is pressed in it, and only
 * `data-input="keyboard"` draws the option ring. Radix also returns focus to the trigger on close;
 * after an Escape that shows as `:focus-visible`, so a mouse user is left with a ring. A pointer
 * session returns focus with `focusVisible: false` instead (Chromium, Firefox; Safari ignores the
 * option). Keyboard sessions keep Radix's return and the ring. Same idea as DropdownMenu's
 * MenuSession, without its modal cases: a select is always modal.
 */
class PointerSession {
  private trigger: HTMLElement | null = null;

  /** A pointer press on the trigger starts a pointer session; a key press there ends it. */
  start(trigger: HTMLElement, pointer: boolean) {
    this.trigger = pointer ? trigger : null;
  }

  /** The trigger to focus without a ring on close, or null to leave it to Radix. */
  takeQuietReturn(): HTMLElement | null {
    const target = this.trigger;
    this.trigger = null;
    return target?.isConnected ? target : null;
  }
}

type SelectInput = {
  session: PointerSession;
  input: 'pointer' | 'keyboard';
  setInput: (input: 'pointer' | 'keyboard') => void;
};

const SelectInputContext = createContext<SelectInput | null>(null);

function Select(props: ComponentProps<typeof SelectPrimitive.Root>) {
  const [session] = useState(() => new PointerSession());
  const [input, setInput] = useState<'pointer' | 'keyboard'>('keyboard');
  return (
    <SelectInputContext.Provider value={{ session, input, setInput }}>
      <SelectPrimitive.Root data-slot="select" {...props} />
    </SelectInputContext.Provider>
  );
}

function SelectGroup(props: ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

function SelectValue(props: ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

// Based on shadcn/ui (new-york). Deviations: the Input's field look and height (44px with a 16px
// font on phones so iOS Safari does not zoom, 36px with a mouse from `md`), the edge stays dark while the list is open, and the
// trigger's icons are muted like the chevron.
function SelectTrigger({
  className,
  children,
  onPointerDown,
  onKeyDown,
  ...props
}: ComponentProps<typeof SelectPrimitive.Trigger>) {
  const context = useContext(SelectInputContext);
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      onPointerDown={(event) => {
        context?.session.start(event.currentTarget, true);
        context?.setInput('pointer');
        onPointerDown?.(event);
      }}
      onKeyDown={(event) => {
        context?.session.start(event.currentTarget, false);
        context?.setInput('keyboard');
        onKeyDown?.(event);
      }}
      className={cn(
        fieldClassName,
        'flex h-11 items-center justify-between gap-2 px-3 text-left whitespace-nowrap md:pointer-fine:h-9 data-[state=open]:border-muted-foreground data-placeholder:text-muted-foreground',
        '*:data-[slot=select-value]:flex *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 *:data-[slot=select-value]:truncate',
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown aria-hidden="true" className="text-muted-foreground" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

/**
 * The list as a popover card under the trigger (`popper` positioning, at least the trigger's
 * width, never wider than the viewport minus the gutters). No motion under reduced motion.
 */
function SelectContent({
  className,
  children,
  position = 'popper',
  sideOffset = 4,
  collisionPadding = 16,
  onCloseAutoFocus,
  onKeyDown,
  ...props
}: ComponentProps<typeof SelectPrimitive.Content>) {
  const context = useContext(SelectInputContext);
  const popper = position === 'popper';
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        position={position}
        sideOffset={popper ? sideOffset : undefined}
        collisionPadding={collisionPadding}
        data-input={context?.input ?? 'keyboard'}
        onKeyDown={(event) => {
          context?.setInput('keyboard');
          onKeyDown?.(event);
        }}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          const trigger = context?.session.takeQuietReturn() ?? null;
          if (event.defaultPrevented || trigger === null) return;
          event.preventDefault();
          trigger.focus({ preventScroll: true, focusVisible: false });
        }}
        className={cn(
          popoverSurfaceClassName,
          'relative max-h-(--radix-select-content-available-height) max-w-[calc(100vw-2rem)] min-w-[8rem] origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto',
          popper && 'min-w-[min(var(--radix-select-trigger-width),calc(100vw-2rem))]',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport
          data-slot="select-viewport"
          className={cn(popper && 'w-full scroll-my-1')}
        >
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({ className, ...props }: ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn('px-3 py-2 text-sm font-semibold text-muted-foreground', className)}
      {...props}
    />
  );
}

/**
 * A 44px option with a check on the right when selected. Icons before the text are muted unless
 * they set a colour; whatever is inside `SelectPrimitive.ItemText` (pass it as `children`) is
 * also what the trigger shows, so put an option's icon there too. Keyboard focus adds a solid
 * inset ring, as in DropdownMenu, because the hover fill alone is ~1.1:1 (not after a pointer
 * open, see SelectInput).
 */
function SelectItem({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        'relative flex min-h-11 w-full items-center gap-2 rounded-[5px] py-2 pr-9 pl-3 text-base outline-none md:pointer-fine:min-h-8 md:pointer-fine:py-1.5 md:pointer-fine:text-[0.875rem] select-none [overflow-wrap:anywhere] focus:bg-hover-popover [[data-input=keyboard]_&]:focus-visible:outline-2 [[data-input=keyboard]_&]:focus-visible:outline-solid [[data-input=keyboard]_&]:focus-visible:-outline-offset-2 [[data-input=keyboard]_&]:focus-visible:outline-ring data-disabled:pointer-events-none data-disabled:text-muted-foreground',
        'data-[state=checked]:font-semibold',
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
        className,
      )}
      {...props}
    >
      <span className="pointer-events-none absolute right-3 flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check aria-hidden="true" className="size-4 text-foreground" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>
        <span className="flex min-w-0 items-center gap-2">{children}</span>
      </SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn('pointer-events-none -mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
