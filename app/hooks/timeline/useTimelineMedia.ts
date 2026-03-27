import { useCallback } from 'react'
import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { AudioClass } from '@/app/models/AudioClass'
import { ASPECT_RATIOS, computeMediaCropForAspect, resolveVideoMetadata } from '@/app/lib/mediaUtils'
import { findFreeAudioOverlayRow, findFreeVisualOverlayRow } from '@/app/lib/overlayRowUtils'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { useManifestStore } from '@/app/stores/manifestStore'
import { AspectRatio } from '@/app/stores/manifest/types'

interface UseTimelineMediaProps {
  videos: VideoClass[]
  images: ImageClass[]
  playbackTime: number
  aspectRatio: AspectRatio
  addVideo: (video: VideoClass) => void
  addImage: (image: ImageClass) => void
  addAudioToManifest: (audio: AudioClass) => void
  setAudio: (audio: AudioClass) => void
  updateAudio: (id: string, updates: Partial<AudioClass>) => void
  audios: AudioClass[]
}

export function useTimelineMedia({
  videos,
  images,
  playbackTime,
  aspectRatio,
  addVideo,
  addImage,
  addAudioToManifest,
  setAudio,
  updateAudio,
  audios,
}: UseTimelineMediaProps) {
  const setSelectedAudioId = useSelectionStore((state) => state.setSelectedAudioId)
  const setSelectedVideoId = useSelectionStore((state) => state.setSelectedVideoId)
  const setSelectedImageId = useSelectionStore((state) => state.setSelectedImageId)
  const setSelectedTextId = useSelectionStore((state) => state.setSelectedTextId)

  const findFreeRow = useCallback((
    items: Array<{ startTime: number; endTime: number; row: number }>,
    start: number,
    end: number
  ): number => {
    let row = 0
    while (true) {
      const rowItems = items.filter((i) => i.row === row)
      const hasOverlap = rowItems.some((i) => start < i.endTime && end > i.startTime)
      if (!hasOverlap) return row
      row++
    }
  }, [])

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    for (const file of Array.from(files)) {
      if (file.type.startsWith('video/')) {
        const blobUrl = URL.createObjectURL(file)
        const { duration } = await resolveVideoMetadata(blobUrl)
        const id = `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        const title = file.name.replace(/\.[^.]+$/, '').substring(0, 50)
        const start = playbackTime
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
        const crop = await computeMediaCropForAspect(blobUrl, 'video', aspectRatio, rw, rh, aspectRatio)
        const x = crop.x
        const y = crop.y
        const width = crop.width
        const height = crop.height
        const cropAspect = crop.cropAspect
        const cropSx = crop.cropSx
        const cropSy = crop.cropSy
        const cropSw = crop.cropSw
        const cropSh = crop.cropSh
        addVideo(new VideoClass(
          id,
          title,
          blobUrl,
          duration,
          start,
          undefined, undefined, undefined,
          0, 0,
          undefined,
          !isMainTrack,
          x, y, width, height,
          1,
          'none',
          'none',
          0.5,
          1.0, // transitionDuration
          1.0, // animationDuration
          undefined, undefined, undefined,
          row,
          false,
          cropAspect,
          cropSx, cropSy, cropSw, cropSh,
          undefined, undefined, undefined,
          1
        ))
      } else if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file)
        const start = playbackTime
        const end = start + 5
        
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
        const crop = await computeMediaCropForAspect(url, 'image', aspectRatio, rw, rh, aspectRatio)
        const x = crop.x
        const y = crop.y
        const width = crop.width
        const height = crop.height
        const cropAspect = crop.cropAspect
        const cropSx = crop.cropSx
        const cropSy = crop.cropSy
        const cropSw = crop.cropSw
        const cropSh = crop.cropSh
        addImage(new ImageClass(
          `image-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          file.name,
          url,
          start,
          end,
          x, y, width, height,
          1,
          new Date(),
          isMainTrack,
          'none',
          'none',
          cropAspect,
          cropSx, cropSy, cropSw, cropSh,
          0.5,
          1.0, // transitionDuration
          1.0, // animationDuration
          undefined, undefined, undefined,
          row
        ))
      } else if (file.type.startsWith('audio/')) {
        const blobUrl = URL.createObjectURL(file)
        const audioId = `audio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        try {
          const arrayBuffer = await file.arrayBuffer()
          const audioCtx = new AudioContext()
          const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
          await audioCtx.close()
          const audioDuration = audioBuffer.duration

          // Get the latest audios from the store to handle multiple files in one batch
          const currentAudios = useManifestStore.getState().audios

          const hasMainAudio = currentAudios.some((a) => !a.isOverlay)
          const mainAudio = currentAudios.find((a) => !a.isOverlay)
          let isOverlay = hasMainAudio
          let startTime = isOverlay ? playbackTime : 0
          let endTime = startTime + audioDuration

          const rangesOverlap = (a0: number, a1: number, b0: number, b1: number) =>
            a0 < b1 - 1e-3 && a1 > b0 + 1e-3

          if (mainAudio && isOverlay && rangesOverlap(startTime, endTime, mainAudio.startTime, mainAudio.endTime)) {
            const othersForRow = currentAudios
              .filter((a) => a.id !== mainAudio.id)
              .map((a) => ({ startTime: a.startTime, endTime: a.endTime, row: a.row }))
            const demotedRow = Math.max(1, findFreeAudioOverlayRow(mainAudio.startTime, mainAudio.endTime))
            updateAudio(mainAudio.id, { isOverlay: true, row: demotedRow })
            isOverlay = false
            startTime = playbackTime
            endTime = startTime + audioDuration
          }

          const row = isOverlay ? Math.max(1, findFreeAudioOverlayRow(startTime, endTime)) : 0

          const audioInstance = new AudioClass(
            audioId,
            file.name,
            blobUrl,
            startTime,
            endTime,
            [],
            undefined,
            0,
            0,
            audioDuration,
            1,
            isOverlay,
            row
          )

          if (!isOverlay) setAudio(audioInstance)
          addAudioToManifest(audioInstance)
          setSelectedAudioId(audioId)
          setSelectedVideoId(null)
          setSelectedImageId(null)
          setSelectedTextId(null)
        } catch {
        }
      }
    }

    e.target.value = ''
  }, [playbackTime, aspectRatio, addVideo, addImage, addAudioToManifest, setAudio, updateAudio, setSelectedAudioId, setSelectedVideoId, setSelectedImageId, setSelectedTextId, findFreeRow])

  return { handleFileSelect, findFreeRow }
}
