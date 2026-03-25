import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { TextClass } from '@/app/models/TextClass'
import { AudioClass } from '@/app/models/AudioClass'

export function formatTime(seconds: number) {
  const absSeconds = Math.abs(seconds)
  const mins = Math.floor(absSeconds / 60)
  const secs = Math.floor(absSeconds % 60)
  const ms = Math.floor((absSeconds % 1) * 100)
  const prefix = seconds < 0 ? '-' : ''
  return `${prefix}${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(ms).padStart(2, '0')}`
}

export function calculateTotalDuration(
  videos: VideoClass[],
  images: ImageClass[],
  texts?: TextClass[],
  audios?: AudioClass[]
): number {
  const videoDuration = videos.reduce((max, v) => Math.max(max, (v.timestamp ?? 0) + (v.duration || 0)), 0)
  const imageDuration = (images || []).reduce((max, img) => Math.max(max, img.endTime), 0)
  const textDuration = (texts || []).reduce((max, txt) => Math.max(max, txt.endTime), 0)

  const audioItemsDuration = (audios || []).reduce((max, aud) => Math.max(max, (aud.startTime ?? 0) + ((aud.originalDuration ?? 0) - (aud.trimStart ?? 0) - (aud.trimEnd ?? 0)) / (aud.playbackSpeed ?? 1)), 0)
  return Math.max(videoDuration, imageDuration, textDuration, audioItemsDuration)
}
