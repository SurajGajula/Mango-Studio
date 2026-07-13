import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { TextClass } from '@/app/models/TextClass'
import { AudioClass } from '@/app/models/AudioClass'
import { quantizeTimelineSeconds } from '@/app/lib/timeline/timelineQuantize'

const PROVISIONAL_VIDEO_TIMELINE_SPAN_SEC = 120

export function videoTrimmedSourceSpanSeconds(video: VideoClass): number {
  const od = quantizeTimelineSeconds(video.originalDuration ?? 0)
  if (od <= 1e-9) return 0
  const trimStart = quantizeTimelineSeconds(video.trimStart ?? 0)
  const trimEnd = quantizeTimelineSeconds(video.trimEnd ?? 0)
  return quantizeTimelineSeconds(Math.max(0, od - trimStart - trimEnd))
}

type VideoTrimSyncFields = Pick<
  VideoClass,
  'originalDuration' | 'trimStart' | 'trimEnd' | 'playbackSpeed' | 'duration' | 'sourceDuration'
>

export function syncVideoTrimDerivedFields(
  video: VideoTrimSyncFields,
  updates: Partial<VideoTrimSyncFields>
): Partial<VideoTrimSyncFields> {
  const orig = quantizeTimelineSeconds(
    updates.originalDuration ?? video.originalDuration ?? video.duration ?? 0
  )
  const trimStart = quantizeTimelineSeconds(updates.trimStart ?? video.trimStart ?? 0)
  const playbackSpeed = updates.playbackSpeed ?? video.playbackSpeed ?? 1
  const trimTouched =
    updates.trimStart !== undefined ||
    updates.trimEnd !== undefined ||
    updates.originalDuration !== undefined
  const durationTouched = updates.duration !== undefined
  const speedTouched = updates.playbackSpeed !== undefined

  if (trimTouched && !durationTouched) {
    const trimEnd = quantizeTimelineSeconds(updates.trimEnd ?? video.trimEnd ?? 0)
    const sourceDuration = quantizeTimelineSeconds(Math.max(0, orig - trimStart - trimEnd))
    const duration = quantizeTimelineSeconds(sourceDuration / playbackSpeed)
    return { ...updates, originalDuration: orig, trimStart, trimEnd, sourceDuration, duration }
  }

  if (durationTouched) {
    const duration = quantizeTimelineSeconds(updates.duration ?? video.duration ?? 0)
    const computedSourceDuration = quantizeTimelineSeconds(duration * playbackSpeed)
    const sourceDuration =
      updates.sourceDuration !== undefined
        ? quantizeTimelineSeconds(updates.sourceDuration)
        : computedSourceDuration
    const trimEnd =
      updates.trimEnd !== undefined
        ? quantizeTimelineSeconds(updates.trimEnd)
        : quantizeTimelineSeconds(Math.max(0, orig - trimStart - computedSourceDuration))
    return { ...updates, originalDuration: orig, trimStart, trimEnd, sourceDuration, duration }
  }

  if (speedTouched) {
    const trimEnd = quantizeTimelineSeconds(updates.trimEnd ?? video.trimEnd ?? 0)
    const sourceDuration = quantizeTimelineSeconds(Math.max(0, orig - trimStart - trimEnd))
    const duration = quantizeTimelineSeconds(sourceDuration / playbackSpeed)
    return { ...updates, originalDuration: orig, trimStart, trimEnd, sourceDuration, duration }
  }

  return updates
}

export function manifestVideoTimelineSpanSeconds(video: VideoClass): number {
  const fromTrims = videoTrimmedSourceSpanSeconds(video)
  if (fromTrims > 1e-9) {
    return quantizeTimelineSeconds(fromTrims / (video.playbackSpeed ?? 1))
  }
  const d = video.duration
  if (d != null && d > 1e-9) return quantizeTimelineSeconds(d)
  if (video.url || video.sourceUrl) return PROVISIONAL_VIDEO_TIMELINE_SPAN_SEC
  return 0
}

export function formatTime(seconds: number) {
  const absSeconds = Math.abs(seconds)
  const mins = Math.floor(absSeconds / 60)
  const secs = Math.floor(absSeconds % 60)
  const ms = Math.floor((absSeconds % 1) * 100)
  const prefix = seconds < 0 ? '-' : ''
  return `${prefix}${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(ms).padStart(2, '0')}`
}

export function alignTimeToFrame(time: number, fps: number): number {
  if (!Number.isFinite(time) || !Number.isFinite(fps) || fps <= 0) return 0
  return Math.floor(Math.max(0, time) * fps + 1e-7) / fps
}

export function calculateTotalDuration(
  videos: VideoClass[],
  images: ImageClass[],
  texts?: TextClass[],
  audios?: AudioClass[]
): number {
  const videoDuration = videos.reduce(
    (max, v) => Math.max(max, (v.timestamp ?? 0) + manifestVideoTimelineSpanSeconds(v)),
    0
  )
  const imageDuration = (images || []).reduce((max, img) => Math.max(max, img.endTime), 0)
  const textDuration = (texts || []).reduce((max, txt) => Math.max(max, txt.endTime), 0)

  const audioItemsDuration = (audios || []).reduce((max, aud) => Math.max(max, aud.endTime ?? 0), 0)
  return Math.max(videoDuration, imageDuration, textDuration, audioItemsDuration)
}
