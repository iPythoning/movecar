import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { ChannelCards } from '@/components/movecar/ChannelCards'
import { getSession } from '@/lib/auth/server'
import { db } from '@/lib/db'
import { movecarPushTokens } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export default async function NotificationsPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  const t = await getTranslations('Movecar.Notifications')
  const tokens = await db
    .select()
    .from(movecarPushTokens)
    .where(eq(movecarPushTokens.userId, session.user.id))

  return (
    <div className="p-6 md:p-8 space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
      </header>
      <ChannelCards tokens={tokens} />
    </div>
  )
}
