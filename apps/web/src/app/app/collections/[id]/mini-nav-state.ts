/**
 * Whether the collection page's mini-nav (from 1500px) is folded to its icon rail (owner remark
 * 176–177, 2026-10-06), remembered per browser in localStorage. Two choices are kept: the one made
 * on the «Гостьова сторінка» tab (the editor wants the room) and the one made on every other tab.
 * Storage can be missing or throw (private windows, blocked site data): reading then gives the
 * defaults and writing does nothing, and the page works the same.
 */
export type MiniNavChoice = 'collapsed' | 'expanded';

export const MINI_NAV_KEY = 'stepler:collection-nav';
export const MINI_NAV_EDITOR_KEY = 'stepler:collection-nav:editor';

export type MiniNavChoices = { general: MiniNavChoice | null; editor: MiniNavChoice | null };

type NavStorage = Pick<Storage, 'getItem' | 'setItem'>;

const parse = (value: string | null | undefined): MiniNavChoice | null =>
  value === 'collapsed' || value === 'expanded' ? value : null;

/** Both remembered choices; `null` for one never made, unknown or unreadable. */
export function readMiniNavChoices(storage: () => NavStorage | null): MiniNavChoices {
  try {
    const store = storage();
    return {
      general: parse(store?.getItem(MINI_NAV_KEY)),
      editor: parse(store?.getItem(MINI_NAV_EDITOR_KEY)),
    };
  } catch {
    return { general: null, editor: null };
  }
}

/** Remembers `choice` for the editor tab or for the others; a storage that throws is ignored. */
export function writeMiniNavChoice(
  storage: () => NavStorage | null,
  scope: 'editor' | 'general',
  choice: MiniNavChoice,
): void {
  try {
    storage()?.setItem(scope === 'editor' ? MINI_NAV_EDITOR_KEY : MINI_NAV_KEY, choice);
  } catch {
    // Not remembered this time.
  }
}

/**
 * Folded or not. The editor tab follows a choice made on it; without one it starts folded when
 * the window is narrower than 1700px (`roomy` false: the settings and the preview need the
 * width), else it follows the other tabs. The other tabs are expanded until folded.
 */
export function isMiniNavCollapsed({
  editorTab,
  roomy,
  choices,
}: {
  editorTab: boolean;
  roomy: boolean;
  choices: MiniNavChoices;
}): boolean {
  if (editorTab) {
    if (choices.editor !== null) return choices.editor === 'collapsed';
    if (!roomy) return true;
  }
  return choices.general === 'collapsed';
}
