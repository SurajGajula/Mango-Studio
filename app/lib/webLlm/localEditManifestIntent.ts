import type { ManifestMutation } from '@/app/lib/chatRouteTypes'
import type { LocalChatManifest } from '@/app/lib/webLlm/buildLocalManifestContext'
import type { LocalRoutePromptResponse } from '@/app/lib/webLlm/localChatTypes'
import { idsForKind, indexLocalManifest } from '@/app/lib/webLlm/localManifestIndex'

function normalizePrompt(prompt: string): string {
  return prompt.toLowerCase().replace(/#/g, ' ').trim()
}

function mutationTypeForKind(kind: 'image' | 'video'): ManifestMutation['type'] {
  return kind === 'image' ? 'updateImage' : 'updateVideo'
}

export function resolveLocalEditManifestIntent(
  prompt: string,
  manifest: LocalChatManifest
): LocalRoutePromptResponse | null {
  const normalized = normalizePrompt(prompt)
  const index = indexLocalManifest(manifest)

  if (/\bmute\s+(?:all\s+)?(?:the\s+)?videos?\b/.test(normalized)) {
    const numberedOnly = normalized.match(/\bmute\s+video\s+(\d+)\s+only\b/)
    if (numberedOnly) {
      const itemNumber = Number.parseInt(numberedOnly[1], 10)
      const id = idsForKind(index, 'video')[itemNumber - 1]
      if (!id) {
        return { action: 'no_op', message: `Could not find video #${itemNumber}.` }
      }
      return {
        action: 'edit_manifest',
        mutations: [{ type: 'updateVideo', id, muted: true }],
        message: `Muted video #${itemNumber}.`,
      }
    }

    const singleMatch = normalized.match(/\bmute\s+video\s+(\d+)\b/)
    if (singleMatch && !/\bmute\s+all\b/.test(normalized)) {
      const itemNumber = Number.parseInt(singleMatch[1], 10)
      const id = idsForKind(index, 'video')[itemNumber - 1]
      if (!id) {
        return { action: 'no_op', message: `Could not find video #${itemNumber}.` }
      }
      return {
        action: 'edit_manifest',
        mutations: [{ type: 'updateVideo', id, muted: true }],
        message: `Muted video #${itemNumber}.`,
      }
    }

    const videoIds = idsForKind(index, 'video')
    if (videoIds.length === 0) {
      return { action: 'no_op', message: 'There are no videos on the timeline to mute.' }
    }
    return {
      action: 'edit_manifest',
      mutations: videoIds.map((id) => ({ type: 'updateVideo', id, muted: true })),
      message: `Muted ${videoIds.length} video(s).`,
    }
  }

  if (/\bunmute\s+(?:all\s+)?(?:the\s+)?videos?\b/.test(normalized)) {
    const videoIds = idsForKind(index, 'video')
    if (videoIds.length === 0) {
      return { action: 'no_op', message: 'There are no videos on the timeline to unmute.' }
    }
    return {
      action: 'edit_manifest',
      mutations: videoIds.map((id) => ({ type: 'updateVideo', id, muted: false })),
      message: `Unmuted ${videoIds.length} video(s).`,
    }
  }

  const opacityMatch = normalized.match(
    /\b(?:set\s+)?(image|video)\s+(\d+)\s+opacity\s+to\s+(\d+(?:\.\d+)?)\s*%?\b/
  )
  if (opacityMatch) {
    const kind = opacityMatch[1] === 'image' ? 'image' : 'video'
    const itemNumber = Number.parseInt(opacityMatch[2], 10)
    const percent = Number.parseFloat(opacityMatch[3])
    const id = idsForKind(index, kind)[itemNumber - 1]
    if (!id) {
      return { action: 'no_op', message: `Could not find ${kind} #${itemNumber}.` }
    }
    return {
      action: 'edit_manifest',
      mutations: [{ type: mutationTypeForKind(kind), id, opacity: percent / 100 }],
      message: `Set ${kind} #${itemNumber} opacity to ${percent}%.`,
    }
  }

  const rowMatch = normalized.match(/\bmove\s+(image|video)\s+(\d+)\s+to\s+row\s+(\d+)\b/)
  if (rowMatch) {
    const kind = rowMatch[1] === 'image' ? 'image' : 'video'
    const itemNumber = Number.parseInt(rowMatch[2], 10)
    const row = Number.parseInt(rowMatch[3], 10)
    const id = idsForKind(index, kind)[itemNumber - 1]
    if (!id) {
      return { action: 'no_op', message: `Could not find ${kind} #${itemNumber}.` }
    }
    return {
      action: 'edit_manifest',
      mutations: [{ type: mutationTypeForKind(kind), id, row }],
      message: `Moved ${kind} #${itemNumber} to row ${row}.`,
    }
  }

  const durationMatch = normalized.match(
    /\b(?:set|make)\s+(image|video)\s+(\d+)\s+(?:(?:duration|length)\s+to|(?:to\s+)?)\s*(\d+(?:\.\d+)?)\s*(?:seconds?|s)\s*(?:long)?\b/
  )
  if (durationMatch) {
    const kind = durationMatch[1] === 'image' ? 'image' : 'video'
    const itemNumber = Number.parseInt(durationMatch[2], 10)
    const seconds = Number.parseFloat(durationMatch[3])
    const id = idsForKind(index, kind)[itemNumber - 1]
    if (!id) {
      return { action: 'no_op', message: `Could not find ${kind} #${itemNumber}.` }
    }
    if (kind === 'image') {
      const image = index.images[itemNumber - 1]
      const startTime = image?.startTime ?? 0
      return {
        action: 'edit_manifest',
        mutations: [{ type: 'updateImage', id, endTime: startTime + seconds }],
        message: `Set image #${itemNumber} duration to ${seconds}s.`,
      }
    }
    return {
      action: 'edit_manifest',
      mutations: [{ type: 'updateVideo', id, duration: seconds }],
      message: `Set video #${itemNumber} duration to ${seconds}s.`,
    }
  }

  const imageStartMatch = normalized.match(
    /\b(?:move|set)\s+image\s+(\d+)\s+(?:to\s+)?start\s+(?:at|to)\s+(\d+(?:\.\d+)?)\s*(?:seconds?|s)?\b/
  )
  if (imageStartMatch) {
    const itemNumber = Number.parseInt(imageStartMatch[1], 10)
    const startTime = Number.parseFloat(imageStartMatch[2])
    const image = index.images[itemNumber - 1]
    const id = image?.id
    if (!id) {
      return { action: 'no_op', message: `Could not find image #${itemNumber}.` }
    }
    const duration = (image.endTime ?? 0) - (image.startTime ?? 0)
    return {
      action: 'edit_manifest',
      mutations: [{ type: 'updateImage', id, startTime, endTime: startTime + duration }],
      message: `Moved image #${itemNumber} to start at ${startTime}s.`,
    }
  }

  const videoStartMatch = normalized.match(
    /\b(?:move|set)\s+video\s+(\d+)\s+(?:to\s+)?(?:start\s+)?(?:at|to)\s+(\d+(?:\.\d+)?)\s*(?:seconds?|s)?\b/
  )
  if (videoStartMatch) {
    const itemNumber = Number.parseInt(videoStartMatch[1], 10)
    const timestamp = Number.parseFloat(videoStartMatch[2])
    const id = idsForKind(index, 'video')[itemNumber - 1]
    if (!id) {
      return { action: 'no_op', message: `Could not find video #${itemNumber}.` }
    }
    return {
      action: 'edit_manifest',
      mutations: [{ type: 'updateVideo', id, timestamp }],
      message: `Moved video #${itemNumber} to start at ${timestamp}s.`,
    }
  }

  const videoSpeedMatch = normalized.match(
    /\b(?:set\s+)?video\s+(\d+)\s+(?:playback\s+)?speed\s+to\s+(\d+(?:\.\d+)?)\s*x?\b/
  )
  if (videoSpeedMatch) {
    const itemNumber = Number.parseInt(videoSpeedMatch[1], 10)
    const speed = Number.parseFloat(videoSpeedMatch[2])
    const id = idsForKind(index, 'video')[itemNumber - 1]
    if (!id) {
      return { action: 'no_op', message: `Could not find video #${itemNumber}.` }
    }
    return {
      action: 'edit_manifest',
      mutations: [{ type: 'updateVideo', id, playbackSpeed: speed }],
      message: `Set video #${itemNumber} playback speed to ${speed}x.`,
    }
  }

  const audioSpeedMatch = normalized.match(
    /\b(?:set\s+)?audio\s+(\d+)\s+(?:playback\s+)?speed\s+to\s+(\d+(?:\.\d+)?)\s*x?\b/
  )
  if (audioSpeedMatch) {
    const itemNumber = Number.parseInt(audioSpeedMatch[1], 10)
    const speed = Number.parseFloat(audioSpeedMatch[2])
    const id = idsForKind(index, 'audio')[itemNumber - 1]
    if (!id) {
      return { action: 'no_op', message: `Could not find audio #${itemNumber}.` }
    }
    return {
      action: 'edit_manifest',
      mutations: [{ type: 'updateAudio', id, playbackSpeed: speed }],
      message: `Set audio #${itemNumber} playback speed to ${speed}x.`,
    }
  }

  const halfSpeedMatch = normalized.match(/\bslow\s+down\s+video\s+(\d+)\s+to\s+half\s+speed\b/)
  if (halfSpeedMatch) {
    const itemNumber = Number.parseInt(halfSpeedMatch[1], 10)
    const id = idsForKind(index, 'video')[itemNumber - 1]
    if (!id) {
      return { action: 'no_op', message: `Could not find video #${itemNumber}.` }
    }
    return {
      action: 'edit_manifest',
      mutations: [{ type: 'updateVideo', id, playbackSpeed: 0.5 }],
      message: `Set video #${itemNumber} playback speed to 0.5x.`,
    }
  }

  const textStyleMatch = normalized.match(/\b(?:make|set)\s+text\s+(\d+)\s+(negative|highlight)\s+style\b/)
  if (textStyleMatch) {
    const itemNumber = Number.parseInt(textStyleMatch[1], 10)
    const style = textStyleMatch[2] as 'negative' | 'highlight'
    const id = idsForKind(index, 'text')[itemNumber - 1]
    if (!id) {
      return { action: 'no_op', message: `Could not find text #${itemNumber}.` }
    }
    return {
      action: 'edit_manifest',
      mutations: [{ type: 'updateText', id, style }],
      message: `Set text #${itemNumber} style to ${style}.`,
    }
  }

  const centerTextMatch = normalized.match(/\bcenter\s+text\s+(\d+)\b/)
  if (centerTextMatch) {
    const itemNumber = Number.parseInt(centerTextMatch[1], 10)
    const id = idsForKind(index, 'text')[itemNumber - 1]
    if (!id) {
      return { action: 'no_op', message: `Could not find text #${itemNumber}.` }
    }
    return {
      action: 'edit_manifest',
      mutations: [{ type: 'updateText', id, centerOnCanvas: true }],
      message: `Centered text #${itemNumber} on the canvas.`,
    }
  }

  return null
}
