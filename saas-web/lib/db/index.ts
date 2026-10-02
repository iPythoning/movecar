import { createDatabase } from './config';
import { getDatabaseRequestScope } from './request';

type Database = ReturnType<typeof createDatabase>;
let nodeDatabase: Database | undefined;

export function getDb(): Database {
  const scope = getDatabaseRequestScope();
  if (scope) {
    if (!scope.database) {
      const connectionString = scope.env.DATABASE_URL;
      if (typeof connectionString !== 'string' || !connectionString) {
        throw new Error('DATABASE_URL is required');
      }
      const maxConnections = Number(scope.env.MOVECAR_DB_MAX_CONNECTIONS);
      const connectTimeout = Number(scope.env.MOVECAR_DB_CONNECT_TIMEOUT_SECONDS);
      const idleTimeout = Number(scope.env.MOVECAR_DB_IDLE_TIMEOUT_SECONDS);
      const maxLifetime = Number(scope.env.MOVECAR_DB_MAX_LIFETIME_SECONDS);
      const closeTimeout = Number(scope.env.MOVECAR_DB_CLOSE_TIMEOUT_SECONDS);
      if (![maxConnections, connectTimeout, idleTimeout, maxLifetime, closeTimeout]
        .every(value => Number.isFinite(value) && value > 0) || !Number.isInteger(maxConnections)) {
        throw new Error('Cloudflare database resource configuration is required');
      }
      scope.database = createDatabase({
        connectionString, maxConnections, connectTimeout, idleTimeout, maxLifetime,
      });
    }
    return scope.database;
  }
  if (process.env.MOVECAR_RUNTIME === 'cloudflare') {
    throw new Error('Cloudflare database access requires a request scope');
  }
  if (!nodeDatabase) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is required');
    nodeDatabase = createDatabase({ connectionString });
  }
  return nodeDatabase;
}

// Resolve sockets within the request while preserving existing transaction APIs.
export const db: Database = new Proxy({} as Database, {
  get(_target, property) {
    const database = getDb();
    const value = Reflect.get(database, property, database);
    // postgres.js exposes a callable client with attached connection methods.
    if (property === '$client') return value;
    return typeof value === 'function' ? value.bind(database) : value;
  },
});

export const isDatabaseEnabled = !!process.env.DATABASE_URL;
