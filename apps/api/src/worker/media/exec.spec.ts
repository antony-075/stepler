import { describe, expect, test } from 'vitest';
import { cleanStderr, run } from './exec.js';
import { PermanentMediaError } from './media-error.js';

describe('cleanStderr', () => {
  test('removes signed URLs, whole or in part, and caps the length', () => {
    const url = 'https://bucket.example/key?X-Amz-Signature=abc123&X-Amz-Credential=x';
    const text = cleanStderr(`[https @ 0x1] ${url}: Server returned 403\n${'x'.repeat(5000)}`, [
      url,
    ]);
    expect(text).not.toContain('X-Amz-Signature');
    expect(text).not.toContain('bucket.example');
    expect(text).toContain('Server returned 403');
    expect(text.length).toBeLessThanOrEqual(2048);
  });
});

describe('run', () => {
  test('resolves with stdout', async () => {
    const out = await run('node', ['-e', 'process.stdout.write("ok")'], { timeoutMs: 5000 });
    expect(out.toString()).toBe('ok');
  });

  test('a matching stderr is a permanent failure; others are retryable', async () => {
    const failing = ['-e', 'console.error("Invalid data found"); process.exit(1)'];
    await expect(
      run('node', failing, { timeoutMs: 5000, permanentIf: /Invalid data/ }),
    ).rejects.toThrow(PermanentMediaError);
    const error = await run('node', failing, { timeoutMs: 5000, permanentIf: /moov/ }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(PermanentMediaError);
  });

  test('a tool killed by the system (OOM) is a permanent failure, not a timeout', async () => {
    const error = await run('node', ['-e', 'process.kill(process.pid, "SIGKILL")'], {
      timeoutMs: 5000,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PermanentMediaError);
    expect((error as Error).message).toMatch(/killed by the system/);
  });

  test('kills a tool that runs past its timeout (retryable)', async () => {
    const error = await run('node', ['-e', 'setTimeout(() => {}, 10000)'], {
      timeoutMs: 200,
      permanentIf: /./,
    }).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(PermanentMediaError);
    expect((error as Error).message).toMatch(/timed out/);
  });
});
