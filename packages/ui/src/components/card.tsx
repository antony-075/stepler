// Temporary aliases while the app moves from shadcn's Card to Panel (DESIGN-SYSTEM.md §5.3,
// migration step 4). Import from './panel' in new code; this file goes once nothing uses it.
export {
  Panel as Card,
  PanelContent as CardContent,
  PanelDescription as CardDescription,
  PanelFooter as CardFooter,
  PanelHeader as CardHeader,
  PanelTitle as CardTitle,
} from './panel';
