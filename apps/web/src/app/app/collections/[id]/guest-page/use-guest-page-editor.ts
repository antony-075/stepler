'use client';

import type { GuestPageEditor, GuestPageVersion } from '@stepler/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  discardGuestPageDraft,
  fetchGuestPage,
  guestPageKey,
  publishGuestPage,
  saveGuestPageDraft,
  useInvalidateCollections,
} from '@/api/collections';
import { useLeaveGuard } from '@/components/use-leave-guard';
import { Autosaver, type SaveFailure } from './autosave';
import {
  baseRevisionOf,
  editorReducer,
  type EditorAction,
  type EditorState,
  editorStatus,
  type EditorStatus,
  type EditorWorking,
  initialEditorState,
  previewPage,
} from './editor-state';

// The editor's server state and working copy (plan Task 13). TanStack Query holds the server's
// answer (`guestPageKey`); the working copy is local (`useReducer`) and autosaved into the draft
// (`Autosaver`). Image routes answer the whole editor state: `adopt` puts it in place without
// touching the working copy, so the next save names the draft revision they created or kept.

export interface GuestPageEditorApi {
  editor: GuestPageEditor;
  working: EditorWorking;
  dispatch: (action: Extract<EditorAction, { type: 'template' | 'settings' | 'welcome' }>) => void;
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
        onSaved: (editor, version) => {
          rawDispatch({ type: 'saved', editor, version });
          putServer(editor);
        },
        onState: setRequest,
      }),
  );
  useEffect(() => () => saver.dispose(), [saver]);
  // After every change: what the next save sends, with the draft revision known now.
  useEffect(() => {
    latest.current = state;
    saver.setSnapshot(
      state.pending
        ? {
            version: state.version,
            body: { baseRevision: baseRevisionOf(state.editor), ...state.working },
          }
        : null,
    );
  }, [saver, state]);

  // Answers that reach the query from elsewhere (a refetch, another tab's change once loaded).
  const server = useQuery({
    queryKey: guestPageKey(collectionId),
    queryFn: () => fetchGuestPage(collectionId),
    initialData: initial,
  });
  useEffect(() => {
    if (server.data !== latest.current.editor) rawDispatch({ type: 'server', editor: server.data });
  }, [server.data]);

  const dispatch = useCallback<GuestPageEditorApi['dispatch']>(
    (action) => {
      rawDispatch(action);
      saver.schedule();
    },
    [saver],
  );

  const adopt = useCallback(
    (editor: GuestPageEditor) => {
      rawDispatch({ type: 'server', editor });
      putServer(editor);
    },
    [putServer],
  );

  const save = useCallback(async () => {
    await saver.flush();
    const revision = baseRevisionOf(latest.current.editor);
    if (revision === null) return;
    setPublishing(true);
    try {
      const editor = await publishGuestPage(collectionId, revision);
      rawDispatch({ type: 'reset', editor });
      putServer(editor);
      // The dashboard card and the detail show the published cover and welcome.
      await invalidate();
    } finally {
      setPublishing(false);
    }
  }, [collectionId, invalidate, putServer, saver]);

  const reset = useCallback(async () => {
    saver.dispose();
    await discardGuestPageDraft(collectionId);
    const editor = await fetchGuestPage(collectionId);
    rawDispatch({ type: 'reset', editor });
    putServer(editor);
    saver.clearFailure();
  }, [collectionId, putServer, saver]);

  const reloadLatest = useCallback(async () => {
    const editor = await fetchGuestPage(collectionId);
    rawDispatch({ type: 'reset', editor });
    putServer(editor);
    saver.clearFailure();
  }, [collectionId, putServer, saver]);

  const retry = useCallback(() => {
    saver.clearFailure();
    saver.schedule();
  }, [saver]);

  useLeaveGuard(state.pending || request.inFlight || publishing, t('leave'));

  const status = editorStatus(state, {
    inFlight: request.inFlight || publishing,
    failure: request.failure,
  });
  const page = useMemo(() => previewPage(state), [state]);
  return {
    editor: state.editor,
    working: state.working,
    dispatch,
    status,
    dirty: state.pending || state.editor.draft !== null,
    previewPage: page,
    adopt,
    save,
    reset,
    reloadLatest,
    retry,
  };
}
