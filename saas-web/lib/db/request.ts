import { AsyncLocalStorage } from 'node:async_hooks';
import type { createDatabase } from './config';

type Database = ReturnType<typeof createDatabase>;
type Scope = { env: Record<string, unknown>; database?: Database; auth?: unknown };
const storageKey = Symbol.for('movecar.database.request-storage');
const globals = globalThis as unknown as Record<symbol, unknown>;

// The custom Worker and bundled Next server share one request scope even when
// the adapter emits separate copies of this module.
if (!globals[storageKey]) {
  Object.defineProperty(globals, storageKey, { value: new AsyncLocalStorage<Scope>() });
}
const storage = globals[storageKey] as AsyncLocalStorage<Scope>;

export function getDatabaseRequestScope() {
  return storage.getStore();
}

export async function withDatabaseRequest(
  env: Record<string, unknown>,
  waitUntil: (promise: Promise<unknown>) => void,
  handle: () => Promise<Response>,
): Promise<Response> {
  const scope: Scope = { env };
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    if (!scope.database) return;
    const timeout = Number(env.MOVECAR_DB_CLOSE_TIMEOUT_SECONDS);
    if (!Number.isFinite(timeout) || timeout <= 0) {
      throw new Error('MOVECAR_DB_CLOSE_TIMEOUT_SECONDS must be a positive number');
    }
    waitUntil(scope.database.$close(timeout));
  };
  return storage.run(scope, async () => {
    try {
      const response = await handle();
      if (!response.body) {
        close();
        return response;
      }
      const reader = response.body.getReader();
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          await storage.run(scope, async () => {
            try {
              const result = await reader.read();
              if (result.done) {
                close();
                controller.close();
              } else {
                controller.enqueue(result.value);
              }
            } catch (error) {
              close();
              controller.error(error);
            }
          });
        },
        async cancel(reason) {
          await storage.run(scope, async () => {
            try { await reader.cancel(reason); } finally { close(); }
          });
        },
      });
      return new Response(body, response);
    } catch (error) {
      close();
      throw error;
    }
  });
}
