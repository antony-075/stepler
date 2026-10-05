'use client';

import type { GuestPageEditor, GuestPageVersion } from '@stepler/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useToast } from '@stepler/ui/components/toast';
import { isApiError } from '@/api/client';
import {
  discardGuestPageDraft,
  fetchGuestPage,
  guestPageKey,
  publishGuestPage,
  removeDraftImage,
  restoreDraftImage,
  saveGuestPageDraft,
  useInvalidateCollections,
} from '@/api/collections';
import { useLeaveGuard } from '@/components/use-leave-guard';
import { Autosaver, type SaveFailure } from './autosave';
import {
  baseRevisionOf,
  currentVersion,
  differsFromPublished,
  editorReducer,
  type EditorAction,
  type EditorState,
  editorStatus,
  type EditorStatus,
  type EditorWorking,
  imageIdsOf,
  initialEditorState,
  previewPage,
  sameWorking,
} from './editor-state';
import {
  canRedo,
  canUndo,
  dropImage,
  type History,
  initHistory,
  record,
  redo,
  type Snapshot,
  undo,
} from './history';

/** The undo step of an editor state: its working copy and the draft's images. */
const snapshotOf = (state: Pick<EditorState, 'editor' | 'working'>): Snapshot => ({
  working: state.working,
  images: imageIdsOf(currentVersion(state.editor)),
});

// The editor's server state and working copy (plan Task 13). TanStack Query holds the server's
// answer (`guestPageKey`); the working copy is local (`useReducer`) and autosaved into the draft
// (`Autosaver`). Image routes answer the whole editor state: `adopt` puts it in place without
// touching the working copy, so the next save names the draft revision they created or kept.

export interface GuestPageEditorApi {
  editor: GuestPageEditor;
  working: EditorWorking;
  /** Changes when the working copy was replaced from the server: local inputs start over. */
  generation: number;
  /**
   * A change of the working copy. `coalesce` names the control for undo: rapid changes of the
   * same one (typing the welcome, dragging the dimming) are one step (owner remark 113).
   */
  dispatch: (
    action: Extract<EditorAction, { type: 'template' | 'settings' | 'welcome' }>,
    coalesce?: string,
  ) => void;
  status: EditorStatus;
  /** Local changes or a draft on the server: something guests do not see yet. */
  dirty: boolean;
  previewPage: GuestPageVersion;
  /** An image route's answer: the server state, the working copy untouched. */
  adopt: (editor: GuestPageEditor) => void;
  /** «Зберегти»: sends what is pending, then publishes the draft. */
  save: () => Promise<void>;
  /** «Скинути зміни»: deletes the draft; the working copy is the published version again. */
  reset: () => Promise<void>;
  /** «Показати останню версію» after a conflict. */
  reloadLatest: () => Promise<void>;
  /** «Повторити» after a failed save. */
  retry: () => void;
  /** Undo / redo a step (the working copy and the draft's images). */
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useGuestPageQuery(collectionId: string) {
  return useQuery({
    queryKey: guestPageKey(collectionId),
    queryFn: () => fetchGuestPage(collectionId),
  });
}

/** Call with the first server answer (the tab waits for it). */
export function useGuestPageEditor(
  collectionId: string,
  initial: GuestPageEditor,
): GuestPageEditorApi {
  const t = useTranslations('guestPage');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateCollections();
  const [state, rawDispatch] = useReducer(
    (current: EditorState, action: EditorAction) => editorReducer(current, action),
    initial,
    initialEditorState,
  );
  const [request, setRequest] = useState<{ inFlight: boolean; failure: SaveFailure | null }>({
    inFlight: false,
    failure: null,
  });
  const [publishing, setPublishing] = useState(false);
  const [history, setHistory] = useState<History>(() =>
    initHistory(snapshotOf(initialEditorState(initial))),
  );
  const historyRef = useRef(history);
  const stepping = useRef(false);
  // The editor state the callbacks act on (read in handlers and effects only).
  const latest = useRef(state);
  const putServer = useCallback(
    (editor: GuestPageEditor) => queryClient.setQueryData(guestPageKey(collectionId), editor),
    [collectionId, queryClient],
  );

  const [saver] = useState(
    () =>
      new Autosaver({
        send: (body) => saveGuestPageDraft(collectionId, body),
        initialBaseRevision: baseRevisionOf(initial),
        onSaved: (editor, version) => {
          rawDispatch({ type: 'saved', editor, version });
          putServer(editor);
        },
        onState: setRequest,
      }),
  );
  useEffect(() => () => saver.dispose(), [saver]);
  // The draft revision the next save or publish names (the saver holds it): set at once from
  // every answer of our own (a save, an image route, a publish, a reset), not after a render, so
  // a save that follows straight on never names the revision before. A refetch moves it only
  // while nothing is pending: with local changes, another tab's newer draft must end in a
  // conflict, not be overwritten.
  const know = useCallback(
    (editor: GuestPageEditor) => saver.setBaseRevision(baseRevisionOf(editor)),
    [saver],
  );
  // After every change: what the next save sends, with the draft revision known now.
  useEffect(() => {
    latest.current = state;
    historyRef.current = history;
    saver.setSnapshot(state.pending ? { version: state.version, working: state.working } : null);
  }, [history, saver, state]);

  // Answers that reach the query from elsewhere (a refetch, another tab's change once loaded).
  const server = useQuery({
    queryKey: guestPageKey(collectionId),
    queryFn: () => fetchGuestPage(collectionId),
    initialData: initial,
  });
  useEffect(() => {
    if (server.data === latest.current.editor) return;
    if (!latest.current.pending) know(server.data);
    rawDispatch({ type: 'server', editor: server.data });
  }, [know, server.data]);

  const dispatch = useCallback<GuestPageEditorApi['dispatch']>(
    (action, coalesce) => {
      const next = editorReducer(latest.current, action);
      latest.current = next;
      rawDispatch(action);
      setHistory((h) => record(h, snapshotOf(next), coalesce ?? null, Date.now()));
      saver.schedule();
    },
    [saver],
  );

  const adopt = useCallback(
    (editor: GuestPageEditor) => {
      know(editor);
      rawDispatch({ type: 'server', editor });
      putServer(editor);
      // A new or removed image is an undo step too.
      const working = latest.current.working;
      setHistory((h) =>
        record(h, { working, images: imageIdsOf(currentVersion(editor)) }, null, Date.now()),
      );
    },
    [know, putServer],
  );

  /** A new history from what the server has now (after a publish, a reset, the latest version). */
  const restartHistory = useCallback((editor: GuestPageEditor) => {
    setHistory(initHistory(snapshotOf(initialEditorState(editor))));
  }, []);

  /**
   * Applies a step: the draft's images first (restored by id, or removed), then the working copy
   * (autosaved as any change). An image that is gone (`404`) takes its steps with it and says so;
   * the history then stays where it was.
   */
  const step = useCallback(
    async (direction: 'undo' | 'redo') => {
      if (stepping.current) return;
      const target = (direction === 'undo' ? undo : redo)(historyRef.current);
      if (target === null) return;
      stepping.current = true;
      try {
        const now = snapshotOf(latest.current);
        for (const slot of ['cover', 'background'] as const) {
          const wanted = target.present.images[slot];
          if (wanted === now.images[slot]) continue;
          try {
            const editor =
              wanted === null
                ? await removeDraftImage(collectionId, slot)
                : await restoreDraftImage(collectionId, slot, wanted);
            know(editor);
            rawDispatch({ type: 'server', editor });
            putServer(editor);
          } catch (error) {
            if (wanted !== null && isApiError(error) && error.code === 'NOT_FOUND') {
              setHistory((h) => dropImage(h, wanted));
              toast({ variant: 'info', title: t('history.imageGone') });
            } else {
              toast({ variant: 'error', title: t('history.failed') });
            }
            return;
          }
        }
        if (!sameWorking(target.present.working, latest.current.working)) {
          rawDispatch({ type: 'restore', working: target.present.working });
          saver.schedule();
        }
        setHistory(target);
      } finally {
        stepping.current = false;
      }
    },
    [collectionId, know, putServer, saver, t, toast],
  );

  const save = useCallback(async () => {
    await saver.flush();
    const revision = saver.baseRevision;
    if (revision === null) return;
    setPublishing(true);
    try {
      const editor = await publishGuestPage(collectionId, revision);
      know(editor);
      rawDispatch({ type: 'reset', editor });
      putServer(editor);
      restartHistory(editor);
      // The dashboard card and the detail show the published cover and welcome.
      await invalidate();
    } finally {
      setPublishing(false);
    }
  }, [collectionId, invalidate, know, putServer, restartHistory, saver]);

  const reset = useCallback(async () => {
    saver.dispose();
    await discardGuestPageDraft(collectionId);
    const editor = await fetchGuestPage(collectionId);
    know(editor);
    rawDispatch({ type: 'reset', editor });
    putServer(editor);
    restartHistory(editor);
    saver.clearFailure();
  }, [collectionId, know, putServer, restartHistory, saver]);

  const reloadLatest = useCallback(async () => {
    const editor = await fetchGuestPage(collectionId);
    know(editor);
    rawDispatch({ type: 'reset', editor });
    putServer(editor);
    restartHistory(editor);
    saver.clearFailure();
  }, [collectionId, know, putServer, restartHistory, saver]);

  const retry = useCallback(() => {
    saver.clearFailure();
    saver.schedule();
  }, [saver]);

  const undoStep = useCallback(() => void step('undo'), [step]);
  const redoStep = useCallback(() => void step('redo'), [step]);

  useLeaveGuard(state.pending || request.inFlight || publishing, t('leave'));

  const status = editorStatus(state, {
    inFlight: request.inFlight || publishing,
    failure: request.failure,
  });
  const page = useMemo(() => previewPage(state), [state]);
  return {
    editor: state.editor,
    working: state.working,
    generation: state.generation,
    dispatch,
    status,
    // By value (owner remark 113): changed and changed back is not dirty, whatever the draft.
    dirty: differsFromPublished(state),
    previewPage: page,
    adopt,
    save,
    reset,
    reloadLatest,
    retry,
    undo: undoStep,
    redo: redoStep,
    canUndo: canUndo(history),
    canRedo: canRedo(history),
  };
}
