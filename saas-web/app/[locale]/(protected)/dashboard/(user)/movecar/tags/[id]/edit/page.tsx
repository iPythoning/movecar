import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { TagForm } from '@/components/movecar/TagForm'
import { getSession } from '@/lib/auth/server'
import { db } from '@/lib/db'
import { movecarTags } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

export default async function EditTagPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()
  if (!session?.user) redirect('/login')

  const { id } = await params
  const [tag] = await db
    .select()
    .from(movecarTags)
    .where(and(eq(movecarTags.id, id), eq(movecarTags.userId, session.user.id)))
    .limit(1)
  if (!tag) notFound()

  const t = await getTranslations('Movecar.Tags')
  return (
    <div className="p-6 md:p-8 space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold">{t('Actions.edit')}</h1>
      </header>
      <TagForm initial={tag} />
    </div>
  )
}
