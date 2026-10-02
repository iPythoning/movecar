import { drizzle } from 'drizzle-orm/node-postgres';
import { Client, Pool, type ClientConfig } from 'pg';
import * as schema from './schema';

interface DBConfig {
  connectionString: string;
  maxConnections?: number;
  enablePrepare?: boolean;
  enableSSL?: boolean | 'require';
  debug?: boolean;
  connectTimeout?: number;
  idleTimeout?: number;
  maxLifetime?: number;
  hyperdrive?: boolean;
  queryTimeout?: number;
}

// detect deployment platform
function detectPlatform() {
  if (process.env.VERCEL_ENV) return 'vercel';
  if (process.env.NETLIFY) return 'netlify';
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) return 'lambda';
  return 'server';
}

// detect database provider
function detectDatabase(connectionString: string) {
  if (connectionString.includes('supabase')) return 'supabase';
  if (connectionString.includes('neon')) return 'neon';
  if (connectionString.includes('amazonaws.com')) return 'aws-rds';
  if (connectionString.includes('googleapis.com')) return 'gcp-sql';
  return 'self-hosted';
}

// generate database configuration
export function createDatabaseConfig(config: DBConfig) {
  const platform = detectPlatform();
  const database = detectDatabase(config.connectionString);

  // base configuration template
  const platformConfigs = {
    // Serverless platform configuration
    vercel: {
      max: 3,
      prepare: false,
      idle_timeout: 20,
      max_lifetime: 60 * 30,
      connect_timeout: 15,
    },
    netlify: {
      max: 3,
      prepare: false,
      idle_timeout: 20,
      max_lifetime: 60 * 30,
      connect_timeout: 15,
    },
    lambda: {
      max: 3,
      prepare: false,
      idle_timeout: 20,
      max_lifetime: 60 * 30,
      connect_timeout: 30,
    },
    // long running server
    server: {
      max: 30,
      prepare: true,
      idle_timeout: 300,
      max_lifetime: 3600,
      connect_timeout: 30,
    },
  };

  // database specific configuration
  const databaseConfigs = {
    supabase: {
      ssl: 'require' as const,
      application_name: 'drizzle-supabase',
      // CRITICAL: Supabase pooled connections go through PgBouncer (transaction mode).
      // PgBouncer does NOT support prepared statements — using prepare: true causes
      // silent transaction failures where COMMIT succeeds but data is rolled back.
      // See: https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler
      prepare: false,
      // PostgreSQL connection parameters
      // See: https://www.postgresql.org/docs/current/runtime-config-client.html
      connection: {
        statement_timeout: 30000,
      },
    },
    neon: {
      ssl: 'require' as const,
      application_name: 'drizzle-neon',
      prepare: false,
      connect_timeout: 20,
    },
    'aws-rds': {
      ssl: 'require' as const,
      application_name: 'drizzle-aws',
      keepalive: true,
      idle_timeout: 60,
    },
    'gcp-sql': {
      ssl: 'require' as const,
      application_name: 'drizzle-gcp',
      keepalive: true,
    },
    'self-hosted': {
      ssl: false,
      application_name: 'drizzle-app',
    },
  };

  const platformConfig = platformConfigs[platform];
  const databaseConfig = databaseConfigs[database];

  const finalConfig = {
    ...platformConfig,
    ...databaseConfig,

    ...(config.maxConnections && { max: config.maxConnections }),
    ...(config.enablePrepare !== undefined && { prepare: config.enablePrepare }),
    ...(config.enableSSL !== undefined && { ssl: config.enableSSL }),
    ...(config.connectTimeout !== undefined && { connect_timeout: config.connectTimeout }),
    ...(config.idleTimeout !== undefined && { idle_timeout: config.idleTimeout }),
    ...(config.maxLifetime !== undefined && { max_lifetime: config.maxLifetime }),

    transform: {
      undefined: null,
      date: true,
    },

    debug: config.debug === true,
    onnotice: process.env.NODE_ENV === 'development' ? console.log : undefined,
  };

  return finalConfig;
}

// Hyperdrive supports Drizzle through node-postgres; sockets stay request-scoped.
export function createDatabase(config: DBConfig) {
  const options = createDatabaseConfig(config);
  const clients = new Set<Client>();
  class RequestClient extends Client {
    constructor(options?: ClientConfig) {
      super(options);
      clients.add(this);
      this.once('end', () => clients.delete(this));
      this.on('error', () => console.error('Database connection failed'));
    }
  }
  const pool = new Pool({
    Client: RequestClient,
    connectionString: config.connectionString,
    max: options.max,
    connectionTimeoutMillis: options.connect_timeout * 1000,
    idleTimeoutMillis: options.idle_timeout * 1000,
    maxLifetimeSeconds: options.max_lifetime,
    ...(config.queryTimeout !== undefined ? { query_timeout: config.queryTimeout * 1000 } : {}),
    application_name: options.application_name,
    ...('connection' in options ? { statement_timeout: options.connection.statement_timeout } : {}),
    ssl: config.hyperdrive ? false : options.ssl === 'require' ? true : options.ssl,
  });
  pool.on('error', () => console.error('Database connection failed'));
  let closing: Promise<void> | undefined;
  return Object.assign(drizzle(pool, { schema }), {
    $close(timeoutSeconds: number): Promise<void> {
      if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
        throw new Error('Database close timeout must be a positive number');
      }
      if (!closing) {
        let timer: ReturnType<typeof setTimeout>;
        const deadline = new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            // Includes connecting sockets; leases remain owned by Drizzle.
            for (const client of clients) {
              client.connection.stream.destroy(new Error('Database cleanup deadline reached'));
            }
            reject(new Error('Database cleanup exceeded its deadline'));
          }, timeoutSeconds * 1000);
        });
        const disconnected = Promise.all([...clients].map(client =>
          new Promise<void>(resolve => client.once('end', resolve))));
        const drained = Promise.all([pool.end(), disconnected]).then(() => {});
        closing = Promise.race([drained, deadline]).finally(() => clearTimeout(timer));
      }
      return closing;
    },
  });
}

export function previewConfig(config: DBConfig) {
  const finalConfig = createDatabaseConfig(config);
  const platform = detectPlatform();
  const database = detectDatabase(config.connectionString);

  return {
    platform,
    database,
    config: finalConfig,
    summary: {
      isServerless: ['vercel', 'netlify', 'lambda'].includes(platform),
      requiresSSL: finalConfig.ssl !== false,
      connectionPooling: finalConfig.max > 1,
      preparedStatements: finalConfig.prepare,
    }
  };
}
