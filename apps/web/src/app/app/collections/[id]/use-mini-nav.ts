import { useSyncExternalStore } from 'react';
import { useMediaQuery } from '@/components/use-media-query';
import {
  isMiniNavCollapsed,
  type MiniNavChoice,
  type MiniNavChoices,
  readMiniNavChoices,
  writeMiniNavChoice,
} from './mini-nav-state';

/** From 1700px the editor has the room for the expanded mini-nav beside it. */
const ROOMY = '(min-width: 106.25rem)';

// The choices this tab made, so a storage that cannot keep them (private windows) still folds.
let chosen: Partial<MiniNavChoices> = {};
const listeners = new Set<() => void>();

const browserStorage = () => (typeof window === 'undefined' ? null : window.localStorage);

// A string snapshot: useSyncExternalStore compares snapshots by identity.
function snapshot(): string {
  const stored = readMiniNavChoices(browserStorage);
  return `${chosen.general ?? stored.general ?? ''}|${chosen.editor ?? stored.editor ?? ''}`;
}

function parseSnapshot(value: string): MiniNavChoices {
  const [general, editor] = value.split('|');
  const choice = (part: string | undefined): MiniNavChoice | null =>
    part === 'collapsed' || part === 'expanded' ? part : null;
  return { general: choice(general), editor: choice(editor) };
}

/**
 * The mini-nav's fold (mini-nav-state.ts) on the tab shown: expanded on the server and while
 * hydrating (the page itself renders once its data arrives in the browser). `toggle` remembers
 * the new state for the editor tab when made there, else for the other tabs.
 */
export function useMiniNav(editorTab: boolean): { collapsed: boolean; toggle: () => void } {
  const roomy = useMediaQuery(ROOMY);
  const choices = parseSnapshot(
    useSyncExternalStore(
      (onChange) => {
        listeners.add(onChange);
        return () => listeners.delete(onChange);
      },
      snapshot,
      () => '|',
    ),
  );
  const collapsed = isMiniNavCollapsed({ editorTab, roomy, choices });
  const toggle = () => {
    const scope = editorTab ? 'editor' : 'general';
    const next: MiniNavChoice = collapsed ? 'expanded' : 'collapsed';
    chosen = { ...chosen, [scope]: next };
    writeMiniNavChoice(browserStorage, scope, next);
    for (const listener of listeners) listener();
  };
  return { collapsed, toggle };
}
