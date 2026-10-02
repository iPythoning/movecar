import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer, type Socket } from 'node:net';
import { createDatabase } from './config';
import { db } from './index';
import { getDatabaseRequestScope, withDatabaseRequest } from './request';

const environment = { MOVECAR_DB_CLOSE_TIMEOUT_SECONDS: '5' };
function installClient(closes: number[]) {
  const scope = getDatabaseRequestScope();
  assert.ok(scope);
  scope.database = { $close: async (timeout: number) => { closes.push(timeout); } } as unknown as NonNullable<typeof scope.database>;
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

test('database proxy preserves the PostgreSQL pool and its connection methods', async () => {
  const closes: number[] = [];
  const cleanup: Promise<unknown>[] = [];
  const client = { query: async (value: string) => value, end: async () => {} };
  const response = await withDatabaseRequest(environment, promise => cleanup.push(promise), async () => {
    const scope = getDatabaseRequestScope();
    assert.ok(scope);
    scope.database = { $client: client, $close: async (timeout: number) => { closes.push(timeout); } } as unknown as NonNullable<typeof scope.database>;
    assert.equal(db.$client, client);
    assert.equal(await (db.$client as unknown as typeof client).query('synthetic query'), 'synthetic query');
    assert.equal(db.$client.end, client.end);
    return new Response(null, { status: 204 });
  });
  assert.equal(response.status, 204);
  await Promise.all(cleanup);
  assert.deepEqual(closes, [5]);
});

test('database cleanup closes a socket that is still waiting for PostgreSQL authentication', async () => {
  const sockets = new Set<Socket>();
  let connected!: () => void;
  const accepted = new Promise<void>(resolve => { connected = resolve; });
  const server = createServer(socket => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    connected();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const database = createDatabase({
    connectionString: `postgresql://fixture@127.0.0.1:${address.port}/fixture`,
    maxConnections: 1, connectTimeout: 15,
  });
  try {
    const query = database.$client.query('SELECT 1').then(
      () => { throw new Error('The mock server cannot complete a query'); },
      () => {},
    );
    await accepted;
    assert.equal(database.$client.totalCount, 1);
    await assert.rejects(database.$close(0.02), /Database cleanup exceeded its deadline/);
    await query;
    assert.equal(database.$client.totalCount, 0);
    assert.equal(database.$client.ended, true);
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
