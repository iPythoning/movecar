'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { createTagAction, updateTagAction, type MovecarTag } from '@/actions/movecar/tags'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TEMPLATE_IDS, type TemplateId } from '@/lib/movecar/validations'

interface Props {
  initial?: MovecarTag
}

export function TagForm({ initial }: Props) {
  const t = useTranslations('Movecar.Tags.Form')
  const router = useRouter()
  const [pending, start] = useTransition()

  const [plateNumber, setPlateNumber] = useState(initial?.plateNumber ?? '')
  const [vehicleModel, setVehicleModel] = useState(initial?.vehicleModel ?? '')
  const [templateId, setTemplateId] = useState<TemplateId>(
    (initial?.templateId as TemplateId) ?? 'classic'
  )
  const initialSettings = (initial?.settings ?? {}) as { delaySeconds?: number }
  const [delaySeconds, setDelaySeconds] = useState(
    String(initialSettings.delaySeconds ?? 30)
  )

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    start(async () => {
      const payload = {
        plateNumber: plateNumber.trim() || undefined,
        vehicleModel: vehicleModel.trim() || undefined,
        templateId,
        settings: { delaySeconds: Number(delaySeconds) || 30 },
      }
      const res = initial
        ? await updateTagAction(initial.id, payload)
        : await createTagAction(payload)
      if (!res.success) { toast.error(res.error); return }
      toast.success('saved')
      router.push('/dashboard/movecar/tags')
      router.refresh()
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 max-w-md">
      <div className="space-y-2">
        <Label htmlFor="plate">{t('plateNumber')}</Label>
        <Input
          id="plate"
          value={plateNumber}
          onChange={(e) => setPlateNumber(e.target.value)}
          placeholder={t('plateNumberPlaceholder')}
          maxLength={20}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="model">{t('vehicleModel')}</Label>
        <Input
          id="model"
          value={vehicleModel}
          onChange={(e) => setVehicleModel(e.target.value)}
          placeholder={t('vehicleModelPlaceholder')}
          maxLength={100}
        />
      </div>

      <div className="space-y-2">
        <Label>{t('template')}</Label>
        <Select value={templateId} onValueChange={(v) => setTemplateId(v as TemplateId)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TEMPLATE_IDS.map((id) => (
              <SelectItem key={id} value={id}>
                {id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="delay">{t('delaySeconds')}</Label>
        <Input
          id="delay"
          type="number"
          min={0}
          max={300}
          value={delaySeconds}
          onChange={(e) => setDelaySeconds(e.target.value)}
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {t('save')}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => router.back()}
        >
          {t('cancel')}
        </Button>
      </div>
    </form>
  )
}
