'use client';

import { Check, Circle } from 'lucide-react';
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';
import { createContext, useContext, useEffect, useState, type ComponentProps } from 'react';
import { focusRingInset } from '../lib/focus';
import { popoverSurfaceClassName } from '../lib/surfaces';
import { cn } from '../lib/utils';

/**
 * How the current menu session was driven. Radix returns focus to the trigger on close with a
 * plain `focus()`, which the browser shows as `:focus-visible` after an Escape or Enter, so a
 * mouse user who opened the menu is left with a ring. A session that saw any pointer input
 * returns focus with `focusVisible: false` instead (Chromium, Firefox; Safari ignores the option
 * and may still show the ring). Keyboard-only sessions keep the ring.
 */
class MenuSession {
  private modal = true;
  private trigger: HTMLElement | null = null;
  private pointer = false;
  private skipReturn = false;

  setModal(modal: boolean) {
    this.modal = modal;
  }

  start(trigger: HTMLElement, pointer: boolean) {
    this.trigger = trigger;
    this.pointer = pointer;
    this.skipReturn = false;
  }

  pointerInside() {
    this.pointer = true;
  }

  // Radix skips the focus return after an outside press on a non-modal menu or a right click;
  // so does this.
  pointerOutside(rightClick: boolean) {
    this.pointer = true;
    this.skipReturn = !this.modal || rightClick;
  }

  /** The trigger to focus without a ring on close, or null to leave it to Radix. */
  takeQuietReturn(): HTMLElement | null {
    const target = this.pointer && !this.skipReturn ? this.trigger : null;
    this.pointer = false;
    this.skipReturn = false;
    return target?.isConnected ? target : null;
  }
}

const SessionContext = createContext<MenuSession | null>(null);

function DropdownMenu({
  modal = true,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  const [session] = useState(() => new MenuSession());
  useEffect(() => {
    session.setModal(modal);
  }, [session, modal]);
  return (
    <SessionContext.Provider value={session}>
      <DropdownMenuPrimitive.Root data-slot="dropdown-menu" modal={modal} {...props} />
    </SessionContext.Provider>
  );
}

function DropdownMenuPortal(props: ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
  return <DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />;
}

function DropdownMenuTrigger({
  onPointerDown,
  onKeyDown,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  const session = useContext(SessionContext);
  return (
    <DropdownMenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      onPointerDown={(event) => {
        session?.start(event.currentTarget, true);
        onPointerDown?.(event);
      }}
      onKeyDown={(event) => {
        session?.start(event.currentTarget, false);
        onKeyDown?.(event);
      }}
      {...props}
    />
  );
}

// Based on shadcn/ui (new-york). Deviations: items are 44px tall (rule 05) with 16px text, the
// menu never exceeds the viewport width minus the gutters, the direction C popover surface
// (lib/surfaces), no motion under reduced motion, no submenus or shortcuts until a slice needs
// them, and no focus ring left on the trigger after a pointer session (see MenuSession).
function DropdownMenuContent({
  className,
  sideOffset = 4,
  collisionPadding = 16,
  onPointerDown,
  onPointerDownOutside,
  onCloseAutoFocus,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  const session = useContext(SessionContext);
  return (
    <DropdownMenuPortal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        onPointerDown={(event) => {
          session?.pointerInside();
          onPointerDown?.(event);
        }}
        onPointerDownOutside={(event) => {
          session?.pointerOutside(event.detail.originalEvent.button === 2);
          onPointerDownOutside?.(event);
        }}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          const target = session?.takeQuietReturn() ?? null;
          if (event.defaultPrevented || target === null) return;
          event.preventDefault();
          target.focus({ focusVisible: false });
        }}
        className={cn(
          popoverSurfaceClassName,
          'max-h-(--radix-dropdown-menu-content-available-height) max-w-[calc(100vw-2rem)] min-w-[12rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto',
          className,
        )}
        {...props}
      />
    </DropdownMenuPortal>
  );
}

function DropdownMenuGroup(props: ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  return <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}

// Pointer hover highlights with `--hover-popover` only; keyboard focus adds the violet ring
// inside the item (≥ 6:1 against the highlight in both themes) because the fill alone is ~1.1:1.
// A 4px radius: the popover's 8px minus its 4px padding.
const itemClassName = cn(
  "relative flex min-h-11 cursor-default items-center gap-2.5 rounded-sheet px-3 py-2 text-base select-none [overflow-wrap:anywhere] focus:bg-hover-popover data-disabled:pointer-events-none data-disabled:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
  focusRingInset,
);

function DropdownMenuItem({
  className,
  inset,
  variant = 'default',
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean;
  variant?: 'default' | 'destructive';
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        itemClassName,
        'data-inset:pl-9',
        'data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive-soft data-[variant=destructive]:*:[svg]:text-destructive!',
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      className={cn(itemClassName, 'pl-9', className)}
      checked={checked}
      {...props}
    >
      <span className="pointer-events-none absolute left-3 flex size-4 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check aria-hidden="true" className="size-4 text-foreground" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

function DropdownMenuRadioGroup(props: ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
  return <DropdownMenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />;
}

function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(itemClassName, 'pl-9', className)}
      {...props}
    >
      <span className="pointer-events-none absolute left-3 flex size-4 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Circle aria-hidden="true" className="size-2 fill-foreground text-foreground" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Label> & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        'px-3 py-2 text-sm font-semibold text-muted-foreground [overflow-wrap:anywhere] data-inset:pl-9',
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
};
