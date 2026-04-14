import { AudioClass } from '@/app/models/AudioClass'
import { VideoClass } from '@/app/models/VideoClass'
import { ASPECT_RATIOS, computeMediaCropForAspect, resolveVideoMetadata } from '@/app/lib/mediaUtils'
import { findFreeAudioOverlayRow, findFreeVisualOverlayRow } from '@/app/lib/overlayRowUtils'
import { useAudioStore } from '@/app/stores/audioStore'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'

function findFreeRow(
  items: Array<{ startTime: number; endTime: number; row: number }>,
  start: number,
  end: number
): number {
  let row = 0
  while (true) {
    const rowItems = items.filter((i) => i.row === row)
    const hasOverlap = rowItems.some((i) => start < i.endTime && end > i.startTime)
    if (!hasOverlap) return row
    row++
  }
}

export async function addVideoToTimelineAtTime(url: string, title: string, startTime: number) {
  const { aspectRatio, addVideo } = useManifestStore.getState()
  const { duration } = await resolveVideoMetadata(url)
  const id = `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const start = Math.max(0, startTime)
  const end = start + duration
  const currentVideos = useManifestStore.getState().videos
  const currentImages = useManifestStore.getState().images
  const mediaItems = [
    ...currentImages.map((img) => ({ startTime: img.startTime, endTime: img.endTime, row: img.row })),
    ...currentVideos.map((v) => ({ startTime: v.timestamp, endTime: v.timestamp + (v.duration ?? 0), row: v.row })),
  ]
  let row = findFreeRow(mediaItems, start, end)
  if (row > 0) {
    row = findFreeVisualOverlayRow(start, end)
  }
  const isMainTrack = row === 0
  const [rw, rh] = ASPECT_RATIOS[aspectRatio]
  const crop = await computeMediaCropForAspect(url, 'video', aspectRatio, rw, rh, aspectRatio)

  addVideo(
    new VideoClass(
      id,
      title,
      url,
      duration,
      start,
      undefined,
      undefined,
      undefined,
      0,
      0,
      undefined,
      !isMainTrack,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      1,
      'none',
      'none',
      0.5,
      1.0,
      1.0,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      row,
      true,
      crop.cropAspect,
      crop.cropSx,
      crop.cropSy,
      crop.cropSw,
      crop.cropSh,
      undefined,
      undefined,
      undefined,
      1
    )
  )
}

export async function addVideoToTimelineAtPlayhead(url: string, title: string) {
  const { playbackTime } = useManifestStore.getState()
  await addVideoToTimelineAtTime(url, title, playbackTime)
}

async function resolveAudioDurationFromUrl(url: string): Promise<number> {
  const response = await fetch(url)
  const arrayBuffer = await response.arrayBuffer()
  const audioCtx = new AudioContext()
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
  await audioCtx.close()
  return audioBuffer.duration
}

export async function addAudioToTimelineAtTime(url: string, name: string, atTime: number, providedDuration?: number) {
  const addAudio = useManifestStore.getState().addAudio
  const updateAudio = useManifestStore.getState().updateAudio
  const setAudio = useAudioStore.getState().setAudio
  const duration = providedDuration ?? (await resolveAudioDurationFromUrl(url))
  const audioId = `audio-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
  const dropTime = Math.max(0, atTime)

  const currentAudios = useManifestStore.getState().audios
  const hasMainAudio = currentAudios.some((a) => !a.isOverlay)
  const mainAudio = currentAudios.find((a) => !a.isOverlay)
  let isOverlay = hasMainAudio
  let startTime = isOverlay ? dropTime : 0
  let endTime = startTime + duration

  const rangesOverlap = (a0: number, a1: number, b0: number, b1: number) =>
    a0 < b1 - 1e-3 && a1 > b0 + 1e-3

  if (mainAudio && isOverlay && rangesOverlap(startTime, endTime, mainAudio.startTime, mainAudio.endTime)) {
    const demotedRow = Math.max(1, findFreeAudioOverlayRow(mainAudio.startTime, mainAudio.endTime))
    updateAudio(mainAudio.id, { isOverlay: true, row: demotedRow })
    isOverlay = false
    startTime = dropTime
    endTime = startTime + duration
  }

  const row = isOverlay ? Math.max(1, findFreeAudioOverlayRow(startTime, endTime)) : 0
  const audioInstance = new AudioClass(
    audioId,
    name,
    url,
    startTime,
    endTime,
    [],
    undefined,
    0,
    0,
    duration,
    1,
    isOverlay,
    row,
    1
  )

  if (!isOverlay) setAudio(audioInstance)
  addAudio(audioInstance)
  const selectionStore = useSelectionStore.getState()
  selectionStore.setSelectedAudioId(audioId)
  selectionStore.setSelectedVideoId(null)
  selectionStore.setSelectedImageId(null)
  selectionStore.setSelectedTextId(null)
}

export async function addAudioToTimelineAtPlayhead(url: string, name: string, providedDuration?: number) {
  const { playbackTime } = useManifestStore.getState()
  await addAudioToTimelineAtTime(url, name, playbackTime, providedDuration)
}
