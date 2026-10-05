import type { GuestPageEditor, SaveGuestPageDraftRequest } from '@stepler/contracts';
import { isApiError } from '@/api/client';

// Autosave of the working copy (plan Task 13, Review Focus 2): 800 ms after the last change, at
// most one request in flight, and each request built when it is sent, so it names the latest
// draft revision the editor knows: each answer's at once (never after a render), and an image
// route's answer through `setBaseRevision`. A conflict stops it until
// the owner loads the latest version: a 409 is never sent again. Framework-free, so it is tested
// with fake timers.

export const AUTOSAVE_DELAY_MS = 800;

export type SaveFailure = 'error' | 'conflict';

export interface AutosaveSnapshot {
  working: Omit<SaveGuestPageDraftRequest, 'baseRevision'>;
  /** The working copy's change counter when it was taken. */
  version: number;
}

export interface AutosaveOptions {
  send: (body: SaveGuestPageDraftRequest) => Promise<GuestPageEditor>;
  /** The draft revision of the editor state the working copy started from. */
  initialBaseRevision: number | null;
  onSaved: (editor: GuestPageEditor, version: number) => void;
  onState: (state: { inFlight: boolean; failure: SaveFailure | null }) => void;
  delayMs?: number;
}

export class Autosaver {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;
  private failure: SaveFailure | null = null;
  /** A change arrived while a request was in flight: send again once it ends. */
  private again = false;
  /** What a request would send now; kept current by the caller after every change. */
  private snapshot: AutosaveSnapshot | null = null;
  /** The draft revision the next save names. */
  private base: number | null;

  constructor(private readonly options: AutosaveOptions) {
    this.base = options.initialBaseRevision;
  }

  /** Another answer of the editor's own (an image route, a publish, a reset, a rebase). */
  setBaseRevision(revision: number | null): void {
    this.base = revision;
  }

  get baseRevision(): number | null {
    return this.base;
  }

  /** The working copy to send next (`null`: nothing pending). Read when a request starts. */
  setSnapshot(snapshot: AutosaveSnapshot | null): void {
    this.snapshot = snapshot;
  }

  /** A local change: (re)start the delay. Does nothing after a conflict. */
  schedule(): void {
    if (this.failure === 'conflict') return;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, this.options.delayMs ?? AUTOSAVE_DELAY_MS);
  }

  /** Sends what is pending now and waits for it (before a publish). Rejects on a failure. */
  async flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.inFlight !== null) await this.inFlight;
    await this.run();
    if (this.failure !== null) throw new Error(this.failure);
  }

  /** «Повторити» after an error, or after the latest version was loaded following a conflict. */
  clearFailure(): void {
    this.failure = null;
    this.emit();
  }

  dispose(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  get state(): { inFlight: boolean; failure: SaveFailure | null } {
    return { inFlight: this.inFlight !== null, failure: this.failure };
  }

  private async run(): Promise<void> {
    if (this.failure === 'conflict') return;
    if (this.inFlight !== null) {
      this.again = true;
      return this.inFlight;
    }
    const snapshot = this.snapshot;
    if (snapshot === null) return;
    this.failure = null;
    const body = { baseRevision: this.base, ...snapshot.working };
    this.inFlight = this.options.send(body).then(
      (editor) => {
        this.base = editor.draft?.revision ?? null;
        this.options.onSaved(editor, snapshot.version);
      },
      (error: unknown) => {
        this.failure = isApiError(error, 'GUEST_PAGE_DRAFT_CONFLICT') ? 'conflict' : 'error';
      },
    );
    this.emit();
    await this.inFlight;
    this.inFlight = null;
    this.emit();
    if (this.again && this.failure === null) {
      this.again = false;
      await this.run();
    } else {
      this.again = false;
    }
  }

  private emit(): void {
    this.options.onState(this.state);
  }
}
