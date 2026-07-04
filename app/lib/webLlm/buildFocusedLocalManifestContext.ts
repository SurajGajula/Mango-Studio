import {
  buildLocalManifestContext,
  type LocalChatManifest,
} from '@/app/lib/webLlm/buildLocalManifestContext'
import { indexLocalManifest } from '@/app/lib/webLlm/localManifestIndex'
import {
  parsePromptManifestFilter,
  promptNeedsAudioMarks,
  type LocalManifestSection,
  type SectionItemFilter,
} from '@/app/lib/webLlm/parsePromptManifestFilter'

function pickItems<T>(
  items: T[],
  filter: SectionItemFilter | undefined
): { picked: Array<{ number: number; item: T }>; total: number; shown: number[] | null } {
  const total = items.length
  if (!filter || filter === 'all') {
    return {
      picked: items.map((item, index) => ({ number: index + 1, item })),
      total,
      shown: null,
    }
  }
  const shown = [...new Set(filter)].filter((number) => number >= 1 && number <= total).sort((a, b) => a - b)
  const picked = shown
    .map((number) => ({ number, item: items[number - 1] }))
    .filter((entry): entry is { number: number; item: T } => entry.item !== undefined)
  return { picked, total, shown }
}

type NumberedManifest = {
  images?: Array<{ number: number; item: NonNullable<LocalChatManifest['images']>[number] }>
  videos?: Array<{ number: number; item: NonNullable<LocalChatManifest['videos']>[number] }>
  texts?: Array<{ number: number; item: NonNullable<LocalChatManifest['texts']>[number] }>
  audios?: Array<{ number: number; item: NonNullable<LocalChatManifest['audios']>[number] }>
  effects?: Array<{ number: number; item: NonNullable<LocalChatManifest['effects']>[number] }>
}

function buildCompactManifestContext(
  manifest: NumberedManifest,
  labels: {
    images?: string
    videos?: string
    texts?: string
    audios?: string
    effects?: string
  },
  includeAudioMarks: boolean
): string {
  const lines: string[] = ['Current timeline:']
  lines.push('Item #N is per section. Use exact id values from lines below.')

  if (manifest.images?.length) {
    lines.push(labels.images ?? `Images (${manifest.images.length}):`)
    for (const entry of manifest.images) {
      lines.push(
        `  #${entry.number} id="${entry.item.id}" s=${entry.item.startTime ?? 0} e=${entry.item.endTime ?? 0} row=${entry.item.row ?? 0} anim=${entry.item.animation ?? 'none'} trans=${entry.item.transition ?? 'none'}`
      )
    }
  }

  if (manifest.videos?.length) {
    lines.push(labels.videos ?? `Videos (${manifest.videos.length}):`)
    for (const entry of manifest.videos) {
      lines.push(
        `  #${entry.number} id="${entry.item.id}" t=${entry.item.timestamp ?? 0} d=${entry.item.duration ?? 0} muted=${entry.item.muted ?? false} row=${entry.item.row ?? 0} anim=${entry.item.animation ?? 'none'} trans=${entry.item.transition ?? 'none'}`
      )
    }
  }

  if (manifest.texts?.length) {
    lines.push(labels.texts ?? `Texts (${manifest.texts.length}):`)
    for (const entry of manifest.texts) {
      lines.push(
        `  #${entry.number} id="${entry.item.id}" s=${entry.item.startTime ?? 0} e=${entry.item.endTime ?? 0}`
      )
    }
  }

  if (manifest.audios?.length) {
    lines.push(labels.audios ?? `Audios (${manifest.audios.length}):`)
    for (const entry of manifest.audios) {
      const aud = entry.item
      if (includeAudioMarks) {
        lines.push(
          `  #${entry.number} id="${aud.id}" s=${aud.startTime ?? 0} od=${aud.originalDuration ?? aud.endTime ?? 0} trim=${aud.trimStart ?? 0}/${aud.trimEnd ?? 0}`
        )
      } else {
        lines.push(
          `  #${entry.number} id="${aud.id}" s=${aud.startTime ?? 0} e=${aud.endTime ?? 0}`
        )
      }
    }
  }

  if (manifest.effects?.length) {
    lines.push(labels.effects ?? `Effects (${manifest.effects.length}):`)
    for (const entry of manifest.effects) {
      lines.push(
        `  #${entry.number} id="${entry.item.id}" s=${entry.item.startTime ?? 0} e=${entry.item.endTime ?? 0}`
      )
    }
  }

  if (lines.length === 2) {
    lines.push('  (empty)')
  }

  return lines.join('\n')
}

function sectionLabel(
  name: string,
  total: number,
  shown: number[] | null
): string {
  if (!shown || shown.length === total) {
    return `${name} (${total}):`
  }
  return `${name} (${total} total, showing #${shown.join(', #')}):`
}

function sliceSection(
  index: ReturnType<typeof indexLocalManifest>,
  section: LocalManifestSection,
  filter: SectionItemFilter | undefined
): { manifest: NumberedManifest; label?: string } {
  if (section === 'image') {
    const { picked, total, shown } = pickItems(index.images, filter)
    return {
      manifest: { images: picked },
      label: picked.length > 0 ? sectionLabel('Images', total, shown) : undefined,
    }
  }
  if (section === 'video') {
    const { picked, total, shown } = pickItems(index.videos, filter)
    return {
      manifest: { videos: picked },
      label: picked.length > 0 ? sectionLabel('Videos', total, shown) : undefined,
    }
  }
  if (section === 'text') {
    const { picked, total, shown } = pickItems(index.texts, filter)
    return {
      manifest: { texts: picked },
      label: picked.length > 0 ? sectionLabel('Texts', total, shown) : undefined,
    }
  }
  if (section === 'audio') {
    const { picked, total, shown } = pickItems(index.audios, filter)
    return {
      manifest: { audios: picked },
      label: picked.length > 0 ? sectionLabel('Audios', total, shown) : undefined,
    }
  }
  const { picked, total, shown } = pickItems(index.effects, filter)
  return {
    manifest: { effects: picked },
    label: picked.length > 0 ? sectionLabel('Effects', total, shown) : undefined,
  }
}

function mergeNumberedManifest(target: NumberedManifest, sectionManifest: NumberedManifest): void {
  if (sectionManifest.images?.length) {
    target.images = sectionManifest.images
  }
  if (sectionManifest.videos?.length) {
    target.videos = sectionManifest.videos
  }
  if (sectionManifest.texts?.length) {
    target.texts = sectionManifest.texts
  }
  if (sectionManifest.audios?.length) {
    target.audios = sectionManifest.audios
  }
  if (sectionManifest.effects?.length) {
    target.effects = sectionManifest.effects
  }
}

function numberedManifestForFullFormat(manifest: NumberedManifest): LocalChatManifest {
  return {
    images: manifest.images?.map((entry) => entry.item),
    videos: manifest.videos?.map((entry) => entry.item),
    texts: manifest.texts?.map((entry) => entry.item),
    audios: manifest.audios?.map((entry) => entry.item),
    effects: manifest.effects?.map((entry) => entry.item),
  }
}

export function buildFocusedLocalManifestContext(
  prompt: string,
  manifest: LocalChatManifest,
  options?: { compact?: boolean }
): string {
  const compact = options?.compact !== false
  const filter = parsePromptManifestFilter(prompt)
  const index = indexLocalManifest(manifest)
  const focused: NumberedManifest = {}
  const labels: {
    images?: string
    videos?: string
    texts?: string
    audios?: string
    effects?: string
  } = {}

  for (const section of filter.sections) {
    const { manifest: sectionManifest, label } = sliceSection(
      index,
      section,
      filter.itemNumbers[section]
    )
    mergeNumberedManifest(focused, sectionManifest)
    if (label) {
      if (section === 'image') labels.images = label
      if (section === 'video') labels.videos = label
      if (section === 'text') labels.texts = label
      if (section === 'audio') labels.audios = label
      if (section === 'effect') labels.effects = label
    }
  }

  if (compact) {
    return buildCompactManifestContext(focused, labels, promptNeedsAudioMarks(prompt))
  }

  return buildLocalManifestContext(numberedManifestForFullFormat(focused))
}
