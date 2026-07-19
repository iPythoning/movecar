import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { TagsTable } from '@/components/movecar/TagsTable'
import { Button } from '@/components/ui/button'
import { Link as I18nLink } from '@/i18n/routing'
import { getSession } from '@/lib/auth/server'
import { db } from '@/lib/db'
import { movecarTags } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'

export default async function TagsListPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')

  const t = await getTranslations('Movecar.Tags')
  const rows = await db
    .select()
    .from(movecarTags)
    .where(eq(movecarTags.userId, session.user.id))
    .orderBy(desc(movecarTags.createdAt))
    .limit(100)

  return (
    <div className="p-6 md:p-8 space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
        </div>
        <Button asChild>
          <I18nLink href="/dashboard/movecar/tags/new">{t('new')}</I18nLink>
        </Button>
      </header>

      {rows.length === 0 ? (
        <div className="border rounded-lg p-10 text-center text-muted-foreground">
          {t('empty')}
        </div>
      ) : (
        <TagsTable rows={rows} />
      )}
    </div>
  )
}
