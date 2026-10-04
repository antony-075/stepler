import { execFile } from 'node:child_process';
import { PermanentMediaError } from './media-error.js';

/** At most this much of a tool's stderr is kept for the error (and so for the logs). */
const MAX_STDERR_CHARS = 2048;
/** A tool's stdout (a PNG frame) is held in memory; a 1600 px frame is far below this. */
const MAX_STDOUT_BYTES = 64 * 1024 * 1024;

export interface RunOptions {
  timeoutMs: number;
  /** Removed from stderr before it reaches an error message: presigned URLs are credentials. */
  secrets?: readonly string[];
  /** stderr patterns that mean the input is bad (not a transient failure). */
  permanentIf?: RegExp;
}

/** Strips secrets and every URL (a signed one may appear partly re-encoded), then caps it. */
export function cleanStderr(stderr: string, secrets: readonly string[] = []): string {
  let text = stderr;
  for (const secret of secrets) text = text.split(secret).join('<url>');
  return text
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, '<url>')
    .trim()
    .slice(0, MAX_STDERR_CHARS);
}

/**
 * Runs a media tool without a shell (arguments are never parsed), with a hard timeout
 * (`SIGKILL`). Resolves with stdout; rejects with the cleaned stderr. A non-zero exit whose
 * stderr matches `permanentIf` is a `PermanentMediaError`.
 */
export function run(
  command: string,
  args: readonly string[],
  options: RunOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        encoding: 'buffer',
        timeout: options.timeoutMs,
        killSignal: 'SIGKILL',
        maxBuffer: MAX_STDOUT_BYTES,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve(stdout);
          return;
        }
        const detail = cleanStderr(stderr.toString('utf8'), options.secrets);
        const timedOut = error.killed === true || error.signal === 'SIGKILL';
        const message = timedOut
          ? `${command} timed out after ${options.timeoutMs} ms`
          : `${command} failed (${String(error.code ?? error.signal)}): ${detail}`;
        reject(
          !timedOut && options.permanentIf?.test(detail) === true
            ? new PermanentMediaError(message)
            : new Error(message),
        );
      },
    );
  });
}
