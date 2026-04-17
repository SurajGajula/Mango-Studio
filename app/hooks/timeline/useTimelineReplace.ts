import { useState, useCallback } from 'react'
import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { resolveVideoMetadata, withoutCanvasPlacement } from '@/app/lib/mediaUtils'
import { extractVideoClip } from '@/app/lib/videoExporter'
import { timelineClipSourceSpanSeconds } from '@/app/lib/renderUtils'
import { useManifestStore } from '@/app/stores/manifestStore'
import { generateId } from '@/app/lib/idUtils'
import { getOrCreateObjectURLForFile } from '@/app/lib/fileObjectUrlCache'
import { FIXED_ASPECT_RATIO } from '@/app/lib/aspectRatio'
import {
  normalizeClipSpeedWindow,
  resolveImagePatch,
  resolveVideoPatch,
  runHistoryTransaction,
} from '@/app/lib/timeline'

interface UseTimelineReplaceProps {
  videos: VideoClass[]
  images: ImageClass[]
  replaceImageWithVideo: (id: string, video: VideoClass) => void
  replaceVideoWithImage: (id: string, image: ImageClass) => void
}

export function useTimelineReplace({
  videos,
  images,
  replaceImageWithVideo,
  replaceVideoWithImage,
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
    playbackSpeed: number
    speedStart?: number
    speedEnd?: number
    speedEasing?: 'linear' | 'ease'
    initialTrimStart: number
    projectStartTime?: number
  } | null>(null)
  const [isReplacingClip, setIsReplacingClip] = useState(false)

  const closeReplaceTarget = useCallback(() => {
    setReplaceTargetId(null)
  }, [])

  const clearReplaceFlow = useCallback(() => {
    setReplaceVideoData(null)
    setReplaceTargetId(null)
  }, [])

  const uploadReplacementToLibrary = useCallback(async (file: File, durationSeconds?: number) => {
    try {
      const formData = new FormData()
      formData.append('file', file)
      if (durationSeconds !== undefined) {
        formData.append('durationSeconds', String(durationSeconds))
      }
      const response = await fetch('/api/media/upload', {
        method: 'POST',
        body: formData,
      })
      if (response.ok) {
        window.dispatchEvent(new Event('account-media-updated'))
      }
    } catch (error) {
      console.error('Failed to persist replacement media to account library:', error)
    }
  }, [])

  const applyReplaceFromUrl = useCallback(
    async (targetId: string, url: string, title: string, sourceKind: 'image' | 'video') => {
      const store = useManifestStore.getState()
      const image = store.images.find((img) => img.id === targetId)
      const video = store.videos.find((v) => v.id === targetId)

      if (image) {
        if (sourceKind === 'image') {
          const { updateImage } = useManifestStore.getState()
          const aspectRatio = FIXED_ASPECT_RATIO
          const patch = await resolveImagePatch(url, aspectRatio, image.cropAspect, true)
          updateImage(image.id, {
            ...withoutCanvasPlacement(patch),
            url,
            name: title,
            x: image.x,
            y: image.y,
            width: image.width,
            height: image.height,
          })
          closeReplaceTarget()
        } else {
          const { duration, width, height } = await resolveVideoMetadata(url)
          const windowDuration = image.duration
          let playbackSpeed = 1
          let speedStart = 1
          let speedEnd = 1
          let sourceWindowDuration = windowDuration

          if (duration < windowDuration) {
            playbackSpeed = duration / windowDuration
            speedStart = playbackSpeed
            speedEnd = playbackSpeed
            sourceWindowDuration = duration
          }

          const aspectRatio = FIXED_ASPECT_RATIO
          const patch = await resolveVideoPatch(new VideoClass(generateId('v'), '', url), url, aspectRatio, image.cropAspect, false)

          if (duration === sourceWindowDuration) {
            const videoInstance = new VideoClass(
              generateId('video'),
              title,
              url,
              windowDuration,
              image.startTime,
              new Date(),
              new Date(),
              duration,
              0,
              0,
              undefined,
              !image.isMainTrack,
              image.x,
              image.y,
              image.width,
              image.height,
              image.opacity,
              image.animation,
              image.transition,
              image.zoomIntensity,
              image.transitionDuration,
              image.animationDuration,
              undefined,
              undefined,
              undefined,
              image.transitionSlideEasing,
              image.transitionCircleEasing,
              image.row,
              true,
              patch.cropAspect ?? image.cropAspect,
              patch.cropSx ?? image.cropSx,
              patch.cropSy ?? image.cropSy,
              patch.cropSw ?? image.cropSw,
              patch.cropSh ?? image.cropSh,
              undefined,
              undefined,
              undefined,
              playbackSpeed,
              speedStart,
              speedEnd
            )
            replaceImageWithVideo(targetId, videoInstance)
            closeReplaceTarget()
          } else {
            setReplaceVideoData({
              targetId,
              targetType: 'image',
              url,
              title,
              duration,
              width,
              height,
              windowDuration,
              playbackSpeed,
              speedStart,
              speedEnd,
              initialTrimStart: 0,
              projectStartTime: image.startTime,
            })
          }
        }
      } else if (video) {
        if (sourceKind === 'image') {
          const aspectRatio = FIXED_ASPECT_RATIO
          const patch = await resolveImagePatch(url, aspectRatio, video.cropAspect, false)

          const imageInstance = new ImageClass(
            generateId('image'),
            title,
            url,
            video.timestamp,
            video.timestamp + (video.duration ?? 5),
            video.x,
            video.y,
            video.width,
            video.height,
            video.opacity,
            new Date(),
            !video.isOverlay,
            video.animation,
            video.transition,
            patch.cropAspect ?? video.cropAspect,
            patch.cropSx ?? video.cropSx,
            patch.cropSy ?? video.cropSy,
            patch.cropSw ?? video.cropSw,
            patch.cropSh ?? video.cropSh,
            video.zoomIntensity,
            video.transitionDuration,
            video.animationDuration,
            undefined,
            undefined,
            undefined,
            video.transitionSlideEasing,
            video.transitionCircleEasing,
            video.row
          )
          replaceVideoWithImage(targetId, imageInstance)
          closeReplaceTarget()
        } else {
          const { duration, width, height } = await resolveVideoMetadata(url)
          const storeInner = useManifestStore.getState()
          const v = storeInner.videos.find((x) => x.id === targetId) ?? video
          if (!v) {
            return
          }
          const windowDuration = v.duration ?? 5
          const pending = storeInner.pendingVideoReplaceSpeed
          const pendingForClip = pending && pending.videoId === targetId ? pending : null
          if (pendingForClip) {
            storeInner.setPendingVideoReplaceSpeed(null)
          }
          let playbackSpeed = pendingForClip ? pendingForClip.playbackSpeed : (v.playbackSpeed ?? 1)
          let speedStart = pendingForClip ? pendingForClip.speedStart : (v.speedStart ?? playbackSpeed)
          let speedEnd = pendingForClip ? pendingForClip.speedEnd : (v.speedEnd ?? playbackSpeed)
          const clipSpeedEasing = pendingForClip ? pendingForClip.speedEasing : (v.speedEasing ?? 'linear')
          const normalized = normalizeClipSpeedWindow(
            windowDuration,
            duration,
            playbackSpeed,
            speedStart,
            speedEnd,
            clipSpeedEasing
          )
          playbackSpeed = normalized.playbackSpeed
          speedStart = normalized.speedStart
          speedEnd = normalized.speedEnd
          const sourceWindowDuration = normalized.sourceWindowDuration

          if (duration === sourceWindowDuration) {
            const aspectRatio = FIXED_ASPECT_RATIO
            const patch = await resolveVideoPatch(v.copy({ url }), url, aspectRatio, v.cropAspect, false)
            const ps = playbackSpeed
            const ss = speedStart ?? ps
            const se = speedEnd ?? ps
            const span = duration
            const timelineDur = windowDuration
            runHistoryTransaction((historyStore) => {
              historyStore.updateVideo(targetId, {
                ...withoutCanvasPlacement(patch),
                url,
                title,
                originalDuration: duration,
                trimStart: 0,
                trimEnd: 0,
                duration: timelineDur,
                sourceDuration: span,
                playbackSpeed: ps,
                speedStart: ss,
                speedEnd: se,
                speedEasing: clipSpeedEasing,
                muted: true,
                x: v.x,
                y: v.y,
                width: v.width,
                height: v.height,
              })
            })
            closeReplaceTarget()
          } else {
            setReplaceVideoData({
              targetId,
              targetType: 'video',
              url,
              title,
              duration,
              width,
              height,
              windowDuration,
              playbackSpeed,
              speedStart,
              speedEnd,
              speedEasing: clipSpeedEasing,
              initialTrimStart: 0,
              projectStartTime: v.timestamp,
            })
          }
        }
      }
    },
    [
      replaceImageWithVideo,
      replaceVideoWithImage,
      closeReplaceTarget,
    ]
  )

  const handleReplaceSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file || !replaceTargetId) return

      const isImage = file.type.startsWith('image/')
      const isVideo = file.type.startsWith('video/')
      if (!isImage && !isVideo) {
        e.target.value = ''
        return
      }

      const url = getOrCreateObjectURLForFile(file)
      const title = file.name
      if (isImage) void uploadReplacementToLibrary(file)
      if (isVideo) {
        const { duration } = await resolveVideoMetadata(url)
        void uploadReplacementToLibrary(file, duration)
      }

      await applyReplaceFromUrl(replaceTargetId, url, title, isVideo ? 'video' : 'image')
      e.target.value = ''
    },
    [replaceTargetId, uploadReplacementToLibrary, applyReplaceFromUrl]
  )

  const handleConfirmReplaceVideo = useCallback(
    async (trimStart: number) => {
      if (!replaceVideoData) return
      setIsReplacingClip(true)

      try {
        const W = replaceVideoData.windowDuration
        const ps0 = replaceVideoData.playbackSpeed ?? 1
        const ss0 = replaceVideoData.speedStart ?? ps0
        const se0 = replaceVideoData.speedEnd ?? ps0
        const easing0 = replaceVideoData.speedEasing ?? 'linear'
        const sourceWindowDuration = timelineClipSourceSpanSeconds(W, ps0, ss0, se0, easing0)
        let finalUrl = replaceVideoData.url
        let finalTrimStart = trimStart
        let finalTrimEnd = Math.max(0, replaceVideoData.duration - (trimStart + sourceWindowDuration))
        let finalOriginalDuration = replaceVideoData.duration

        const originalSourceUrl = replaceVideoData.url
        let sourceUrl: string | undefined = undefined
        let sourceTrimStart: number | undefined = undefined
        let sourceDuration: number | undefined = undefined

        if (replaceVideoData.duration > 60) {
          try {
            const clipBlob = await extractVideoClip(replaceVideoData.url, trimStart, sourceWindowDuration)
            finalUrl = URL.createObjectURL(clipBlob)
            finalTrimStart = 0
            finalTrimEnd = 0
            finalOriginalDuration = sourceWindowDuration

            sourceUrl = originalSourceUrl
            sourceTrimStart = trimStart
            sourceDuration = replaceVideoData.duration
          } catch (err) {
            console.error('Failed to extract clip:', err)
            alert('Failed to process video clip. Using original source instead.')
          }
        }

        if (replaceVideoData.targetType === 'image') {
          const image = images.find((img) => img.id === replaceVideoData.targetId)
          if (!image) return

          const aspectRatio = FIXED_ASPECT_RATIO
          const patch = await resolveVideoPatch(
            new VideoClass(generateId('v'), '', finalUrl),
            finalUrl,
            aspectRatio,
            image.cropAspect,
            false
          )

          const videoInstance = new VideoClass(
            generateId('video'),
            replaceVideoData.title,
            finalUrl,
            replaceVideoData.windowDuration,
            image.startTime,
            new Date(),
            new Date(),
            finalOriginalDuration,
            finalTrimStart,
            finalTrimEnd,
            undefined,
            !image.isMainTrack,
            image.x,
            image.y,
            image.width,
            image.height,
            image.opacity,
            image.animation,
            image.transition,
            image.zoomIntensity,
            image.transitionDuration,
            image.animationDuration,
            undefined,
            undefined,
            undefined,
            image.transitionSlideEasing,
            image.transitionCircleEasing,
            image.row,
            true,
            patch.cropAspect ?? image.cropAspect,
            patch.cropSx ?? image.cropSx,
            patch.cropSy ?? image.cropSy,
            patch.cropSw ?? image.cropSw,
            patch.cropSh ?? image.cropSh,
            sourceUrl,
            sourceTrimStart,
            sourceDuration,
            replaceVideoData.playbackSpeed,
            replaceVideoData.speedStart,
            replaceVideoData.speedEnd,
            replaceVideoData.speedEasing
          )
          replaceImageWithVideo(replaceVideoData.targetId, videoInstance)
        } else {
          const video = videos.find((v) => v.id === replaceVideoData.targetId)
          if (!video) return

          const aspectRatio = FIXED_ASPECT_RATIO
          const patch = await resolveVideoPatch(video.copy({ url: finalUrl }), finalUrl, aspectRatio, video.cropAspect, false)

          const ps = replaceVideoData.playbackSpeed ?? 1
          const ss = replaceVideoData.speedStart ?? ps
          const se = replaceVideoData.speedEnd ?? ps
          const spanForClip = finalOriginalDuration - finalTrimStart - finalTrimEnd
          runHistoryTransaction((store) => {
            store.updateVideo(video.id, {
              ...withoutCanvasPlacement(patch),
              url: finalUrl,
              title: replaceVideoData.title,
              originalDuration: finalOriginalDuration,
              trimStart: finalTrimStart,
              trimEnd: finalTrimEnd,
              duration: W,
              sourceDuration: spanForClip,
              playbackSpeed: ps,
              speedStart: ss,
              speedEnd: se,
              speedEasing: replaceVideoData.speedEasing ?? 'linear',
              sourceUrl,
              sourceTrimStart,
              muted: true,
              x: video.x,
              y: video.y,
              width: video.width,
              height: video.height,
            })
          })
        }
        clearReplaceFlow()
      } finally {
        setIsReplacingClip(false)
      }
    },
    [replaceVideoData, images, videos, replaceImageWithVideo, clearReplaceFlow]
  )

  const handleVideoDoubleClick = useCallback((videoId: string) => {
    const video = videos.find((v) => v.id === videoId)
    if (!video || (!video.url && !video.sourceUrl)) return
    const sourceUrl = video.sourceUrl || video.url
    const originalDuration = video.sourceDuration ?? video.originalDuration ?? video.duration ?? 0
    const initialTrimStart = video.sourceTrimStart ?? video.trimStart
    if (originalDuration <= (video.duration ?? 0)) return
    setReplaceVideoData({
      targetId: videoId,
      targetType: 'video',
      url: sourceUrl!,
      title: video.title,
      duration: originalDuration,
      width: video.width,
      height: video.height,
      windowDuration: video.duration!,
      playbackSpeed: video.playbackSpeed ?? 1,
      speedStart: video.speedStart ?? video.playbackSpeed ?? 1,
      speedEnd: video.speedEnd ?? video.playbackSpeed ?? 1,
      speedEasing: video.speedEasing,
      initialTrimStart: initialTrimStart,
      projectStartTime: video.timestamp,
    })
  }, [videos])

  return {
    replaceTargetId,
    setReplaceTargetId,
    replaceVideoData,
    setReplaceVideoData,
    isReplacingClip,
    handleReplaceSelect,
    applyReplaceFromUrl,
    handleConfirmReplaceVideo,
    handleVideoDoubleClick,
  }
}
