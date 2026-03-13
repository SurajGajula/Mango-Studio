import { useState } from 'react'
import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { resolveVideoMetadata } from '@/app/lib/mediaUtils'
import { extractVideoClip } from '@/app/lib/videoExporter'
import { useManifestStore } from '@/app/stores/manifestStore'

interface UseTimelineReplaceProps {
  videos: VideoClass[]
  images: ImageClass[]
  replaceImageSource: (id: string, url: string, name: string) => void
  replaceImageWithVideo: (id: string, video: VideoClass) => void
  replaceVideoSource: (id: string, url: string, title: string) => void
  replaceVideoWithImage: (id: string, image: ImageClass) => void
  updateVideo: (id: string, updates: Partial<VideoClass>) => void
  setExportProgress: (progress: any) => void
}

export function useTimelineReplace({
  videos,
  images,
  replaceImageSource,
  replaceImageWithVideo,
  replaceVideoSource,
  replaceVideoWithImage,
  updateVideo,
  setExportProgress,
}: UseTimelineReplaceProps) {
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null)
  const [replaceVideoData, setReplaceVideoData] = useState<{
    targetId: string
    targetType: 'image' | 'video'
    url: string
    title: string
    duration: number
    width: number
    height: number
    windowDuration: number
    initialTrimStart: number
    projectStartTime?: number
  } | null>(null)
  const [isReplacingClip, setIsReplacingClip] = useState(false)

  const handleReplaceSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !replaceTargetId) return

    const image = images.find((img) => img.id === replaceTargetId)
    const video = videos.find((v) => v.id === replaceTargetId)
    
    if (image) {
      if (file.type.startsWith('image/')) {
        const newUrl = URL.createObjectURL(file)
        const newName = file.name
        replaceImageSource(replaceTargetId, newUrl, newName)
        setReplaceTargetId(null)
      } else if (file.type.startsWith('video/')) {
        const url = URL.createObjectURL(file)
        const { duration, width, height } = await resolveVideoMetadata(url)
        const windowDuration = image.duration

        if (duration < windowDuration) {
          alert(`Video is too short. Selected image is ${windowDuration.toFixed(1)}s, but video is only ${duration.toFixed(1)}s.`)
          URL.revokeObjectURL(url)
          return
        }

        if (duration === windowDuration) {
          const videoInstance = new VideoClass(
            `video-${Date.now()}`,
            file.name,
            url,
            windowDuration,
            image.startTime,
            undefined, undefined,
            duration,
            0, 0,
            undefined,
            !image.isMainTrack,
            image.x, image.y, image.width, image.height,
            image.opacity,
            image.zoom,
            image.zoomIntensity,
            image.row,
            false,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            1
          )
          replaceImageWithVideo(replaceTargetId, videoInstance)
          setReplaceTargetId(null)
        } else {
          setReplaceVideoData({
            targetId: replaceTargetId,
            targetType: 'image',
            url,
            title: file.name,
            duration,
            width,
            height,
            windowDuration,
            initialTrimStart: 0,
            projectStartTime: image.startTime,
          })
        }
      }
    } else if (video) {
      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file)
        const imageInstance = new ImageClass(
          `image-${Date.now()}`,
          file.name,
          url,
          video.timestamp,
          video.timestamp + (video.duration ?? 5),
          video.x, video.y, video.width, video.height,
          video.opacity,
          undefined,
          !video.isOverlay,
          video.zoom,
          undefined, undefined, undefined, undefined, undefined,
          video.zoomIntensity,
          video.row
        )
        replaceVideoWithImage(replaceTargetId, imageInstance)
        setReplaceTargetId(null)
      } else if (file.type.startsWith('video/')) {
        const url = URL.createObjectURL(file)
        const { duration, width, height } = await resolveVideoMetadata(url)
        const windowDuration = video.duration ?? 5

        if (duration < windowDuration) {
          alert(`Video is too short. Current video clip is ${windowDuration.toFixed(1)}s, but new video is only ${duration.toFixed(1)}s.`)
          URL.revokeObjectURL(url)
          return
        }

        if (duration === windowDuration) {
          replaceVideoSource(replaceTargetId, url, file.name)
          setReplaceTargetId(null)
        } else {
          setReplaceVideoData({
            targetId: replaceTargetId,
            targetType: 'video',
            url,
            title: file.name,
            duration,
            width,
            height,
            windowDuration,
            initialTrimStart: 0,
            projectStartTime: video.timestamp,
          })
        }
      }
    }

    e.target.value = ''
  }

  const handleConfirmReplaceVideo = async (trimStart: number) => {
    if (!replaceVideoData) return
    setIsReplacingClip(true)

    try {
      let finalUrl = replaceVideoData.url
      let finalTrimStart = trimStart
      let finalTrimEnd = replaceVideoData.duration - (trimStart + replaceVideoData.windowDuration)
      let finalOriginalDuration = replaceVideoData.duration

      const originalSourceUrl = replaceVideoData.url
      let sourceUrl: string | undefined = undefined
      let sourceTrimStart: number | undefined = undefined
      let sourceDuration: number | undefined = undefined

      if (replaceVideoData.duration > 60) {
        setExportProgress({ phase: 'rendering', progress: 0, message: 'Extracting clip...' })
        try {
          const clipBlob = await extractVideoClip(
            replaceVideoData.url,
            trimStart,
            replaceVideoData.windowDuration,
            (msg) => setExportProgress({ phase: 'rendering', progress: 50, message: msg })
          )
          finalUrl = URL.createObjectURL(clipBlob)
          finalTrimStart = 0
          finalTrimEnd = 0
          finalOriginalDuration = replaceVideoData.windowDuration
          
          sourceUrl = originalSourceUrl
          sourceTrimStart = trimStart
          sourceDuration = replaceVideoData.duration
        } catch (err) {
          console.error('Failed to extract clip:', err)
          alert('Failed to process video clip. Using original source instead.')
        } finally {
          setExportProgress(null)
        }
      }

      if (replaceVideoData.targetType === 'image') {
        const image = images.find((img) => img.id === replaceVideoData.targetId)
        if (!image) return
        const oldUrl = image.url
        const videoInstance = new VideoClass(
          `video-${Date.now()}`,
          replaceVideoData.title,
          finalUrl,
          replaceVideoData.windowDuration,
          image.startTime,
          undefined, undefined,
          finalOriginalDuration,
          finalTrimStart,
          finalTrimEnd,
          undefined,
          !image.isMainTrack,
          image.x, image.y, image.width, image.height,
          image.opacity,
          image.zoom,
          image.zoomIntensity,
          image.row,
          false,
          undefined, undefined, undefined, undefined, undefined,
          sourceUrl,
          sourceTrimStart,
          sourceDuration,
          1
        )
        replaceImageWithVideo(replaceVideoData.targetId, videoInstance)
        if (oldUrl.startsWith('blob:')) {
          const stillUsed = useManifestStore.getState().images.some(img => img.url === oldUrl) ||
                            useManifestStore.getState().videos.some(v => v.url === oldUrl || v.sourceUrl === oldUrl)
          if (!stillUsed) URL.revokeObjectURL(oldUrl)
        }
      } else {
        const video = videos.find((v) => v.id === replaceVideoData.targetId)
        if (!video) return
        const oldUrl = video.url
        updateVideo(video.id, {
          url: finalUrl,
          title: replaceVideoData.title,
          duration: replaceVideoData.windowDuration,
          originalDuration: finalOriginalDuration,
          trimStart: finalTrimStart,
          trimEnd: finalTrimEnd,
          sourceUrl,
          sourceTrimStart,
          sourceDuration
        })
        if (oldUrl && oldUrl !== finalUrl && oldUrl.startsWith('blob:')) {
          const stillUsed = useManifestStore.getState().videos.some(v => v.url === oldUrl || v.sourceUrl === oldUrl)
          if (!stillUsed) URL.revokeObjectURL(oldUrl)
        }
      }
      setReplaceVideoData(null)
      setReplaceTargetId(null)
    } finally {
      setIsReplacingClip(false)
    }
  }

  const handleVideoDoubleClick = (videoId: string) => {
    const video = videos.find((v) => v.id === videoId)
    if (!video || (!video.url && !video.sourceUrl)) return
    const sourceUrl = video.sourceUrl || video.url
    const originalDuration = video.sourceDuration ?? video.originalDuration ?? video.duration ?? 0
    const initialTrimStart = video.sourceTrimStart ?? video.trimStart
    if (originalDuration <= video.duration!) return
    setReplaceVideoData({
      targetId: videoId,
      targetType: 'video',
      url: sourceUrl!,
      title: video.title,
      duration: originalDuration,
      width: video.width,
      height: video.height,
      windowDuration: video.duration!,
      initialTrimStart: initialTrimStart,
      projectStartTime: video.timestamp
    })
  }

  return { replaceTargetId, setReplaceTargetId, replaceVideoData, setReplaceVideoData, isReplacingClip, handleReplaceSelect, handleConfirmReplaceVideo, handleVideoDoubleClick }
}
