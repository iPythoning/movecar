import { formatDistanceToNowStrict } from 'date-fns'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getSession } from '@/lib/auth/server'
import { db } from '@/lib/db'
import { movecarNotifications, movecarTags } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'

export default async function HistoryPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  const t = await getTranslations('Movecar.History')

  const rows = await db
    .select({
      id: movecarNotifications.id,
      tagId: movecarNotifications.tagId,
      tagPlate: movecarTags.plateNumber,
      tagShortCode: movecarTags.shortCode,
      message: movecarNotifications.message,
      status: movecarNotifications.status,
      channelsSent: movecarNotifications.channelsSent,
      createdAt: movecarNotifications.createdAt,
    })
    .from(movecarNotifications)
    .innerJoin(movecarTags, eq(movecarTags.id, movecarNotifications.tagId))
    .where(eq(movecarTags.userId, session.user.id))
    .orderBy(desc(movecarNotifications.createdAt))
    .limit(100)

  return (
    <div className="p-6 md:p-8 space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
      </header>

      {rows.length === 0 ? (
        <div className="border rounded-lg p-10 text-center text-muted-foreground">
          {t('empty')}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Table.time')}</TableHead>
                <TableHead>{t('Table.tag')}</TableHead>
                <TableHead>{t('Table.message')}</TableHead>
                <TableHead>{t('Table.status')}</TableHead>
                <TableHead>{t('Table.channels')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const channels = Array.isArray(r.channelsSent)
                  ? (r.channelsSent as string[])
                  : []
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNowStrict(new Date(r.createdAt), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.tagPlate || r.tagShortCode}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {r.message || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="text-xs">
                      {channels.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex gap-1 flex-wrap">
                          {channels.map((c) => (
                            <Badge key={c} variant="outline">
                              {c}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    pending: 'outline',
    sent: 'default',
    delivered: 'default',
    replied: 'default',
    failed: 'destructive',
  }
  return <Badge variant={map[status] ?? 'outline'}>{status}</Badge>
}
