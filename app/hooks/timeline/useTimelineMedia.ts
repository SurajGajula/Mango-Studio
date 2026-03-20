import { useCallback } from 'react'
import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { AudioClass } from '@/app/models/AudioClass'
import { ASPECT_RATIOS, computeMediaCropForAspect, computeMediaDimensions, computeImageDimensions, toMono, resolveVideoMetadata } from '@/app/lib/mediaUtils'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { useAudioStore } from '@/app/stores/audioStore'
import { useManifestStore } from '@/app/stores/manifestStore'
import { AspectRatio } from '@/app/stores/manifest/types'

interface UseTimelineMediaProps {
  videos: VideoClass[]
  images: ImageClass[]
  playbackTime: number
  aspectRatio: AspectRatio
  totalDuration: number
  addVideo: (video: VideoClass) => void
  addImage: (image: ImageClass) => void
  addAudioToManifest: (audio: AudioClass) => void
  setAudio: (audio: AudioClass) => void
  setIsAnalyzing: (analyzing: boolean) => void
  setAudioAnalysis: (analysis: any) => void
  audios: AudioClass[]
}

export function useTimelineMedia({
  videos,
  images,
  playbackTime,
  aspectRatio,
  totalDuration,
  addVideo,
  addImage,
  addAudioToManifest,
  setAudio,
  setIsAnalyzing,
  setAudioAnalysis,
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
        const { duration, width: videoWidth, height: videoHeight } = await resolveVideoMetadata(blobUrl)
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
        const row = findFreeRow(mediaItems, start, end)
        const isMainTrack = row === 0
        let x, y, width, height, cropAspect, cropSx, cropSy, cropSw, cropSh
        if (isMainTrack) {
          const [rw, rh] = ASPECT_RATIOS[aspectRatio]
          const crop = await computeMediaCropForAspect(blobUrl, 'video', aspectRatio, rw, rh, aspectRatio)
          x = crop.x; y = crop.y; width = crop.width; height = crop.height
          cropAspect = crop.cropAspect; cropSx = crop.cropSx; cropSy = crop.cropSy; cropSw = crop.cropSw; cropSh = crop.cropSh
        } else {
          const dims = computeMediaDimensions(videoWidth, videoHeight, aspectRatio, isMainTrack)
          x = dims.x; y = dims.y; width = dims.width; height = dims.height
        }
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
          1.0,
          undefined,
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
        const row = findFreeRow(mediaItems, start, end)
        const isMainTrack = row === 0
        const { x, y, width, height } = await computeImageDimensions(url, aspectRatio, isMainTrack)
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
          undefined,
          0, 0, 1, 1,
          0.5,
          1.0,
          undefined,
          row
        ))
      } else if (file.type.startsWith('audio/')) {
        const blobUrl = URL.createObjectURL(file)
        const audioId = `audio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        setIsAnalyzing(true)
        try {
          const arrayBuffer = await file.arrayBuffer()
          const audioCtx = new AudioContext()
          const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
          await audioCtx.close()
          const audioDuration = audioBuffer.duration

          // Get the latest audios from the store to handle multiple files in one batch
          const currentAudios = useManifestStore.getState().audios

          // If there's already a main audio (row 0, isOverlay false), the new one is overlay.
          const hasMainAudio = currentAudios.some((a) => !a.isOverlay)
          const isOverlay = hasMainAudio
          const startTime = isOverlay ? playbackTime : 0
          const endTime = startTime + audioDuration

          const audioItems = currentAudios.map((a) => ({ startTime: a.startTime, endTime: a.endTime, row: a.row }))
          const row = isOverlay ? findFreeRow(audioItems, startTime, endTime) : 0

          const defaultTrimEnd = Math.max(0, audioDuration - (isOverlay ? audioDuration : totalDuration))
          const audioInstance = new AudioClass(
            audioId,
            file.name,
            blobUrl,
            startTime,
            endTime,
            [],
            undefined,
            0,
            defaultTrimEnd,
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

          const mono = toMono(audioBuffer)
          const worker = new Worker(
            new URL('../../workers/audioAnalysis.worker.ts', import.meta.url)
          )
          worker.onmessage = (ev) => {
            if (!isOverlay) {
              setAudioAnalysis(ev.data)
            } else {
              setIsAnalyzing(false)
            }
            worker.terminate()
          }
          worker.onerror = () => {
            setIsAnalyzing(false)
            worker.terminate()
          }
          worker.postMessage({ samples: mono, sampleRate: audioBuffer.sampleRate }, [mono.buffer])
        } catch {
          setIsAnalyzing(false)
        }
      }
    }

    e.target.value = ''
  }, [playbackTime, aspectRatio, totalDuration, addVideo, addImage, addAudioToManifest, setAudio, setIsAnalyzing, setAudioAnalysis, setSelectedAudioId, setSelectedVideoId, setSelectedImageId, setSelectedTextId, findFreeRow])

  return { handleFileSelect, findFreeRow }
}
