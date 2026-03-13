import { useCallback } from 'react'
import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { AudioClass } from '@/app/models/AudioClass'
import { resolveVideoMetadata, toMono, computeImageDimensions, computeMediaDimensions, computeMediaCropForAspect, ASPECT_RATIOS } from '@/app/lib/mediaUtils'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { useAudioStore } from '@/app/stores/audioStore'
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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
        const mediaItems = [
          ...images.map((img) => ({ startTime: img.startTime, endTime: img.endTime, row: img.row })),
          ...videos.map((v) => ({ startTime: v.timestamp, endTime: v.timestamp + (v.duration ?? 0), row: v.row })),
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
        addVideo(new VideoClass(id, title, blobUrl, duration, start, undefined, undefined, undefined, 0, 0, undefined, !isMainTrack, x, y, width, height, undefined, undefined, undefined, row, false, cropAspect, cropSx, cropSy, cropSw, cropSh, undefined, undefined, undefined, 1))
      } else if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file)
        const start = playbackTime
        const end = start + 5
        const mediaItems = [
          ...images.map((img) => ({ startTime: img.startTime, endTime: img.endTime, row: img.row })),
          ...videos.map((v) => ({ startTime: v.timestamp, endTime: v.timestamp + (v.duration ?? 0), row: v.row })),
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
          x, y, width, height, 1,
          undefined,
          isMainTrack,
          undefined, undefined, undefined, undefined, undefined, undefined, undefined,
          row,
        ))
      } else if (file.type.startsWith('audio/')) {
        if (videos.length === 0 && images.length === 0) continue

        const blobUrl = URL.createObjectURL(file)
        const audioId = `audio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        setIsAnalyzing(true)
        try {
          const arrayBuffer = await file.arrayBuffer()
          const audioCtx = new AudioContext()
          const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
          await audioCtx.close()
          const audioDuration = audioBuffer.duration
          const defaultTrimEnd = Math.max(0, audioDuration - totalDuration)
          const audioInstance = new AudioClass(audioId, file.name, blobUrl, 0, audioDuration, [], undefined, 0, defaultTrimEnd, audioDuration, 1)
          setAudio(audioInstance)
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
            setAudioAnalysis(ev.data)
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
  }

  return { handleFileSelect, findFreeRow }
}
