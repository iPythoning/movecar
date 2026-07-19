'use client'

import { formatDistanceToNowStrict } from 'date-fns'
import {
  MoreVertical,
  Printer,
  QrCode as QrIcon,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  deleteTagAction,
  toggleTagActiveAction,
  type MovecarTag,
} from '@/actions/movecar/tags'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface Props {
  rows: MovecarTag[]
}

export function TagsTable({ rows }: Props) {
  const t = useTranslations('Movecar.Tags')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [qrTag, setQrTag] = useState<MovecarTag | null>(null)

  const onToggle = (id: string) => {
    startTransition(async () => {
      const res = await toggleTagActiveAction(id)
      if (!res.success) { toast.error(res.error); return }
      router.refresh()
    })
  }

  const onDelete = (id: string) => {
    if (!confirm(t('Form.deleteConfirm'))) return
    startTransition(async () => {
      const res = await deleteTagAction(id)
      if (!res.success) { toast.error(res.error); return }
      toast.success('deleted')
      router.refresh()
    })
  }

  const onCopyLink = async (shortCode: string) => {
    const workerUrl =
      process.env.NEXT_PUBLIC_WORKER_URL ?? 'https://t.autoglobalai.com'
    const url = `${workerUrl.replace(/\/$/, '')}/t/${shortCode}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success('copied')
    } catch {
      toast.error('copy failed')
    }
  }

  return (
    <>
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Table.plateNumber')}</TableHead>
              <TableHead>{t('Table.shortCode')}</TableHead>
              <TableHead>{t('Table.status')}</TableHead>
              <TableHead>{t('Table.createdAt')}</TableHead>
              <TableHead className="w-24 text-right">{t('Table.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  {r.plateNumber || <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="font-mono text-sm">{r.shortCode}</TableCell>
                <TableCell>
                  {r.isActive ? (
                    <Badge variant="default">{t('Table.active')}</Badge>
                  ) : (
                    <Badge variant="secondary">{t('Table.disabled')}</Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDistanceToNowStrict(new Date(r.createdAt), { addSuffix: true })}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" disabled={pending}>
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setQrTag(r)}>
                        <QrIcon className="h-4 w-4 mr-2" />
                        QR
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => router.push(`/dashboard/movecar/tags/${r.id}/edit`)}
                      >
                        {t('Actions.edit')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onCopyLink(r.shortCode)}>
                        {t('Actions.copyLink')}
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <a href={`/api/tags/${r.id}/pdf`} target="_blank" rel="noreferrer">
                          <Printer className="h-4 w-4 mr-2" />
                          {t('Actions.downloadPdf')}
                        </a>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onToggle(r.id)}>
                        {t('Actions.toggle')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => onDelete(r.id)}
                      >
                        {t('Actions.delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!qrTag} onOpenChange={(o) => !o && setQrTag(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>QR</DialogTitle>
            <DialogDescription>
              {qrTag?.plateNumber || qrTag?.shortCode}
            </DialogDescription>
          </DialogHeader>
          {qrTag && <QrPreview tagId={qrTag.id} shortCode={qrTag.shortCode} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

function QrPreview({ tagId, shortCode }: { tagId: string; shortCode: string }) {
  const workerUrl =
    process.env.NEXT_PUBLIC_WORKER_URL ?? 'https://t.autoglobalai.com'
  const qrSrc = `${workerUrl.replace(/\/$/, '')}/api/qr/${shortCode}?size=512&ec=Q`
  const scanUrl = `${workerUrl.replace(/\/$/, '')}/t/${shortCode}`
  return (
    <div className="space-y-3">
      <div className="bg-white p-4 rounded-lg flex justify-center">
        {/* SVG from the edge, auto-scaled */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrSrc} alt="QR" className="w-64 h-64" />
      </div>
      <div className="text-xs text-muted-foreground break-all font-mono">{scanUrl}</div>
      <div className="flex gap-2">
        <Button variant="outline" asChild>
          <a href={qrSrc} target="_blank" rel="noreferrer" download={`movecar-${shortCode}.svg`}>
            Download SVG
          </a>
        </Button>
        <Button variant="outline" asChild>
          <a href={`/api/tags/${tagId}/pdf`} target="_blank" rel="noreferrer">
            <Printer className="h-4 w-4 mr-2" />
            Print / PDF
          </a>
        </Button>
      </div>
    </div>
  )
}
