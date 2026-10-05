'use client';

import { Button } from '@stepler/ui/components/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@stepler/ui/components/tooltip';
import { cn } from '@stepler/ui/lib/utils';
import { Redo2, Undo2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import type { GuestPageEditorApi } from './use-guest-page-editor';

/**
 * «Скасувати дію» / «Повторити дію» (owner remark 113): two icon buttons with tooltips, in the
 * settings panel's save bar on a computer and in the sheet's header on a phone. Waiting
 * (`aria-disabled`) while there is nothing to undo or redo.
 */
export function HistoryButtons({
  editor,
  touch = false,
}: {
  editor: Pick<GuestPageEditorApi, 'undo' | 'redo' | 'canUndo' | 'canRedo'>;
  /** 44px targets (the phone sheet). */
  touch?: boolean;
}) {
  const t = useTranslations('guestPage.history');
  const buttons = [
    { label: t('undo'), Icon: Undo2, enabled: editor.canUndo, run: editor.undo, slot: 'undo' },
    { label: t('redo'), Icon: Redo2, enabled: editor.canRedo, run: editor.redo, slot: 'redo' },
  ] as const;
  return (
    <TooltipProvider>
      <div className="flex shrink-0 items-center" data-slot="history-buttons">
        {buttons.map(({ label, Icon, enabled, run, slot }) => (
          <Tooltip key={slot}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={label}
                aria-disabled={!enabled || undefined}
                data-slot={`history-${slot}`}
                // 36px in the panel's bar (it must fit 300px), 44px on touch and in the sheet.
                className={cn('aria-disabled:text-muted-foreground/60', {
                  'size-11': touch,
                  'size-9 pointer-coarse:size-11': !touch,
                })}
                onClick={() => {
                  if (enabled) run();
                }}
              >
                <Icon aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}

/** Text fields keep their own undo: the shortcuts never take it from them. */
const isTextField = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') !==
    null;

/**
 * Cmd/Ctrl+Z undoes, Cmd/Ctrl+Shift+Z or Ctrl+Y redoes, anywhere in the editor's page except
 * while typing in a text field (the browser's own text undo works there).
 */
export function useHistoryShortcuts(
  editor: Pick<GuestPageEditorApi, 'undo' | 'redo'>,
  enabled: boolean,
) {
  const { undo, redo } = editor;
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      if (isTextField(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((key === 'z' && event.shiftKey) || (key === 'y' && event.ctrlKey)) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, redo, undo]);
}
