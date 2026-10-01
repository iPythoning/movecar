import 'server-only'

import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'

export type MovecarTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

export function withMovecarUserLock<T>(
  userId: string,
  operation: (tx: MovecarTransaction) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`movecar-user:${userId}`}, 0))`
    )
    return operation(tx)
  })
}
