import { cn } from './utils';

/**
 * The raised surface of menus and the select list (DESIGN-SYSTEM.md §2.6, §5.5): `--popover`
 * with a 1px edge, an 8px radius and `--shadow-popover` (light only; dark has no shadow and
 * relies on the lighter popover colour and the edge). Opens with a fade and a 4px drop from the
 * trigger (180ms), closes with a fade (120ms); nothing moves under reduced motion.
 */
export const popoverSurfaceClassName = cn(
  'z-(--z-popover) rounded-control border bg-popover p-1 text-popover-foreground shadow-popover',
  'animation-duration-[var(--duration-base)] data-[state=closed]:animation-duration-[var(--duration-fast)]',
  'motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0',
  'motion-safe:data-[side=bottom]:data-[state=open]:slide-in-from-top-1 motion-safe:data-[side=left]:data-[state=open]:slide-in-from-right-1 motion-safe:data-[side=right]:data-[state=open]:slide-in-from-left-1 motion-safe:data-[side=top]:data-[state=open]:slide-in-from-bottom-1',
);
