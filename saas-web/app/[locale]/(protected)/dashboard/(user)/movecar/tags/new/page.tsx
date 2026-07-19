import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { TagForm } from '@/components/movecar/TagForm'
import { getSession } from '@/lib/auth/server'

export default async function NewTagPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  const t = await getTranslations('Movecar.Tags')
  return (
    <div className="p-6 md:p-8 space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold">{t('new')}</h1>
      </header>
      <TagForm />
    </div>
  )
}
