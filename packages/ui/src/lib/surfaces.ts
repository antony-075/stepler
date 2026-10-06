import { cn } from './utils';

/**
 * The raised surface of menus and the select list (DESIGN-SYSTEM.md §0.4, §0.6): `--popover`
 * with a 1px edge, an 8px radius and `--shadow-popover`. Pops in from its trigger (140ms: a
 * fade, 4px of travel and a 0.98 → 1 scale from the trigger's side), leaves faster with a fade
 * (100ms); transform and opacity only, nothing moves under reduced motion.
 */
export const popoverSurfaceClassName = cn(
  'z-(--z-popover) rounded-sheet border bg-popover p-1 text-popover-foreground shadow-popover ease-out',
  'animation-duration-[var(--duration-menu)] data-[state=closed]:animation-duration-[100ms]',
  'motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=open]:zoom-in-98 motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0',
  'motion-safe:data-[side=bottom]:data-[state=open]:slide-in-from-top-1 motion-safe:data-[side=left]:data-[state=open]:slide-in-from-right-1 motion-safe:data-[side=right]:data-[state=open]:slide-in-from-left-1 motion-safe:data-[side=top]:data-[state=open]:slide-in-from-bottom-1',
);
