import type { INestApplication } from '@nestjs/common';

/**
 * Initialises the app and binds its HTTP server to 127.0.0.1 on a free port.
 *
 * Left alone, supertest listens on `::` (all interfaces) and then connects to
 * `127.0.0.1:<port>`. On macOS another process bound to `127.0.0.1` on that same port
 * (a Docker port forward, an IDE, the Mailpit UI) wins that connection, and the test sees
 * that process's 404/405. Listening on the loopback address explicitly makes the port
 * ours; supertest reuses an already listening server as is.
 */
export async function listenOnLoopback(app: INestApplication): Promise<void> {
  await app.listen(0, '127.0.0.1');
}
