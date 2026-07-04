import type { LocalChatManifest } from '@/app/lib/webLlm/buildLocalManifestContext'

export type LocalTimelineKind = 'image' | 'video' | 'text' | 'audio' | 'effect'

export type IndexedLocalManifest = {
  images: NonNullable<LocalChatManifest['images']>
  videos: NonNullable<LocalChatManifest['videos']>
  texts: NonNullable<LocalChatManifest['texts']>
  audios: NonNullable<LocalChatManifest['audios']>
  effects: NonNullable<LocalChatManifest['effects']>
  kindById: Map<string, LocalTimelineKind>
}

export function indexLocalManifest(manifest: LocalChatManifest): IndexedLocalManifest {
  const images = [...(manifest.images ?? [])].sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))
  const videos = [...(manifest.videos ?? [])].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
  const texts = [...(manifest.texts ?? [])].sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))
  const audios = [...(manifest.audios ?? [])].sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))
  const effects = [...(manifest.effects ?? [])].sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))

  const kindById = new Map<string, LocalTimelineKind>()
  for (const item of images) kindById.set(item.id, 'image')
  for (const item of videos) kindById.set(item.id, 'video')
  for (const item of texts) kindById.set(item.id, 'text')
  for (const item of audios) kindById.set(item.id, 'audio')
  for (const item of effects) kindById.set(item.id, 'effect')

  return { images, videos, texts, audios, effects, kindById }
}

export function idsForKind(index: IndexedLocalManifest, kind: LocalTimelineKind): string[] {
  if (kind === 'image') return index.images.map((item) => item.id)
  if (kind === 'video') return index.videos.map((item) => item.id)
  if (kind === 'text') return index.texts.map((item) => item.id)
  if (kind === 'audio') return index.audios.map((item) => item.id)
  return index.effects.map((item) => item.id)
}
