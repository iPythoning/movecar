import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Link as I18nLink } from '@/i18n/routing'
import { getSession } from '@/lib/auth/server'
import { db } from '@/lib/db'
import { movecarNotifications, movecarPushTokens, movecarTags } from '@/lib/db/schema'
import { resolveMovecarPlan } from '@/lib/movecar/plan'
import { and, eq, gt, sql } from 'drizzle-orm'

export default async function MovecarOverviewPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  const userId = session.user.id
  const t = await getTranslations('Movecar.Overview')

  const plan = await resolveMovecarPlan(userId)
  const startOfMonth = new Date()
  startOfMonth.setUTCDate(1)
  startOfMonth.setUTCHours(0, 0, 0, 0)

  const [tagsCount, notifMonth, enabledChannels] = await Promise.all([
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(movecarTags)
      .where(eq(movecarTags.userId, userId))
      .then((r) => r[0]?.c ?? 0),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(movecarNotifications)
      .innerJoin(movecarTags, eq(movecarTags.id, movecarNotifications.tagId))
      .where(
        and(eq(movecarTags.userId, userId), gt(movecarNotifications.createdAt, startOfMonth))
      )
      .then((r) => r[0]?.c ?? 0),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(movecarPushTokens)
      .where(
        and(eq(movecarPushTokens.userId, userId), eq(movecarPushTokens.isEnabled, true))
      )
      .then((r) => r[0]?.c ?? 0),
  ])

  const tagsDisplay =
    plan.maxTags === -1 ? `${tagsCount} / ∞` : `${tagsCount} / ${plan.maxTags}`
  const notifDisplay =
    plan.maxNotificationsPerMonth === -1
      ? `${notifMonth} / ∞`
      : `${notifMonth} / ${plan.maxNotificationsPerMonth}`

  return (
    <div className="p-6 md:p-8 space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard title={t('Cards.plan')} value={plan.plan.toUpperCase()} />
        <SummaryCard title={t('Cards.tagsUsed')} value={tagsDisplay} />
        <SummaryCard title={t('Cards.notificationsMonth')} value={notifDisplay} />
        <SummaryCard title={t('Cards.channels')} value={String(enabledChannels)} />
      </div>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <I18nLink href="/dashboard/movecar/tags/new">{t('Cta.createTag')}</I18nLink>
        </Button>
        <Button asChild variant="outline">
          <I18nLink href="/dashboard/movecar/notifications">{t('Cta.addChannel')}</I18nLink>
        </Button>
        {plan.plan === 'free' && (
          <Button asChild variant="secondary">
            <I18nLink href="/pricing">{t('Cta.upgrade')}</I18nLink>
          </Button>
        )}
      </div>
    </div>
  )
}

function SummaryCard({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent />
    </Card>
  )
}
