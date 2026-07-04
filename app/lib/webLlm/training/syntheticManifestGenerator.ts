import type { LocalChatManifest } from '@/app/lib/webLlm/buildLocalManifestContext'
import type { Rng } from '@/app/lib/webLlm/training/rng'

const TRANSITIONS = ['none', 'fade', 'flash', 'wipe', 'morph'] as const
const ANIMATIONS = ['none', 'zoom-in', 'zoom-out', 'stretch-out', 'shake', 'jitter', 'rotate'] as const
const IMAGE_NAMES = ['Cover', 'Scene', 'B-roll', 'Insert', 'Outro', 'Title']
const VIDEO_TITLES = ['Intro', 'Main', 'Cutaway', 'Reaction', 'Closing', 'Clip']
const AUDIO_NAMES = ['Music', 'Voiceover', 'SFX', 'Ambience']

export type SyntheticManifestOptions = {
  videoCount?: number
  imageCount?: number
  audioCount?: number
  textCount?: number
}

function id(prefix: string, index: number): string {
  return `${prefix}-${String(index + 1).padStart(2, '0')}`
}

export function generateSyntheticManifest(rng: Rng, options: SyntheticManifestOptions = {}): LocalChatManifest {
  const videoCount = options.videoCount ?? rng.int(3, 10)
  const imageCount = options.imageCount ?? rng.int(0, 6)
  const audioCount = options.audioCount ?? rng.int(1, 4)
  const textCount = options.textCount ?? rng.int(1, 3)

  let cursor = 0
  const videos = Array.from({ length: videoCount }, (_, index) => {
    const duration = rng.int(2, 6)
    const item = {
      id: id('video', index),
      title: rng.pick(VIDEO_TITLES),
      timestamp: cursor,
      duration,
      muted: rng.next() < 0.2,
      row: 0,
      animation: rng.pick([...ANIMATIONS]),
      transition: rng.pick([...TRANSITIONS]),
      zoomIntensity: rng.pick([0.3, 0.5, 0.8]),
      animationDuration: rng.pick([0.5, 1, 2]),
      transitionDuration: rng.pick([0.5, 1]),
    }
    cursor += duration
    return item
  })

  let imageStart = 0
  const images = Array.from({ length: imageCount }, (_, index) => {
    const duration = rng.int(2, 5)
    const item = {
      id: id('image', index),
      name: rng.pick(IMAGE_NAMES),
      startTime: imageStart,
      endTime: imageStart + duration,
      row: 0,
      animation: rng.pick([...ANIMATIONS]),
      transition: rng.pick([...TRANSITIONS]),
      zoomIntensity: rng.pick([0.3, 0.5, 0.8]),
      animationDuration: rng.pick([0.5, 1, 2]),
      transitionDuration: rng.pick([0.5, 1]),
    }
    imageStart += duration
    return item
  })

  const audios = Array.from({ length: audioCount }, (_, index) => ({
    id: id('audio', index),
    name: rng.pick(AUDIO_NAMES),
    startTime: 0,
    endTime: cursor,
    originalDuration: cursor,
    trimStart: 0,
    trimEnd: 0,
    volume: 1,
  }))

  const texts = Array.from({ length: textCount }, (_, index) => ({
    id: id('text', index),
    content: rng.pick(['Hello', 'Chapter 1', 'Subscribe']),
    startTime: index * 2,
    endTime: index * 2 + 3,
  }))

  const manifest: LocalChatManifest = {}
  if (videos.length > 0) manifest.videos = videos
  if (images.length > 0) manifest.images = images
  if (audios.length > 0) manifest.audios = audios
  if (texts.length > 0) manifest.texts = texts
  return manifest
}
