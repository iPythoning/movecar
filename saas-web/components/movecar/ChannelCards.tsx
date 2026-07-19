'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  addPushTokenAction,
  deletePushTokenAction,
  initTelegramBindingAction,
  sendTestPushAction,
  togglePushTokenAction,
  type MovecarPushToken,
} from '@/actions/movecar/push-tokens'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import type { PushChannel } from '@/lib/movecar/validations'

interface Props {
  tokens: MovecarPushToken[]
}

export function ChannelCards({ tokens }: Props) {
  const t = useTranslations('Movecar.Notifications')
  const router = useRouter()
  const [pending, start] = useTransition()
  const [bark, setBark] = useState('')
  const [telegramBinding, setTelegramBinding] =
    useState<{ deepLink: string; expiresAt: number } | null>(null)

  const byChannel = (ch: PushChannel) => tokens.filter((t) => t.channel === ch)

  const onAddBark = () => {
    if (!bark.trim()) return
    start(async () => {
      const res = await addPushTokenAction({ channel: 'bark', tokenValue: bark.trim() })
      if (!res.success) { toast.error(res.error); return }
      setBark('')
      toast.success('bark added')
      router.refresh()
    })
  }

  const onDelete = (id: string) => {
    start(async () => {
      const res = await deletePushTokenAction(id)
      if (!res.success) { toast.error(res.error); return }
      router.refresh()
    })
  }

  const onToggle = (id: string) => {
    start(async () => {
      const res = await togglePushTokenAction(id)
      if (!res.success) { toast.error(res.error); return }
      router.refresh()
    })
  }

  const onTest = (id: string) => {
    start(async () => {
      const res = await sendTestPushAction(id)
      if (!res.success) { toast.error(res.error); return }
      toast.success('test sent')
    })
  }

  const onInitTelegram = () => {
    start(async () => {
      const res = await initTelegramBindingAction()
      if (!res.success) { toast.error(res.error); return }
      if (res.data) {
        setTelegramBinding({
          deepLink: res.data.deepLink,
          expiresAt: Date.now() + res.data.expiresInSeconds * 1000,
        })
      }
    })
  }

  const onBindFcm = () => {
    start(async () => {
      const config = {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
        vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      }

      if (Object.values(config).some((value) => !value)) {
        toast.error(t('Channels.fcm.notConfigured'))
        return
      }
      if (!window.isSecureContext || !('Notification' in window) || !('serviceWorker' in navigator)) {
        toast.error(t('Channels.fcm.unsupported'))
        return
      }

      try {
        const [{ getApps, initializeApp }, { getMessaging, getToken }] = await Promise.all([
          import('firebase/app'),
          import('firebase/messaging'),
        ])
        const app = getApps().find((item) => item.name === 'movecar-fcm')
          ?? initializeApp(config, 'movecar-fcm')
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') {
          toast.error(t('Channels.fcm.permissionDenied'))
          return
        }
        const serviceWorkerRegistration = await navigator.serviceWorker.register(
          '/firebase-messaging-sw.js'
        )
        const token = await getToken(getMessaging(app), {
          vapidKey: config.vapidKey,
          serviceWorkerRegistration,
        })
        if (!token) {
          toast.error(t('Channels.fcm.failed'))
          return
        }
        const res = await addPushTokenAction({ channel: 'fcm', tokenValue: token })
        if (!res.success) {
          toast.error(res.error)
          return
        }
        toast.success(t('Channels.fcm.bound'))
        router.refresh()
      } catch (error) {
        console.error('[movecar] FCM binding failed:', error)
        toast.error(t('Channels.fcm.failed'))
      }
    })
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <ChannelCard
        title={t('Channels.bark.name')}
        description={t('Channels.bark.description')}
      >
        <div className="space-y-2">
          <Input
            placeholder="https://api.day.app/XXXXXXXX"
            value={bark}
            onChange={(e) => setBark(e.target.value)}
          />
          <Button size="sm" onClick={onAddBark} disabled={pending}>
            <Plus className="h-4 w-4 mr-1" />
            {t('addToken')}
          </Button>
        </div>
        <TokenList
          tokens={byChannel('bark')}
          onDelete={onDelete}
          onToggle={onToggle}
          onTest={onTest}
          pending={pending}
          labelTest={t('test')}
          labelDelete={t('delete')}
        />
      </ChannelCard>

      <ChannelCard
        title={t('Channels.telegram.name')}
        description={t('Channels.telegram.description')}
      >
        <Button size="sm" onClick={onInitTelegram} disabled={pending}>
          {t('Channels.telegram.bind')}
        </Button>
        {telegramBinding && (
          <div className="mt-3 p-3 bg-muted rounded-md">
            <a
              href={telegramBinding.deepLink}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline text-sm break-all"
            >
              {telegramBinding.deepLink}
            </a>
            <div className="text-xs text-muted-foreground mt-1">
              {t('Channels.telegram.expiresIn', {
                minutes: Math.max(0, Math.round((telegramBinding.expiresAt - Date.now()) / 60000)),
              })}
            </div>
          </div>
        )}
        <TokenList
          tokens={byChannel('telegram')}
          onDelete={onDelete}
          onToggle={onToggle}
          onTest={onTest}
          pending={pending}
          labelTest={t('test')}
          labelDelete={t('delete')}
        />
      </ChannelCard>

      <ChannelCard
        title={t('Channels.fcm.name')}
        description={t('Channels.fcm.description')}
      >
        <Button size="sm" onClick={onBindFcm} disabled={pending}>
          {t('Channels.fcm.bind')}
        </Button>
        <TokenList
          tokens={byChannel('fcm')}
          onDelete={onDelete}
          onToggle={onToggle}
          onTest={onTest}
          pending={pending}
          labelTest={t('test')}
          labelDelete={t('delete')}
        />
      </ChannelCard>

      <ChannelCard
        title={t('Channels.email.name')}
        description={t('Channels.email.description')}
      >
        <div className="text-sm text-muted-foreground">
          Uses your account email automatically. No binding needed.
        </div>
      </ChannelCard>
    </div>
  )
}

function ChannelCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}

function TokenList({
  tokens,
  onDelete,
  onToggle,
  onTest,
  pending,
  labelTest,
  labelDelete,
}: {
  tokens: MovecarPushToken[]
  onDelete: (id: string) => void
  onToggle: (id: string) => void
  onTest: (id: string) => void
  pending: boolean
  labelTest: string
  labelDelete: string
}) {
  if (tokens.length === 0) return null
  return (
    <ul className="space-y-2 pt-2">
      {tokens.map((t) => (
        <li
          key={t.id}
          className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
        >
          <div className="flex-1 min-w-0">
            <div className="truncate font-mono text-xs">{t.tokenValue}</div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Switch
              checked={t.isEnabled}
              onCheckedChange={() => onToggle(t.id)}
              disabled={pending}
            />
            <Button size="sm" variant="ghost" onClick={() => onTest(t.id)} disabled={pending}>
              {labelTest}
            </Button>
            <Button size="icon" variant="ghost" onClick={() => onDelete(t.id)} disabled={pending}>
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">{labelDelete}</span>
            </Button>
          </div>
        </li>
      ))}
    </ul>
  )
}
