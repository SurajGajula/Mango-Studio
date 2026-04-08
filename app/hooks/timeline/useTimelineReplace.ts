import { useState, useCallback } from 'react'
import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { resolveVideoMetadata, computeCropForAspect, computeCanvasCropPlacement, ASPECT_RATIOS, computeVideoCropForAspect, withoutCanvasPlacement } from '@/app/lib/mediaUtils'
import { extractVideoClip } from '@/app/lib/videoExporter'
import { timelineClipSourceSpanSeconds } from '@/app/lib/renderUtils'
import { useManifestStore } from '@/app/stores/manifestStore'
import { generateId } from '@/app/lib/idUtils'
import { getOrCreateObjectURLForFile } from '@/app/lib/fileObjectUrlCache'

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

  const handleReplaceSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !replaceTargetId) return

    const image = images.find((img) => img.id === replaceTargetId)
    const video =
      useManifestStore.getState().videos.find((v) => v.id === replaceTargetId) ??
      videos.find((v) => v.id === replaceTargetId)
    
    if (image) {
      if (file.type.startsWith('image/')) {
        const newUrl = getOrCreateObjectURLForFile(file)
        const newName = file.name
        
        const { aspectRatio, updateImage } = useManifestStore.getState()
        if (image.cropAspect) {
          const ratio = ASPECT_RATIOS[image.cropAspect]
          if (ratio) {
            const tempImage = new ImageClass('tmp', '', newUrl, 0, 1)
            const patch = await computeCropForAspect(tempImage, aspectRatio, ratio[0], ratio[1], image.cropAspect)
            updateImage(image.id, {
              ...withoutCanvasPlacement(patch),
              url: newUrl,
              name: newName,
              x: image.x,
              y: image.y,
              width: image.width,
              height: image.height,
            })
          } else {
            const patch = await computeCanvasCropPlacement(newUrl, 'image', aspectRatio)
            updateImage(image.id, {
              ...withoutCanvasPlacement(patch),
              url: newUrl,
              name: newName,
              x: image.x,
              y: image.y,
              width: image.width,
              height: image.height,
            })
          }
        } else {
          const patch = await computeCanvasCropPlacement(newUrl, 'image', aspectRatio)
          updateImage(image.id, {
            ...withoutCanvasPlacement(patch),
            url: newUrl,
            name: newName,
            x: image.x,
            y: image.y,
            width: image.width,
            height: image.height,
          })
        }
        setReplaceTargetId(null)
      } else if (file.type.startsWith('video/')) {
        const url = getOrCreateObjectURLForFile(file)
        const { duration, width, height } = await resolveVideoMetadata(url)
        const windowDuration = image.duration
        let playbackSpeed = 1
        let speedStart = 1
        let speedEnd = 1
        let sourceWindowDuration = windowDuration

        if (duration < windowDuration) {
          // Instead of blocking, we slow down the video to fit the window
          playbackSpeed = duration / windowDuration
          speedStart = playbackSpeed
          speedEnd = playbackSpeed
          sourceWindowDuration = duration
        }

        const { aspectRatio } = useManifestStore.getState()
        let patch: Partial<VideoClass> = {}
        if (image.cropAspect) {
          const ratio = ASPECT_RATIOS[image.cropAspect]
          if (ratio) {
            patch = await computeVideoCropForAspect(new VideoClass(generateId('v'), '', url), aspectRatio, ratio[0], ratio[1], image.cropAspect)
          }
        } else {
          patch = await computeCanvasCropPlacement(url, 'video', aspectRatio)
        }

        if (duration === sourceWindowDuration) {
          const videoInstance = new VideoClass(
            generateId('video'),
            file.name,
            url,
            windowDuration,
            image.startTime,
            new Date(),
            new Date(),
            duration,
            0, 0,
            undefined,
            !image.isMainTrack,
            image.x, image.y, image.width, image.height,
            image.opacity,
            image.animation,
            image.transition,
            image.zoomIntensity,
            image.transitionDuration,
            image.animationDuration,
            undefined, undefined, undefined,
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
            playbackSpeed,
            speedStart,
            speedEnd,
            initialTrimStart: 0,
            projectStartTime: image.startTime,
          })
        }
      }
    } else if (video) {
      if (file.type.startsWith('image/')) {
        const url = getOrCreateObjectURLForFile(file)
        const { aspectRatio } = useManifestStore.getState()
        let patch: Partial<ImageClass> = {}
        if (video.cropAspect) {
          const ratio = ASPECT_RATIOS[video.cropAspect]
          if (ratio) {
            patch = await computeCropForAspect(new ImageClass('tmp', '', url, 0, 1), aspectRatio, ratio[0], ratio[1], video.cropAspect)
          }
        } else {
          patch = await computeCanvasCropPlacement(url, 'image', aspectRatio)
        }

        const imageInstance = new ImageClass(
          generateId('image'),
          file.name,
          url,
          video.timestamp,
          video.timestamp + (video.duration ?? 5),
          video.x, video.y, video.width, video.height,
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
          undefined, undefined, undefined,
          video.row
        )
        replaceVideoWithImage(replaceTargetId, imageInstance)
        setReplaceTargetId(null)
      } else if (file.type.startsWith('video/')) {
        const url = getOrCreateObjectURLForFile(file)
        const { duration, width, height } = await resolveVideoMetadata(url)
        const store = useManifestStore.getState()
        const v =
          store.videos.find((x) => x.id === replaceTargetId) ?? video
        if (!v) {
          e.target.value = ''
          return
        }
        const windowDuration = v.duration ?? 5
        const pending = store.pendingVideoReplaceSpeed
        const pendingForClip =
          pending && pending.videoId === replaceTargetId ? pending : null
        if (pendingForClip) {
          store.setPendingVideoReplaceSpeed(null)
        }
        let playbackSpeed = pendingForClip
          ? pendingForClip.playbackSpeed
          : (v.playbackSpeed ?? 1)
        let speedStart = pendingForClip
          ? pendingForClip.speedStart
          : (v.speedStart ?? playbackSpeed)
        let speedEnd = pendingForClip
          ? pendingForClip.speedEnd
          : (v.speedEnd ?? playbackSpeed)
        const clipSpeedEasing = pendingForClip
          ? pendingForClip.speedEasing
          : (v.speedEasing ?? 'linear')
        let sourceWindowDuration = timelineClipSourceSpanSeconds(
          windowDuration,
          playbackSpeed,
          speedStart,
          speedEnd,
          clipSpeedEasing
        )

        if (duration < sourceWindowDuration) {
          const scale = duration / sourceWindowDuration
          playbackSpeed = playbackSpeed * scale
          speedStart = speedStart * scale
          speedEnd = speedEnd * scale
          sourceWindowDuration = duration
        }

        if (duration === sourceWindowDuration) {
          const { aspectRatio } = store
          let patch: Partial<VideoClass> = {}
          if (v.cropAspect) {
            const ratio = ASPECT_RATIOS[v.cropAspect]
            if (ratio) {
              patch = await computeVideoCropForAspect(v.copy({ url }), aspectRatio, ratio[0], ratio[1], v.cropAspect)
            }
          } else {
            patch = await computeCanvasCropPlacement(url, 'video', aspectRatio)
          }
          const ps = playbackSpeed
          const ss = speedStart ?? ps
          const se = speedEnd ?? ps
          const span = duration
          const timelineDur = windowDuration
          store.pauseHistory()
          store.updateVideo(replaceTargetId, {
            ...withoutCanvasPlacement(patch),
            url,
            title: file.name,
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
          store.resumeHistory()
          store.pushHistory()
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

    e.target.value = ''
  }, [replaceTargetId, images, videos, replaceImageWithVideo, replaceVideoWithImage])

  const handleConfirmReplaceVideo = useCallback(async (trimStart: number) => {
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
          const clipBlob = await extractVideoClip(
            replaceVideoData.url,
            trimStart,
            sourceWindowDuration,
          )
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

        const { aspectRatio } = useManifestStore.getState()
        let patch: Partial<VideoClass> = {}
        if (image.cropAspect) {
          const ratio = ASPECT_RATIOS[image.cropAspect]
          if (ratio) {
            patch = await computeVideoCropForAspect(new VideoClass(generateId('v'), '', finalUrl), aspectRatio, ratio[0], ratio[1], image.cropAspect)
          }
        } else {
          patch = await computeCanvasCropPlacement(finalUrl, 'video', aspectRatio)
        }

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
          image.x, image.y, image.width, image.height,
          image.opacity,
          image.animation,
          image.transition,
          image.zoomIntensity,
          image.transitionDuration,
          image.animationDuration,
          undefined, undefined, undefined,
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

        const { aspectRatio } = useManifestStore.getState()
        let patch: Partial<VideoClass> = {}
        if (video.cropAspect) {
          const ratio = ASPECT_RATIOS[video.cropAspect]
          if (ratio) {
            patch = await computeVideoCropForAspect(video.copy({ url: finalUrl }), aspectRatio, ratio[0], ratio[1], video.cropAspect)
          }
        } else {
          patch = await computeCanvasCropPlacement(finalUrl, 'video', aspectRatio)
        }

        const store = useManifestStore.getState()
        const ps = replaceVideoData.playbackSpeed ?? 1
        const ss = replaceVideoData.speedStart ?? ps
        const se = replaceVideoData.speedEnd ?? ps
        const spanForClip = finalOriginalDuration - finalTrimStart - finalTrimEnd
        store.pauseHistory()
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
        store.resumeHistory()
        store.pushHistory()
      }
      setReplaceVideoData(null)
      setReplaceTargetId(null)
    } finally {
      setIsReplacingClip(false)
    }
  }, [replaceVideoData, images, videos, replaceImageWithVideo])

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
      projectStartTime: video.timestamp
    })
  }, [videos])

  return { replaceTargetId, setReplaceTargetId, replaceVideoData, setReplaceVideoData, isReplacingClip, handleReplaceSelect, handleConfirmReplaceVideo, handleVideoDoubleClick }
}
