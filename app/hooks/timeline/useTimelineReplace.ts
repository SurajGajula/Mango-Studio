import { useState, useCallback } from 'react'
import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { AudioClass } from '@/app/models/AudioClass'
import { computeMediaCropForAspect, resolveVideoMetadata } from '@/app/lib/mediaUtils'
import { extractVideoClip } from '@/app/lib/videoExporter'
import { calculateSourceTime, timelineClipSourceSpanSeconds } from '@/app/lib/renderUtils'
import { useManifestStore } from '@/app/stores/manifestStore'
import { generateId } from '@/app/lib/idUtils'
import { getOrCreateObjectURLForFile } from '@/app/lib/fileObjectUrlCache'
import { FIXED_ASPECT_RATIO } from '@/app/lib/aspectRatio'
import { resolveTimelineFullMediaFromLibrary } from '@/app/lib/accountMediaLibraryMatch'
import { isPlaybackFetchableUrl } from '@/app/lib/persistedMediaRefs'
import { resolveAudioDurationFromUrl } from '@/app/lib/timelineMediaInsert'
import {
  accountMediaAssetPlaybackUrl,
  imageCropOverlayFromPatch,
  normalizeClipSpeedWindow,
  replacePlacementDimensions,
  resolveImagePatch,
  resolveVideoPatch,
  runHistoryTransaction,
  uploadToAccountLibrary,
  videoCropOverlayFromPatch,
} from '@/app/lib/timeline'

interface UseTimelineReplaceProps {
  videos: VideoClass[]
  images: ImageClass[]
  audios: AudioClass[]
  replaceImageWithVideo: (id: string, video: VideoClass) => void
  replaceVideoWithImage: (id: string, image: ImageClass) => void
}

export function useTimelineReplace({
  videos,
  images,
  audios,
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
    projectStartTime: number
  } | null>(null)
  const [isReplacingClip, setIsReplacingClip] = useState(false)

  const closeReplaceTarget = useCallback(() => {
    setReplaceTargetId(null)
  }, [])

  const clearReplaceFlow = useCallback(() => {
    setReplaceVideoData(null)
    setReplaceTargetId(null)
  }, [])

  const applyReplaceFromUrl = useCallback(
    async (targetId: string, url: string, title: string, sourceKind: 'image' | 'video') => {
      const store = useManifestStore.getState()
      const image = store.images.find((img) => img.id === targetId)
      const video = store.videos.find((v) => v.id === targetId)

      if (image) {
        if (sourceKind === 'image') {
          const aspectRatio = FIXED_ASPECT_RATIO
          const placeForCrop = replacePlacementDimensions(image, aspectRatio)
          let patch: Partial<ImageClass> = await resolveImagePatch(url, aspectRatio, image.cropAspect, true, {
            width: placeForCrop.width,
            height: placeForCrop.height,
          })
          const sw = patch.cropSw
          const sh = patch.cropSh
          if (!(typeof sw === 'number' && typeof sh === 'number' && sw > 1e-6 && sh > 1e-6)) {
            patch = (await computeMediaCropForAspect(
              url,
              'image',
              aspectRatio,
              placeForCrop.width,
              placeForCrop.height,
              image.cropAspect ?? aspectRatio
            )) as Partial<ImageClass>
          }
          runHistoryTransaction((historyStore) => {
            const live = historyStore.images.find((i) => i.id === image.id)
            if (!live) return
            const place = replacePlacementDimensions(live, aspectRatio)
            historyStore.updateImage(image.id, {
              url,
              name: title,
              x: place.x,
              y: place.y,
              width: place.width,
              height: place.height,
              ...imageCropOverlayFromPatch(patch, live),
              keyframes: [],
            })
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
          const patch = await resolveVideoPatch(new VideoClass(generateId('v'), '', url), url, aspectRatio, image.cropAspect, false, {
            width: image.width,
            height: image.height,
          })

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
              image.animationZoomEasing,
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
          const patch = await resolveImagePatch(url, aspectRatio, video.cropAspect, false, {
            width: video.width,
            height: video.height,
          })

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
            video.animationZoomEasing,
            undefined,
            undefined,
            undefined,
            video.transitionSlideEasing,
            video.transitionCircleEasing,
            video.row,
            undefined,
            undefined,
            undefined,
            undefined
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
            const patch = await resolveVideoPatch(v.copy({ url }), url, aspectRatio, v.cropAspect, false, {
              width: v.width,
              height: v.height,
            })
            const ps = playbackSpeed
            const ss = speedStart ?? ps
            const se = speedEnd ?? ps
            const span = duration
            const timelineDur = windowDuration
            runHistoryTransaction((historyStore) => {
              historyStore.updateVideo(targetId, {
                ...videoCropOverlayFromPatch(patch, v),
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

      const blobUrl = getOrCreateObjectURLForFile(file)
      const title = file.name
      let applyUrl = blobUrl
      if (isImage) {
        void uploadToAccountLibrary(file)
      } else if (isVideo) {
        const { duration } = await resolveVideoMetadata(blobUrl)
        const assetId = await uploadToAccountLibrary(file, duration)
        if (assetId) applyUrl = accountMediaAssetPlaybackUrl(assetId)
      }

      await applyReplaceFromUrl(replaceTargetId, applyUrl, title, isVideo ? 'video' : 'image')
      e.target.value = ''
    },
    [replaceTargetId, applyReplaceFromUrl]
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
            false,
            { width: image.width, height: image.height }
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
            image.animationZoomEasing,
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
          const patch = await resolveVideoPatch(video.copy({ url: finalUrl }), finalUrl, aspectRatio, video.cropAspect, false, {
            width: video.width,
            height: video.height,
          })

          const ps = replaceVideoData.playbackSpeed ?? 1
          const ss = replaceVideoData.speedStart ?? ps
          const se = replaceVideoData.speedEnd ?? ps
          const spanForClip = finalOriginalDuration - finalTrimStart - finalTrimEnd
          runHistoryTransaction((store) => {
            store.updateVideo(video.id, {
              ...videoCropOverlayFromPatch(patch, video),
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

  const [audioReplaceTargetId, setAudioReplaceTargetId] = useState<string | null>(null)
  const [replaceAudioData, setReplaceAudioData] = useState<{
    targetId: string
    url: string
    title: string
    duration: number
    windowDuration: number
    trimEnd: number
    playbackSpeed: number
    speedStart?: number
    speedEnd?: number
    speedEasing?: 'linear' | 'ease'
    pitch: number
    initialTrimStart: number
  } | null>(null)

  const applyReplaceAudioFromUrl = useCallback(async (targetId: string, url: string, title: string) => {
    const newDuration = await resolveAudioDurationFromUrl(url)
    const store = useManifestStore.getState()
    const oldAudio = store.audios.find((a) => a.id === targetId)
    if (!oldAudio) return

    const oldTimelineDuration = oldAudio.endTime - oldAudio.startTime
    const newEndTime = newDuration >= oldTimelineDuration
      ? oldAudio.endTime
      : oldAudio.startTime + newDuration
    const newTrimEnd = newDuration >= oldTimelineDuration
      ? newDuration - oldTimelineDuration
      : 0

    runHistoryTransaction((historyStore) => {
      historyStore.updateAudio(targetId, {
        url,
        name: title,
        originalDuration: newDuration,
        trimStart: 0,
        trimEnd: newTrimEnd,
        startTime: oldAudio.startTime,
        endTime: newEndTime,
        marks: [],
      })
    })
  }, [])

  const handleAudioReplaceSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file || !audioReplaceTargetId) return

      if (!file.type.startsWith('audio/')) {
        e.target.value = ''
        return
      }

      const blobUrl = getOrCreateObjectURLForFile(file)
      const title = file.name
      const newDuration = await resolveAudioDurationFromUrl(blobUrl)
      const assetId = await uploadToAccountLibrary(file, newDuration)
      const applyUrl = assetId ? accountMediaAssetPlaybackUrl(assetId) : blobUrl

      await applyReplaceAudioFromUrl(audioReplaceTargetId, applyUrl, title)
      setAudioReplaceTargetId(null)
      e.target.value = ''
    },
    [audioReplaceTargetId, applyReplaceAudioFromUrl]
  )

  const clearReplaceAudioFlow = useCallback(() => {
    setReplaceAudioData(null)
  }, [])

  const handleConfirmAudioTrim = useCallback(
    (newTrimStart: number) => {
      if (!replaceAudioData) return
      const store = useManifestStore.getState()
      const audio = store.audios.find((a) => a.id === replaceAudioData.targetId)
      if (!audio) return

      const ps = audio.playbackSpeed ?? 1
      const ss = audio.speedStart ?? ps
      const se = audio.speedEnd ?? ps
      const windowDuration = audio.endTime - audio.startTime
      const sourceWindowDuration = calculateSourceTime(
        windowDuration,
        windowDuration,
        ss,
        se,
        ps,
        audio.speedEasing ?? 'linear'
      )
      const sourceDuration = replaceAudioData.duration
      const newTrimEnd = Math.max(0, sourceDuration - newTrimStart - sourceWindowDuration)

      runHistoryTransaction((historyStore) => {
        historyStore.updateAudio(audio.id, {
          trimStart: newTrimStart,
          trimEnd: newTrimEnd,
          ...(replaceAudioData.url !== audio.url
            ? { url: replaceAudioData.url, originalDuration: sourceDuration }
            : {}),
        })
      })
      clearReplaceAudioFlow()
    },
    [replaceAudioData, clearReplaceAudioFlow]
  )

  const handleAudioDoubleClick = useCallback(async (audioId: string) => {
    const audio = useManifestStore.getState().audios.find((a) => a.id === audioId)
    if (!audio) return

    const windowDuration = audio.endTime - audio.startTime
    if (!(windowDuration > 0)) return

    const ps = audio.playbackSpeed ?? 1
    const ss = audio.speedStart ?? ps
    const se = audio.speedEnd ?? ps
    const pitch = audio.pitch ?? 1
    const sourceWindowDuration = calculateSourceTime(
      windowDuration,
      windowDuration,
      ss,
      se,
      ps,
      audio.speedEasing ?? 'linear'
    )

    let url = audio.url
    let originalDuration = audio.originalDuration
    const trimEnd = audio.trimEnd

    try {
      const library = await resolveTimelineFullMediaFromLibrary(audio.name, 'audio', undefined, audio.url)
      if (library) {
        url = library.url
        originalDuration = Math.max(originalDuration, library.duration)
      }
    } catch (err) {
      console.error(err)
    }

    if (url && isPlaybackFetchableUrl(url) && originalDuration <= sourceWindowDuration + 0.001) {
      try {
        const probed = await resolveAudioDurationFromUrl(url)
        originalDuration = Math.max(originalDuration, probed)
      } catch (err) {
        console.error(err)
      }
    }

    if (!url || !isPlaybackFetchableUrl(url)) return
    if (originalDuration <= sourceWindowDuration + 0.001) return

    setReplaceAudioData({
      targetId: audioId,
      url,
      title: audio.name,
      duration: originalDuration,
      windowDuration,
      trimEnd,
      playbackSpeed: ps,
      speedStart: ss,
      speedEnd: se,
      speedEasing: audio.speedEasing,
      pitch,
      initialTrimStart: audio.trimStart,
    })
  }, [])

  const handleVideoDoubleClick = useCallback(async (videoId: string) => {
    const video = videos.find((v) => v.id === videoId)
    if (!video) return

    const windowDuration = video.duration ?? 0
    const initialTrimStart = video.sourceTrimStart ?? video.trimStart ?? 0

    let sourceUrl = video.sourceUrl || video.url
    let originalDuration = video.sourceDuration ?? video.originalDuration ?? video.duration ?? 0
    const shouldResolveFromLibrary =
      !isPlaybackFetchableUrl(sourceUrl) || originalDuration <= windowDuration + 0.001

    if (shouldResolveFromLibrary) {
      const library = await resolveTimelineFullMediaFromLibrary(video.title, 'video')
      if (library) {
        sourceUrl = library.url
        if (library.duration > originalDuration) {
          originalDuration = library.duration
        }
        runHistoryTransaction((historyStore) => {
          historyStore.updateVideo(videoId, {
            sourceUrl: library.url,
            sourceDuration: library.duration,
            originalDuration: Math.max(video.originalDuration ?? 0, library.duration),
            ...(isPlaybackFetchableUrl(video.url) ? {} : { url: library.url }),
          })
        })
      }
    }

    if (!sourceUrl || !isPlaybackFetchableUrl(sourceUrl)) return
    if (originalDuration <= windowDuration + 0.001) return

    setReplaceVideoData({
      targetId: videoId,
      targetType: 'video',
      url: sourceUrl,
      title: video.title,
      duration: originalDuration,
      width: video.width,
      height: video.height,
      windowDuration,
      playbackSpeed: video.playbackSpeed ?? 1,
      speedStart: video.speedStart ?? video.playbackSpeed ?? 1,
      speedEnd: video.speedEnd ?? video.playbackSpeed ?? 1,
      speedEasing: video.speedEasing,
      initialTrimStart,
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
    audioReplaceTargetId,
    setAudioReplaceTargetId,
    handleAudioReplaceSelect,
    applyReplaceAudioFromUrl,
    replaceAudioData,
    setReplaceAudioData,
    handleAudioDoubleClick,
    handleConfirmAudioTrim,
    clearReplaceAudioFlow,
  }
}
