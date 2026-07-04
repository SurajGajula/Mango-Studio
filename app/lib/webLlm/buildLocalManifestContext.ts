import { audioMarksAbsoluteTimelinePositions } from '@/app/lib/audioMarkTimeline'

export type LocalChatManifest = {
  images?: Array<{
    id: string
    name?: string
    startTime?: number
    endTime?: number
    row?: number
    animation?: string
    transition?: string
    zoomIntensity?: number
    animationDuration?: number
    transitionDuration?: number
    muted?: boolean
    opacity?: number
  }>
  videos?: Array<{
    id: string
    title?: string
    timestamp?: number
    duration?: number
    muted?: boolean
    opacity?: number
    row?: number
    playbackSpeed?: number
    animation?: string
    transition?: string
    zoomIntensity?: number
    animationDuration?: number
    transitionDuration?: number
  }>
  texts?: Array<{
    id: string
    content?: string
    startTime?: number
    endTime?: number
  }>
  audios?: Array<{
    id: string
    name?: string
    startTime?: number
    endTime?: number
    originalDuration?: number
    trimStart?: number
    trimEnd?: number
    volume?: number
    marks?: Array<number | { t: number; id?: string }>
  }>
  effects?: Array<{
    id: string
    name?: string
    startTime?: number
    endTime?: number
  }>
}

export function buildLocalManifestContext(manifest: LocalChatManifest): string {
  const lines: string[] = ['Current timeline contents:']
  lines.push('Item numbers (#N) are per section below, not shared across images, videos, texts, audios, or effects.')

  if (manifest.images?.length) {
    const sorted = [...manifest.images].sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))
    lines.push(`Images (${sorted.length}):`)
    sorted.forEach((img, i) => {
      const extras = [
        img.zoomIntensity !== undefined ? `zoomIntensity=${img.zoomIntensity}` : '',
        img.animationDuration !== undefined ? `animationDuration=${img.animationDuration}s` : '',
        img.transitionDuration !== undefined ? `transitionDuration=${img.transitionDuration}s` : '',
      ]
        .filter(Boolean)
        .join(' ')
      lines.push(
        `  - #${i + 1} id="${img.id}" name="${img.name ?? ''}" startTime=${img.startTime ?? 0}s endTime=${img.endTime ?? 0}s row=${img.row ?? 0} animation=${img.animation ?? 'none'} transition=${img.transition ?? 'none'}${extras ? ` ${extras}` : ''}`
      )
    })
  }

  if (manifest.videos?.length) {
    const sorted = [...manifest.videos].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
    lines.push(`Videos (${sorted.length}):`)
    sorted.forEach((vid, i) => {
      const extras = [
        vid.zoomIntensity !== undefined ? `zoomIntensity=${vid.zoomIntensity}` : '',
        vid.animationDuration !== undefined ? `animationDuration=${vid.animationDuration}s` : '',
        vid.transitionDuration !== undefined ? `transitionDuration=${vid.transitionDuration}s` : '',
      ]
        .filter(Boolean)
        .join(' ')
      lines.push(
        `  - #${i + 1} id="${vid.id}" title="${vid.title ?? ''}" timestamp=${vid.timestamp ?? 0}s duration=${vid.duration ?? 0}s muted=${vid.muted ?? false} row=${vid.row ?? 0} animation=${vid.animation ?? 'none'} transition=${vid.transition ?? 'none'}${extras ? ` ${extras}` : ''}`
      )
    })
  }

  if (manifest.texts?.length) {
    const sorted = [...manifest.texts].sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))
    lines.push(`Texts (${sorted.length}):`)
    sorted.forEach((txt, i) => {
      lines.push(
        `  - #${i + 1} id="${txt.id}" content="${txt.content ?? ''}" startTime=${txt.startTime ?? 0}s endTime=${txt.endTime ?? 0}s`
      )
    })
  }

  if (manifest.audios?.length) {
    const sorted = [...manifest.audios].sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))
    lines.push(`Audios (${sorted.length}):`)
    sorted.forEach((aud, i) => {
      const origDur = aud.originalDuration ?? aud.endTime ?? 0
      const ts = aud.trimStart ?? 0
      const te = aud.trimEnd ?? 0
      const sourceTimes = (aud.marks ?? []).map((m) => (typeof m === 'number' ? m : m.t))
      const markStr = sourceTimes.length ? sourceTimes.map((t) => `${t.toFixed(3)}s`).join(', ') : 'none'
      const timelineSplits = audioMarksAbsoluteTimelinePositions(
        aud.startTime ?? 0,
        ts,
        te,
        origDur,
        sourceTimes
      )
      const timelineSplitStr = timelineSplits.length
        ? timelineSplits.map((t) => `${t.toFixed(3)}s`).join(', ')
        : 'none'
      lines.push(
        `  - #${i + 1} id="${aud.id}" name="${aud.name ?? ''}" activeStartTime=${aud.startTime ?? 0}s originalDuration=${origDur}s trimStart=${ts}s trimEnd=${te}s marksSourceFileSeconds=[${markStr}] splitAtMarksTimelineSeconds=[${timelineSplitStr}]`
      )
    })
  }

  if (manifest.effects?.length) {
    const sorted = [...manifest.effects].sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))
    lines.push(`Effects (${sorted.length}):`)
    sorted.forEach((effect, i) => {
      lines.push(
        `  - #${i + 1} id="${effect.id}" type="${effect.name ?? 'unknown'}" startTime=${effect.startTime ?? 0}s endTime=${effect.endTime ?? 0}s`
      )
    })
  }

  if (lines.length === 2) {
    lines.push('  (empty — no items yet)')
  }

  return lines.join('\n')
}

export function collectLocalManifestIds(manifest: LocalChatManifest): Set<string> {
  const ids = new Set<string>()
  for (const item of manifest.images ?? []) ids.add(item.id)
  for (const item of manifest.videos ?? []) ids.add(item.id)
  for (const item of manifest.texts ?? []) ids.add(item.id)
  for (const item of manifest.audios ?? []) ids.add(item.id)
  for (const item of manifest.effects ?? []) ids.add(item.id)
  return ids
}
