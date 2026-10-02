import assert from 'node:assert/strict';
import test from 'node:test';
import { getDatabaseRequestScope, withDatabaseRequest } from './request';

const environment = { MOVECAR_DB_CLOSE_TIMEOUT_SECONDS: '5' };
function installClient(closes: number[]) {
  const scope = getDatabaseRequestScope();
  assert.ok(scope);
  scope.database = { $client: { end: async ({ timeout }: { timeout: number }) => { closes.push(timeout); } } } as unknown as NonNullable<typeof scope.database>;
  return scope;
}

test('concurrent requests keep separate scope through streamed responses and close once', async () => {
  const scopes: unknown[] = [];
  const closes: number[][] = [[], []];
  const cleanup: Promise<unknown>[] = [];
  const responses = await Promise.all(closes.map((closed, index) => withDatabaseRequest(
    environment, promise => cleanup.push(promise), async () => {
      const scope = installClient(closed);
      scopes.push(scope);
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(getDatabaseRequestScope(), scope);
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(String(index)));
          controller.close();
        },
      }));
    },
  )));
  assert.notEqual(scopes[0], scopes[1]);
  assert.equal(getDatabaseRequestScope(), undefined);
  assert.deepEqual(await Promise.all(responses.map(response => response.text())), ['0', '1']);
  await Promise.all(cleanup);
  assert.deepEqual(closes, [[5], [5]]);
});

test('cancelled response releases its request database', async () => {
  const closes: number[] = [];
  const cleanup: Promise<unknown>[] = [];
  const response = await withDatabaseRequest(environment, promise => cleanup.push(promise), async () => {
    const scope = installClient(closes);
    return new Response(new ReadableStream({
      cancel() { assert.equal(getDatabaseRequestScope(), scope); },
    }));
  });
  await response.body!.cancel();
  await Promise.all(cleanup);
  assert.deepEqual(closes, [5]);
});

test('handler rejection propagates and releases its request database', async () => {
  const closes: number[] = [];
  const cleanup: Promise<unknown>[] = [];
  await assert.rejects(withDatabaseRequest(environment, promise => cleanup.push(promise), async () => {
    installClient(closes);
    throw new Error('synthetic handler failure');
  }), /synthetic handler failure/);
  await Promise.all(cleanup);
  assert.deepEqual(closes, [5]);
  assert.equal(getDatabaseRequestScope(), undefined);
});

test('requests without database access create no database cleanup task', async () => {
  const cleanup: Promise<unknown>[] = [];
  const response = await withDatabaseRequest(environment, promise => cleanup.push(promise), async () => new Response(null, { status: 204 }));
  assert.equal(response.status, 204);
  assert.deepEqual(cleanup, []);
});
