import type { AccountMediaKind } from '@/app/lib/accountMediaTypes'

export const ACCOUNT_MEDIA_DRAG_MIME = 'application/x-seedance-account-media'

export type AccountMediaDragPayload = {
  id: string
  kind: AccountMediaKind
  name: string
}

export function setAccountMediaDragData(dataTransfer: DataTransfer, payload: AccountMediaDragPayload) {
  dataTransfer.setData(ACCOUNT_MEDIA_DRAG_MIME, JSON.stringify(payload))
  dataTransfer.setData('text/plain', payload.id)
  dataTransfer.effectAllowed = 'copyMove'
}

export function parseAccountMediaDragData(dataTransfer: DataTransfer): AccountMediaDragPayload | null {
  const raw = dataTransfer.getData(ACCOUNT_MEDIA_DRAG_MIME)
  if (!raw) return null
  try {
    const o = JSON.parse(raw) as Partial<AccountMediaDragPayload>
    if (!o.id || !o.kind || !o.name) return null
    if (o.kind !== 'image' && o.kind !== 'video' && o.kind !== 'audio') return null
    return { id: o.id, kind: o.kind, name: o.name }
  } catch {
    return null
  }
}

export function accountMediaDragActive(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(ACCOUNT_MEDIA_DRAG_MIME)
}
