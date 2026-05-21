'use client'

import { useState, useRef, useEffect } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import type {
  ManifestMutation,
  SplitInstruction,
  ReplaceInstruction,
  SolidColorReplaceInstruction,
  AddTextInstruction,
  AddEffectInstruction,
  TransitionInstruction,
  StepGrowthInstruction,
  CropInstruction,
  DeleteTimelineItemInstruction,
  NormalizeAudioVolumesInstruction,
} from '@/app/api/route-prompt/route'
import { TextClass } from '@/app/models/TextClass'
import { EffectClass } from '@/app/models/EffectClass'
import {
  ImageClass,
  AnimationMode,
  TransitionMode,
  inferAnimationZoomEasing,
  migrateAnimationValue,
} from '@/app/models/ImageClass'
import { computeCropForAspect, computeCanvasCropPlacement, ASPECT_RATIOS, computeVideoCropForAspect, computeMediaCropForAspect, getLogicalCanvasDimensions, resolveVideoMetadata } from '@/app/lib/mediaUtils'
import {
  accountMediaAssetPlaybackUrl,
  imageCropOverlayFromPatch,
  replacePlacementDimensions,
  resolveImagePatch,
  runHistoryTransaction,
  uploadToAccountLibrary,
  validateMediaDuration,
} from '@/app/lib/timeline'
import { findFreeVisualOverlayRow } from '@/app/lib/overlayRowUtils'
import { createSolidColorDataUrl } from '@/app/lib/solidColorImage'
import { FIXED_ASPECT_RATIO } from '@/app/lib/aspectRatio'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { AudioClass } from '@/app/models/AudioClass'
import { VideoClass as VideoModel } from '@/app/models/VideoClass'
import { resolveAudioDurationFromUrl } from '@/app/lib/timelineMediaInsert'
import {
  AUDIO_VOLUME_SLIDER_MAX,
  decodeAudioFromUrl,
  rmsFromAudioBufferTrimmed,
} from '@/app/lib/audioLoudnessNormalize'
import styles from './ChatWindow.module.css'

interface Message {
  id: string
  text: string
  isUser: boolean
  loading?: boolean
  timestamp: Date
}

interface UploadedFile {
  id: string
  name: string
  base64: string
  blobUrl: string
  mimeType: string
  mediaType: 'image' | 'audio' | 'video'
}

interface EqualSplitRequest {
  imageNumber: number
  parts: number
}

const AUDIO_RMS_FLOOR = 1e-7

async function runNormalizeAudioVolumes(
  instruction: NormalizeAudioVolumesInstruction,
  audios: AudioClass[],
  updateAudio: (id: string, updates: Partial<AudioClass>) => void
) {
  const sorted = [...audios].sort((a, b) => a.startTime - b.startTime)
  const refN = instruction.referenceAudioNumber
  const targets = [...new Set(instruction.targetAudioNumbers)]
    .filter((n) => n !== refN)
    .sort((a, b) => a - b)
  if (refN < 1 || refN > sorted.length) {
    throw new Error(`Reference audio #${refN} is out of range (1–${sorted.length}).`)
  }
  if (targets.length === 0) {
    throw new Error('No target audios to adjust.')
  }
  for (const n of targets) {
    if (n < 1 || n > sorted.length) {
      throw new Error(`Target audio #${n} is out of range (1–${sorted.length}).`)
    }
  }
  const refAudio = sorted[refN - 1]
  const ctx = new AudioContext()
  try {
    const refBuf = await decodeAudioFromUrl(ctx, refAudio.url)
    const refRms = rmsFromAudioBufferTrimmed(
      refBuf,
      refAudio.trimStart ?? 0,
      refAudio.trimEnd ?? 0,
      refAudio.originalDuration ?? refBuf.duration
    )
    if (refRms < AUDIO_RMS_FLOOR) {
      throw new Error(
        'Reference audio is effectively silent in its trimmed region; cannot match loudness.'
      )
    }
    const refLevel = refRms * (refAudio.volume ?? 1)
    for (const n of targets) {
      const a = sorted[n - 1]
      const buf = await decodeAudioFromUrl(ctx, a.url)
      const rms = rmsFromAudioBufferTrimmed(
        buf,
        a.trimStart ?? 0,
        a.trimEnd ?? 0,
        a.originalDuration ?? buf.duration
      )
      if (rms < AUDIO_RMS_FLOOR) {
        throw new Error(`Audio #${n} is effectively silent in its trimmed region.`)
      }
      let vol = refLevel / rms
      vol = Math.max(0, Math.min(AUDIO_VOLUME_SLIDER_MAX, vol))
      vol = Math.round(vol * 4) / 4
      updateAudio(a.id, { volume: vol })
    }
  } finally {
    await ctx.close()
  }
}

export default function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const updateImage = useManifestStore((state) => state.updateImage)
  const updateVideo = useManifestStore((state) => state.updateVideo)
  const updateText = useManifestStore((state) => state.updateText)
  const updateAudio = useManifestStore((state) => state.updateAudio)
  const trimAudio = useManifestStore((state) => state.trimAudio)
  const splitVideoAtTimes = useManifestStore((state) => state.splitVideoAtTimes)
  const splitImageAtTimes = useManifestStore((state) => state.splitImageAtTimes)
  const replaceVideoWithImage = useManifestStore((state) => state.replaceVideoWithImage)
  const addText = useManifestStore((state) => state.addText)
  const addEffect = useManifestStore((state) => state.addEffect)
  const pauseHistory = useManifestStore((state) => state.pauseHistory)
  const resumeHistory = useManifestStore((state) => state.resumeHistory)
  const pushHistory = useManifestStore((state) => state.pushHistory)
  const pendingPrompt = useManifestStore((state) => state.pendingPrompt)
  const setPendingPrompt = useManifestStore((state) => state.setPendingPrompt)
  const setItemPlaybackSpeed = useManifestStore((state) => state.setItemPlaybackSpeed)
  const removeImage = useManifestStore((state) => state.removeImage)
  const removeVideo = useManifestStore((state) => state.removeVideo)
  const removeText = useManifestStore((state) => state.removeText)
  const removeAudio = useManifestStore((state) => state.removeAudio)
  const removeEffect = useManifestStore((state) => state.removeEffect)
  const addVideo = useManifestStore((state) => state.addVideo)
  const addAudio = useManifestStore((state) => state.addAudio)
  const duplicateTimelineRange = useManifestStore((state) => state.duplicateTimelineRange)
  useEffect(() => {
    if (pendingPrompt) {
      setInputValue(pendingPrompt)
      setPendingPrompt(null)
      textareaRef.current?.focus()
    }
  }, [pendingPrompt, setPendingPrompt])

  const applyMutations = (mutations: ManifestMutation[]) => {
    for (const m of mutations) {
      if (m.type === 'updateImage') {
        const updates: any = { startTime: m.startTime, endTime: m.endTime, row: m.row }
        if (m.duration !== undefined) {
          const image = useManifestStore.getState().images.find((i) => i.id === m.id)
          if (image) {
            updates.endTime = (m.startTime ?? image.startTime) + m.duration
          }
        }
        updateImage(m.id, updates)
      } else if (m.type === 'updateVideo') {
        if (m.speedStart !== undefined || m.speedEnd !== undefined) {
          if (!setItemPlaybackSpeed(m.id, m.playbackSpeed ?? 1, m.speedStart, m.speedEnd, m.speedEasing)) continue
        } else if (m.playbackSpeed !== undefined) {
          if (!setItemPlaybackSpeed(m.id, m.playbackSpeed)) continue
        }
        updateVideo(m.id, { timestamp: m.timestamp, duration: m.duration, muted: m.muted, row: m.row })
      } else if (m.type === 'updateText') {
        updateText(m.id, {
          startTime: m.startTime,
          endTime: m.endTime,
          row: m.row,
          fontFamily: m.fontFamily,
          fontWeight: m.fontWeight,
          animation: m.animation,
          style: m.style,
        })
      }
      else if (m.type === 'updateAudio') {
        if (m.speedStart !== undefined || m.speedEnd !== undefined) {
          setItemPlaybackSpeed(m.id, m.playbackSpeed ?? 1, m.speedStart, m.speedEnd, m.speedEasing)
        } else if (m.playbackSpeed !== undefined) {
          setItemPlaybackSpeed(m.id, m.playbackSpeed)
        }
        const audio = useManifestStore.getState().audios.find((a) => a.id === m.id)
        if (audio) {
          let newTrimStart = m.trimStart ?? audio.trimStart
          let newTrimEnd = m.trimEnd ?? audio.trimEnd
          if (m.endTime !== undefined && m.trimStart === undefined && m.trimEnd === undefined) {
            newTrimEnd = Math.max(0, audio.originalDuration - m.endTime)
          }
          trimAudio(m.id, newTrimStart, newTrimEnd, m.startTime ?? audio.startTime)
          if (m.row !== undefined) {
            updateAudio(m.id, { row: m.row })
          }
        } else if (m.row !== undefined) {
          updateAudio(m.id, { row: m.row })
        }
      }
    }
  }

  const applySplits = (splits: SplitInstruction[]) => {
    for (const s of splits) {
      if (s.type === 'image') splitImageAtTimes(s.id, s.times)
      else if (s.type === 'video') splitVideoAtTimes(s.id, s.times)
    }
  }

  const applyDeleteItems = (items: DeleteTimelineItemInstruction[]) => {
    for (const item of items) {
      if (item.type === 'image') removeImage(item.id)
      else if (item.type === 'video') removeVideo(item.id)
      else if (item.type === 'text') removeText(item.id)
      else if (item.type === 'audio') removeAudio(item.id)
      else if (item.type === 'effect') removeEffect(item.id)
    }
  }

  const applyNewTexts = (newTexts: AddTextInstruction[]) => {
    for (const t of newTexts) {
      const id = `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const row = findFreeVisualOverlayRow(t.startTime, t.endTime)
      addText(new TextClass(id, t.content, t.startTime, t.endTime).copy({ row }))
    }
  }

  const applyNewEffects = (newEffects: AddEffectInstruction[]) => {
    for (const e of newEffects) {
      const row = findFreeVisualOverlayRow(e.startTime, e.endTime)
      addEffect(new EffectClass(
        `effect-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        e.type,
        e.startTime,
        e.endTime,
        row,
        e.intensity ?? 0.5,
        e.contrast ?? 0.5,
        e.flashSpeed ?? 1
      ))
    }
  }

  const applyTransitions = (transitions: TransitionInstruction[]) => {
    const { images, videos } = useManifestStore.getState()
    for (const t of transitions) {
      const updates: any = {}
      if (t.animation !== undefined) {
        const raw = String(t.animation)
        updates.animation = migrateAnimationValue(raw)
        updates.animationZoomEasing = inferAnimationZoomEasing(raw, '', t.animationZoomEasing)
        if (updates.animation === 'slide-shake-left' || updates.animation === 'slide-shake-right') {
          updates.zoomIntensity = 0.1
        }
      }
      if (t.animationZoomEasing === 'slow-fast' || t.animationZoomEasing === 'fast-slow' || t.animationZoomEasing === 'constant') {
        updates.animationZoomEasing = t.animationZoomEasing
      }
      if (t.transition !== undefined) updates.transition = t.transition
      if (t.zoomIntensity !== undefined) updates.zoomIntensity = t.zoomIntensity
      if (t.zoomDistanceIntensity !== undefined) updates.zoomDistanceIntensity = t.zoomDistanceIntensity
      if (t.transitionColor !== undefined) updates.transitionColor = t.transitionColor
      if (t.transitionFlashMode !== undefined) updates.transitionFlashMode = t.transitionFlashMode
      if (t.transitionDirection !== undefined) updates.transitionDirection = t.transitionDirection
      if (t.transitionAxis !== undefined) updates.transitionAxis = t.transitionAxis
      if (t.transitionSlideEasing !== undefined) updates.transitionSlideEasing = t.transitionSlideEasing
      if (t.transitionCircleEasing !== undefined) updates.transitionCircleEasing = t.transitionCircleEasing
      if (t.transitionWipeEasing !== undefined) updates.transitionWipeEasing = t.transitionWipeEasing
      
      const item = t.type === 'image' ? images.find(i => i.id === t.id) : videos.find(v => v.id === t.id)
      
      if (t.transitionDuration !== undefined) {
        updates.transitionDuration = t.transitionDuration
      } else if (t.transition && t.transition !== 'none' && item && (!item.transitionDuration || item.transitionDuration === 0)) {
        updates.transitionDuration = 1.0
      }

      if (t.animationDuration !== undefined) {
        updates.animationDuration = t.animationDuration
      } else if (t.animation && t.animation !== 'none' && item && (!item.animationDuration || item.animationDuration === 0)) {
        updates.animationDuration = 1.0
      }

      if (t.type === 'image') updateImage(t.id, updates)
      else if (t.type === 'video') updateVideo(t.id, updates)
    }
  }

  const applyCrops = async (crops: CropInstruction[]) => {
    const { images, videos } = useManifestStore.getState()
    const aspectRatio = FIXED_ASPECT_RATIO
    for (const c of crops) {
      if (c.type === 'image') {
        const image = images.find((i) => i.id === c.id)
        if (!image) continue
        if (c.cropAspect === 'none') {
          const patch = await computeCanvasCropPlacement(image.url, 'image', aspectRatio)
          updateImage(c.id, patch)
        } else {
          const ratio = ASPECT_RATIOS[c.cropAspect]
          if (!ratio) continue
          const patch = await computeCropForAspect(image, aspectRatio, ratio[0], ratio[1], c.cropAspect)
          updateImage(c.id, patch)
        }
      } else if (c.type === 'video') {
        const video = videos.find((v) => v.id === c.id)
        if (!video) continue
        if (c.cropAspect === 'none') {
          if (!video.url) continue
          const patch = await computeCanvasCropPlacement(video.url, 'video', aspectRatio)
          updateVideo(c.id, patch)
        } else {
          const ratio = ASPECT_RATIOS[c.cropAspect]
          if (!ratio) continue
          const patch = await computeVideoCropForAspect(video, aspectRatio, ratio[0], ratio[1], c.cropAspect)
          updateVideo(c.id, patch)
        }
      }
    }
  }

  const applyStepGrowth = (instructions: StepGrowthInstruction[]) => {
    const pickImage = (instruction: StepGrowthInstruction) => {
      const { images } = useManifestStore.getState()
      if (instruction.target === 'selected') {
        const selectedImageId = useSelectionStore.getState().selectedImageId
        return selectedImageId ? images.find((img) => img.id === selectedImageId) : undefined
      }
      if (instruction.id) {
        return images.find((img) => img.id === instruction.id)
      }
      if (typeof instruction.imageNumber === 'number' && Number.isFinite(instruction.imageNumber)) {
        const sorted = [...images]
          .sort((a, b) => a.startTime - b.startTime)
        return sorted[instruction.imageNumber - 1]
      }
      const selectedImageId = useSelectionStore.getState().selectedImageId
      return selectedImageId ? images.find((img) => img.id === selectedImageId) : undefined
    }

    const approxEqual = (a: number, b: number) => Math.abs(a - b) < 1e-4

    for (const instruction of instructions) {
      const targetImage = pickImage(instruction)
      if (!targetImage) continue
      const steps = Math.max(2, Math.round(instruction.steps ?? 4))
      const duration = targetImage.endTime - targetImage.startTime
      if (!(duration > 0)) continue

      const splitTimes: number[] = []
      for (let i = 1; i < steps; i++) {
        splitTimes.push(targetImage.startTime + (duration * i) / steps)
      }
      splitImageAtTimes(targetImage.id, splitTimes)

      const boundaries = [targetImage.startTime, ...splitTimes, targetImage.endTime]
      const { images } = useManifestStore.getState()
      const segments = boundaries.slice(0, -1).map((segStart, idx) =>
        images.find(
          (img) =>
            img.url === targetImage.url &&
            approxEqual(img.startTime, segStart) &&
            approxEqual(img.endTime, boundaries[idx + 1])
        )
      )

      const centerX = targetImage.x + targetImage.width / 2
      const centerY = targetImage.y + targetImage.height / 2
      const { logicalW, logicalH } = getLogicalCanvasDimensions(FIXED_ASPECT_RATIO)
      const maxScale = Math.min(logicalW / targetImage.width, logicalH / targetImage.height)
      const maxWidth = targetImage.width * maxScale
      const maxHeight = targetImage.height * maxScale

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i]
        if (!segment) continue
        const progress = steps <= 1 ? 1 : i / (steps - 1)
        const width = targetImage.width + (maxWidth - targetImage.width) * progress
        const height = targetImage.height + (maxHeight - targetImage.height) * progress
        updateImage(segment.id, {
          x: centerX - width / 2,
          y: centerY - height / 2,
          width,
          height,
          keyframes: [],
        })
      }
    }
  }

  const applyReplacementWithUrl = async (targetId: string, url: string, name: string) => {
    const { images, videos } = useManifestStore.getState()
    const aspectRatio = FIXED_ASPECT_RATIO
    const originalImage = images.find((i) => i.id === targetId)
    const originalVideo = videos.find((v) => v.id === targetId)

    if (originalImage) {
      const placeForCrop = replacePlacementDimensions(originalImage, aspectRatio)
      let patch: Partial<ImageClass> = await resolveImagePatch(url, aspectRatio, originalImage.cropAspect, true, {
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
          originalImage.cropAspect ?? aspectRatio
        )) as Partial<ImageClass>
      }
      runHistoryTransaction((historyStore) => {
        const live = historyStore.images.find((i) => i.id === targetId)
        if (!live) return
        const place = replacePlacementDimensions(live, aspectRatio)
        historyStore.updateImage(targetId, {
          url,
          name,
          x: place.x,
          y: place.y,
          width: place.width,
          height: place.height,
          ...imageCropOverlayFromPatch(patch, live),
          keyframes: [],
        })
      })
    } else if (originalVideo) {
      const imageId = `image-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const startTime = originalVideo.timestamp
      const endTime = startTime + (originalVideo.duration ?? 0)

      let patch: {
        x?: number
        y?: number
        width?: number
        height?: number
        cropAspect?: string
        cropSx?: number
        cropSy?: number
        cropSw?: number
        cropSh?: number
      }
      if (originalVideo.cropAspect && ASPECT_RATIOS[originalVideo.cropAspect]) {
        const ratio = ASPECT_RATIOS[originalVideo.cropAspect]
        patch = await computeMediaCropForAspect(url, 'image', aspectRatio, ratio[0], ratio[1], originalVideo.cropAspect)
      } else {
        patch = await computeCanvasCropPlacement(url, 'image', aspectRatio)
      }

      const image = new ImageClass(
        imageId,
        name,
        url,
        startTime,
        endTime,
        originalVideo.x,
        originalVideo.y,
        originalVideo.width,
        originalVideo.height,
        1,
        new Date(),
        originalVideo.animation as AnimationMode,
        originalVideo.transition as TransitionMode,
        originalVideo.cropAspect || patch.cropAspect,
        patch.cropSx,
        patch.cropSy,
        patch.cropSw,
        patch.cropSh,
        originalVideo.zoomIntensity,
        originalVideo.transitionDuration,
        originalVideo.animationDuration,
        originalVideo.animationZoomEasing,
        undefined,
        undefined,
        undefined,
        originalVideo.transitionSlideEasing,
        originalVideo.transitionCircleEasing,
        originalVideo.row,
        undefined,
        undefined,
        undefined,
        originalVideo.transitionFlashMode,
        originalVideo.zoomDistanceIntensity
      )

      replaceVideoWithImage(originalVideo.id, image)
    }
  }

  const applyAudioReplacement = async (targetId: string, file: UploadedFile) => {
    const { audios } = useManifestStore.getState()
    const oldAudio = audios.find((a) => a.id === targetId)
    if (!oldAudio) return

    const duration = await resolveAudioDurationFromUrl(file.blobUrl)
    const oldTimelineDuration = oldAudio.endTime - oldAudio.startTime
    const endTime = duration >= oldTimelineDuration
      ? oldAudio.endTime
      : oldAudio.startTime + duration
    const trimEnd = duration >= oldTimelineDuration
      ? duration - oldTimelineDuration
      : 0
    const newId = `audio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const audioInstance = new AudioClass(
      newId,
      file.name,
      file.blobUrl,
      oldAudio.startTime,
      endTime,
      [],
      undefined,
      0,
      trimEnd,
      duration,
      1,
      oldAudio.row,
      oldAudio.volume
    )
    removeAudio(targetId)
    addAudio(audioInstance)
  }

  const applyVideoReplacement = async (targetId: string, file: UploadedFile, sourceUrl: string) => {
    const { videos, images } = useManifestStore.getState()
    const oldVideo = videos.find((v) => v.id === targetId)
    const oldImage = images.find((i) => i.id === targetId)

    if (oldVideo) {
      const { duration } = await resolveVideoMetadata(sourceUrl)
      const aspectRatio = FIXED_ASPECT_RATIO
      const [rw, rh] = ASPECT_RATIOS[aspectRatio]
      const crop = await computeMediaCropForAspect(sourceUrl, 'video', aspectRatio, rw, rh, aspectRatio)
      const newId = `video-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const newVideo = new VideoModel(
        newId,
        file.name,
        sourceUrl,
        duration,
        oldVideo.timestamp,
        undefined,
        undefined,
        undefined,
        0,
        0,
        undefined,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        1,
        oldVideo.animation ?? 'none',
        oldVideo.transition ?? 'none',
        oldVideo.zoomIntensity ?? 0.5,
        oldVideo.transitionDuration ?? 1.0,
        oldVideo.animationDuration ?? 1.0,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        oldVideo.row,
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
      removeVideo(targetId)
      addVideo(newVideo)
    } else if (oldImage) {
      const { duration } = await resolveVideoMetadata(sourceUrl)
      const aspectRatio = FIXED_ASPECT_RATIO
      const [rw, rh] = ASPECT_RATIOS[aspectRatio]
      const crop = await computeMediaCropForAspect(sourceUrl, 'video', aspectRatio, rw, rh, aspectRatio)
      const newId = `video-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const startTime = oldImage.startTime
      const imageDuration = oldImage.endTime - oldImage.startTime
      const row = oldImage.row
      const newVideo = new VideoModel(
        newId,
        file.name,
        sourceUrl,
        Math.min(duration, imageDuration),
        startTime,
        undefined,
        undefined,
        undefined,
        0,
        0,
        undefined,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        1,
        oldImage.animation ?? 'none',
        oldImage.transition ?? 'none',
        oldImage.zoomIntensity ?? 0.5,
        oldImage.transitionDuration ?? 1.0,
        oldImage.animationDuration ?? 1.0,
        undefined,
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
      removeImage(targetId)
      addVideo(newVideo)
    }
  }

  const applyReplacements = async (replacements: ReplaceInstruction[], files: UploadedFile[]) => {
    for (const r of replacements) {
      const file = files[r.fileIndex]
      if (!file) continue

      if (file.mediaType === 'audio') {
        const duration = await resolveAudioDurationFromUrl(file.blobUrl)
        if (validateMediaDuration(duration, 'Audio')) {
          const blob = await fetch(file.blobUrl).then((res) => res.blob())
          const uploadFile = new File([blob], file.name, { type: file.mimeType })
          void uploadToAccountLibrary(uploadFile, duration)
        }
        await applyAudioReplacement(r.targetId, file)
      } else if (file.mediaType === 'video') {
        const { duration } = await resolveVideoMetadata(file.blobUrl)
        let sourceUrl = file.blobUrl
        if (validateMediaDuration(duration, 'Video')) {
          const blob = await fetch(file.blobUrl).then((res) => res.blob())
          const uploadFile = new File([blob], file.name, { type: file.mimeType })
          const assetId = await uploadToAccountLibrary(uploadFile, duration)
          if (assetId) sourceUrl = accountMediaAssetPlaybackUrl(assetId)
        }
        await applyVideoReplacement(r.targetId, file, sourceUrl)
      } else {
        const blob = new Blob(
          [Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0))],
          { type: file.mimeType }
        )
        const uploadFile = new File([blob], file.name, { type: file.mimeType })
        void uploadToAccountLibrary(uploadFile)
        const url = URL.createObjectURL(blob)
        await applyReplacementWithUrl(r.targetId, url, file.name)
      }
    }
  }

  const applySolidReplacements = async (replacements: SolidColorReplaceInstruction[]) => {
    for (const r of replacements) {
      const url = createSolidColorDataUrl(r.color)
      await applyReplacementWithUrl(r.targetId, url, `Solid (${r.color})`)
    }
  }

  const parseEqualSplitPrompt = (prompt: string): EqualSplitRequest | null => {
    const normalized = prompt.toLowerCase().replace(/#/g, ' ')
    const match = normalized.match(/split\s+image\s+(\d+)\s+(?:into|in|to)\s+(\d+)\s+(?:equal\s+)?(?:parts?|pieces?|segments?)/i)
    if (!match) return null
    const imageNumber = Number.parseInt(match[1], 10)
    const parts = Number.parseInt(match[2], 10)
    if (!Number.isFinite(imageNumber) || !Number.isFinite(parts)) return null
    if (imageNumber < 1 || parts < 2) return null
    return { imageNumber, parts }
  }

  const handleSend = async () => {
    if (!inputValue.trim() || isProcessing) return

    const userPrompt = inputValue.trim()
    const userMessage: Message = {
      id: Date.now().toString(),
      text: userPrompt,
      isUser: true,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInputValue('')
    setIsProcessing(true)

    const statusId = `status-${Date.now()}`
    const updateStatus = (text: string, loading: boolean) => {
      setMessages((prev) =>
        prev.map((msg) => (msg.id === statusId ? { ...msg, text, loading } : msg))
      )
    }

    setMessages((prev) => [
      ...prev,
      { id: statusId, text: 'Thinking...', isUser: false, loading: true, timestamp: new Date() },
    ])

    try {
      const equalSplitRequest = parseEqualSplitPrompt(userPrompt)
      if (equalSplitRequest) {
        const { images } = useManifestStore.getState()
        const sortedImages = [...images].sort((a, b) => a.startTime - b.startTime)
        const targetImage = sortedImages[equalSplitRequest.imageNumber - 1]

        if (!targetImage) {
          updateStatus(`Error: image #${equalSplitRequest.imageNumber} was not found.`, false)
          return
        }

        const duration = targetImage.endTime - targetImage.startTime
        if (!(duration > 0)) {
          updateStatus(`Error: image #${equalSplitRequest.imageNumber} has invalid duration.`, false)
          return
        }

        const splitTimes: number[] = []
        for (let i = 1; i < equalSplitRequest.parts; i++) {
          splitTimes.push(targetImage.startTime + (duration * i) / equalSplitRequest.parts)
        }

        pauseHistory()
        try {
          splitImageAtTimes(targetImage.id, splitTimes)
        } finally {
          resumeHistory()
          pushHistory()
        }

        updateStatus(`Split image #${equalSplitRequest.imageNumber} into ${equalSplitRequest.parts} equal parts.`, false)
        return
      }

      const { videos, images, texts, audios, effects } = useManifestStore.getState()
      const manifest = {
        images: images.map((i) => ({ id: i.id, name: i.name, startTime: i.startTime, endTime: i.endTime, row: i.row, animation: i.animation, transition: i.transition, zoomIntensity: i.zoomIntensity, zoomDistanceIntensity: i.zoomDistanceIntensity, transitionDuration: i.transitionDuration, animationDuration: i.animationDuration, animationZoomEasing: i.animationZoomEasing, cropAspect: i.cropAspect, transitionColor: i.transitionColor, transitionFlashMode: i.transitionFlashMode, transitionDirection: i.transitionDirection, transitionAxis: i.transitionAxis, transitionSlideEasing: i.transitionSlideEasing, transitionCircleEasing: i.transitionCircleEasing, transitionWipeEasing: i.transitionWipeEasing })),
        videos: videos.map((v) => ({ id: v.id, title: v.title, timestamp: v.timestamp, duration: v.duration, playbackSpeed: v.playbackSpeed, speedStart: v.speedStart, speedEnd: v.speedEnd, speedEasing: v.speedEasing, muted: v.muted, row: v.row, animation: v.animation, transition: v.transition, zoomIntensity: v.zoomIntensity, zoomDistanceIntensity: v.zoomDistanceIntensity, transitionDuration: v.transitionDuration, animationDuration: v.animationDuration, animationZoomEasing: v.animationZoomEasing, cropAspect: v.cropAspect, transitionColor: v.transitionColor, transitionFlashMode: v.transitionFlashMode, transitionDirection: v.transitionDirection, transitionAxis: v.transitionAxis, transitionSlideEasing: v.transitionSlideEasing, transitionCircleEasing: v.transitionCircleEasing, transitionWipeEasing: v.transitionWipeEasing })),
        texts: texts.map((t) => ({
          id: t.id,
          content: t.content,
          startTime: t.startTime,
          endTime: t.endTime,
          fontFamily: t.fontFamily,
          fontWeight: t.fontWeight,
          animation: t.animation,
          style: t.style,
        })),
        audios: audios.map((a) => ({
          id: a.id,
          name: a.name,
          startTime: a.startTime,
          endTime: a.endTime,
          originalDuration: a.originalDuration,
          trimStart: a.trimStart,
          trimEnd: a.trimEnd,
          volume: a.volume,
          playbackSpeed: a.playbackSpeed,
          speedStart: a.speedStart,
          speedEnd: a.speedEnd,
          speedEasing: a.speedEasing,
          marks: a.marks,
        })),
        effects: effects.map((e) => ({
          id: e.id,
          name: e.type,
          startTime: e.startTime,
          endTime: e.endTime,
          intensity: e.intensity,
          contrast: e.contrast,
          flashSpeed: e.flashSpeed,
        })),
      }

      const filesSnapshot = uploadedFiles
      const uploadedFilesMeta = filesSnapshot.map((f, i) => ({ index: i, name: f.name, type: f.mediaType }))

      const response = await fetch('/api/route-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userPrompt, manifest, uploadedFiles: uploadedFilesMeta }),
      })

      const data = await response.json()

      if (!response.ok || data.error) {
        updateStatus(`Error: ${data.error || 'Failed to process request'}`, false)
        return
      }

      pauseHistory()
      try {
        if (data.action === 'edit_manifest') {
          applyMutations(data.mutations || [])
        } else if (data.action === 'delete_timeline_items') {
          applyDeleteItems(data.deleteItems || [])
        } else if (data.action === 'duplicate_timeline_range') {
          const r = data.duplicateRange
          if (r && (r.kind === 'image' || r.kind === 'video')) {
            duplicateTimelineRange(r.kind, r.firstNumber, r.lastNumber)
          }
        } else if (data.action === 'split_at_marks') {
          applySplits(data.splits || [])
        } else if (data.action === 'add_text') {
          applyNewTexts(data.newTexts || [])
        } else if (data.action === 'replace_images') {
          await applyReplacements(data.replacements || [], filesSnapshot)
          setUploadedFiles([])
        } else if (data.action === 'replace_with_solid') {
          await applySolidReplacements(data.solidReplacements || [])
        } else if (data.action === 'set_transitions') {
          applyTransitions(data.transitions || [])
        } else if (data.action === 'set_step_growth') {
          applyStepGrowth(data.stepGrowth || [])
        } else if (data.action === 'set_crop') {
          await applyCrops(data.crops || [])
        } else if (data.action === 'add_effect') {
          applyNewEffects(data.newEffects || [])
        } else if (data.action === 'normalize_audio_volumes') {
          const spec = data.normalizeAudioVolumes as NormalizeAudioVolumesInstruction | undefined
          if (!spec) {
            throw new Error('Missing audio normalization parameters.')
          }
          const { audios: liveAudios } = useManifestStore.getState()
          await runNormalizeAudioVolumes(spec, liveAudios, updateAudio)
        }
      } finally {
        resumeHistory()
        pushHistory()
      }

      updateStatus(data.message, false)
    } catch (error) {
      updateStatus(`Error: ${error instanceof Error ? error.message : 'Failed to process'}`, false)
    } finally {
      setIsProcessing(false)
    }
  }

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = '0px'
      const newHeight = Math.max(40, Math.min(textarea.scrollHeight, 140))
      textarea.style.height = `${newHeight}px`
    }
  }

  useEffect(() => {
    adjustTextareaHeight()
  }, [inputValue])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return
    if (isProcessing || !inputValue.trim()) return
    e.preventDefault()
    handleSend()
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    const newFiles: UploadedFile[] = []
    for (const file of Array.from(files)) {
      let mediaType: 'image' | 'audio' | 'video'
      if (file.type.startsWith('image/')) mediaType = 'image'
      else if (file.type.startsWith('audio/')) mediaType = 'audio'
      else if (file.type.startsWith('video/')) mediaType = 'video'
      else continue

      const blobUrl = URL.createObjectURL(file)
      let base64 = ''
      if (mediaType === 'image') {
        base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve((reader.result as string).split(',')[1])
          reader.readAsDataURL(file)
        })
      }

      newFiles.push({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: file.name,
        base64,
        blobUrl,
        mimeType: file.type,
        mediaType,
      })
    }

    setUploadedFiles((prev) => [...prev, ...newFiles])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeUploadedFile = (id: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id))
  }

  return (
    <div className={styles.container}>
      <div className={styles.messages}>
        {messages.map((message) => (
          <div
            key={message.id}
            className={`${styles.message} ${message.isUser ? styles.userMessage : styles.botMessage}`}
          >
            <p>{message.text}</p>
            {message.loading && <div className={styles.loadingBar} />}
          </div>
        ))}
      </div>

      {uploadedFiles.length > 0 && (
        <div className={styles.referenceFilesContainer}>
          {uploadedFiles.map((file) => (
            <div key={file.id} className={file.mediaType === 'image' ? styles.referenceImageItem : styles.referenceMediaItem}>
              {file.mediaType === 'image' ? (
                <img
                  src={`data:${file.mimeType};base64,${file.base64}`}
                  alt={file.name}
                  className={styles.referenceImagePreview}
                />
              ) : (
                <div className={styles.referenceMediaInfo}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {file.mediaType === 'audio' ? (
                      <>
                        <path d="M9 18V5l12-2v13" />
                        <circle cx="6" cy="18" r="3" />
                        <circle cx="18" cy="16" r="3" />
                      </>
                    ) : (
                      <>
                        <polygon points="23 7 16 12 23 17 23 7" />
                        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                      </>
                    )}
                  </svg>
                  <span className={styles.referenceMediaName}>{file.name}</span>
                </div>
              )}
              <button
                className={styles.removeFileButton}
                onClick={() => removeUploadedFile(file.id)}
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className={styles.inputContainer}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,audio/*,video/*"
          multiple
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        <div className={styles.composer}>
          <textarea
            ref={textareaRef}
            placeholder="Edit the timeline..."
            className={styles.composerTextarea}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
          />
          <div className={styles.composerFooter}>
            <button
              type="button"
              className={styles.composerIconBtn}
              onClick={() => fileInputRef.current?.click()}
              title="Attach files"
              disabled={isProcessing}
              aria-label="Attach files"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <button
              type="button"
              className={`${styles.composerIconBtn} ${styles.composerSendBtn}`}
              onClick={handleSend}
              disabled={isProcessing || !inputValue.trim()}
              title={isProcessing ? 'Processing...' : 'Send'}
              aria-label="Send"
            >
              {isProcessing ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.spinnerIcon} aria-hidden>
                  <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
