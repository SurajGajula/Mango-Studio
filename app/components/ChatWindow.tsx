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
  DeleteLibraryItemInstruction,
  NormalizeAudioVolumesInstruction,
  GenerateImageInstruction,
  EditImageInstruction,
  GenerateVideoInstruction,
  GenerateSpeechInstruction,
  TranscribeAudioInstruction,
  AnimateToSpeechInstruction,
} from '@/app/api/route-prompt/route'
import type { TranscribeSegment } from '@/app/api/transcribe-audio/route'
import { TextClass } from '@/app/models/TextClass'
import { captionClipEndTime } from '@/app/lib/textUtils'
import { buildCenteredTextLayout, centerExistingTextOnCanvas, getSharedTextMeasureCtx } from '@/app/lib/drawTextOverlay'
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
import {
  resolveAudioDurationFromUrl,
  addVideoToTimelineAtPlayhead,
  addVideoToTimelineAtTime,
  addAudioToTimelineAtPlayhead,
} from '@/app/lib/timelineMediaInsert'
import { addImageAtCurrentPlayhead } from '@/app/lib/addImageAtPlayhead'
import {
  imageEditPrompt,
  imagePromptWithReferences,
  resolveAttachedImageReferences,
  resolveAttachedAudioReference,
  resolveImageUrlReference,
  resolveManifestImageReferences,
  dataUrlToReferenceImage,
  videoPromptWithReferences,
} from '@/app/lib/chatGenerationReferences'
import {
  captureVideoFrameDataUrl,
  captureTimeForVideoFramePosition,
  type VideoFramePosition,
  videoTimelineEndSeconds,
} from '@/app/lib/captureVideoFrame'
import { replaceVideoAudioTrack } from '@/app/lib/videoExporter'
import { VEO_MAX_SPEECH_SECONDS } from '@/app/lib/veoDurationSeconds'
import {
  AUDIO_VOLUME_SLIDER_MAX,
  decodeAudioFromUrl,
  rmsFromAudioBufferTrimmed,
} from '@/app/lib/audioLoudnessNormalize'
import {
  medianPitchHzFromBuffer,
  pitchShiftToMatchReference,
} from '@/app/lib/speechPitchMatch'
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
  kind: 'image' | 'text' | 'video'
  itemNumber: number
  parts: number
}

const AUDIO_RMS_FLOOR = 1e-7

function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64)
  const byteNumbers = new Array(byteCharacters.length)
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i)
  }
  return new Blob([new Uint8Array(byteNumbers)], { type: mimeType })
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1] ?? '')
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

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
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
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
  const splitTextAtTimes = useManifestStore((state) => state.splitTextAtTimes)
  const splitAudioAtTimes = useManifestStore((state) => state.splitAudioAtTimes)
  const replaceVideoWithImage = useManifestStore((state) => state.replaceVideoWithImage)
  const replaceImageWithVideo = useManifestStore((state) => state.replaceImageWithVideo)
  const replaceVideoSource = useManifestStore((state) => state.replaceVideoSource)
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
        const updates: any = { startTime: m.startTime, endTime: m.endTime, row: m.row, opacity: m.opacity }
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
        updateVideo(m.id, { timestamp: m.timestamp, duration: m.duration, muted: m.muted, row: m.row, opacity: m.opacity })
      } else if (m.type === 'updateText') {
        const updates: Partial<TextClass> = {
          startTime: m.startTime,
          endTime: m.endTime,
          row: m.row,
          opacity: m.opacity,
          fontFamily: m.fontFamily,
          fontWeight: m.fontWeight,
          animation: m.animation,
          style: m.style,
          textAlign: m.textAlign,
          x: m.x,
          y: m.y,
          width: m.width,
          height: m.height,
        }
        if (m.centerOnCanvas) {
          const text = useManifestStore.getState().texts.find((t) => t.id === m.id)
          if (text) {
            const { logicalW, logicalH } = getLogicalCanvasDimensions(FIXED_ASPECT_RATIO)
            Object.assign(updates, centerExistingTextOnCanvas(text, getSharedTextMeasureCtx(), logicalW, logicalH))
          }
        }
        if (m.textAlign !== undefined) {
          updates.textAlign = m.textAlign
        }
        updateText(m.id, updates)
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
      else if (s.type === 'text') splitTextAtTimes(s.id, s.times)
      else if (s.type === 'audio') splitAudioAtTimes(s.id, s.times)
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

  const runDeleteLibraryItems = async (items: DeleteLibraryItemInstruction[]) => {
    const assetIds = items.filter((item) => item.type === 'asset').map((item) => item.id)
    const folderIds = items.filter((item) => item.type === 'folder').map((item) => item.id)
    if (assetIds.length === 0 && folderIds.length === 0) return

    const response = await fetch('/api/media/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetIds, folderIds }),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => null)
      throw new Error(body?.error ?? 'Failed to delete library items')
    }
    window.dispatchEvent(new Event('account-media-updated'))
  }

  const applyNewTexts = (newTexts: AddTextInstruction[]) => {
    const { logicalW, logicalH } = getLogicalCanvasDimensions(FIXED_ASPECT_RATIO)
    const measureCtx = getSharedTextMeasureCtx()
    for (const t of newTexts) {
      const id = `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const row = findFreeVisualOverlayRow(t.startTime, t.endTime)
      const placement = buildCenteredTextLayout({ content: t.content }, measureCtx, logicalW, logicalH)
      addText(new TextClass(id, t.content, t.startTime, t.endTime).copy({ row, ...placement }))
    }
  }

  const applyTranscriptionSegments = (
    segments: TranscribeSegment[],
    audioTimelineStart: number,
    playbackSpeed: number
  ) => {
    const { logicalW, logicalH } = getLogicalCanvasDimensions(FIXED_ASPECT_RATIO)
    const measureCtx = getSharedTextMeasureCtx()
    for (const segment of segments) {
      const startTime = audioTimelineStart + segment.startTime / playbackSpeed
      const segmentEndTime = audioTimelineStart + segment.endTime / playbackSpeed
      const wordTimings =
        segment.words.length > 0
          ? segment.words.map((word) => ({
              text: word.text,
              startTime: (word.startTime - segment.startTime) / playbackSpeed,
              endTime: (word.endTime - segment.startTime) / playbackSpeed,
            }))
          : undefined
      const endTime = captionClipEndTime(startTime, segmentEndTime, wordTimings)
      const id = `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const row = findFreeVisualOverlayRow(startTime, endTime)
      const animation = wordTimings ? 'speech' : 'keyboard'
      const content = segment.text.trim()
      const placement = buildCenteredTextLayout({ content }, measureCtx, logicalW, logicalH)
      addText(
        new TextClass(id, content, startTime, endTime).copy({
          row,
          animation,
          wordTimings,
          ...placement,
        })
      )
    }
  }

  const runGenerateImage = async (
    spec: GenerateImageInstruction,
    files: UploadedFile[],
    updateStatus: (text: string, loading: boolean) => void
  ) => {
    updateStatus('Generating image...', true)
    const { images } = useManifestStore.getState()
    const timelineRefs = spec.referenceImageNumbers?.length
      ? await resolveManifestImageReferences(spec.referenceImageNumbers, images)
      : []
    const attachedRefs = await resolveAttachedImageReferences(files)
    const refImages = [...timelineRefs, ...attachedRefs]
    const response = await fetch('/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: imagePromptWithReferences(spec.prompt, refImages.length),
        referenceImages: refImages.length > 0 ? refImages : undefined,
      }),
    })
    const data = await response.json()
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to generate image')
    }
    if (!data.image_base64) {
      throw new Error('No image was returned')
    }
    const mimeType = data.image_mime_type || 'image/png'
    const blob = base64ToBlob(data.image_base64, mimeType)
    const name = spec.prompt.substring(0, 50) + (spec.prompt.length > 50 ? '...' : '')
    const uploadFile = new File([blob], `generated-${Date.now()}.png`, { type: mimeType })
    const assetId = await uploadToAccountLibrary(uploadFile)
    const sourceUrl = assetId ? accountMediaAssetPlaybackUrl(assetId) : URL.createObjectURL(blob)
    pauseHistory()
    try {
      await addImageAtCurrentPlayhead(sourceUrl, name)
    } finally {
      resumeHistory()
      pushHistory()
    }
    updateStatus('Image generated and added to the timeline.', false)
  }

  const resolveEditTargetImage = (spec: EditImageInstruction) => {
    const { images } = useManifestStore.getState()
    if (spec.target === 'selected') {
      const selectedImageId = useSelectionStore.getState().selectedImageId
      if (!selectedImageId) {
        throw new Error('No image is selected. Select an image or specify an image number.')
      }
      const image = images.find((i) => i.id === selectedImageId)
      if (!image) throw new Error('Selected image was not found on the timeline.')
      return image
    }
    const imageNumber = spec.imageNumber
    if (imageNumber === undefined || !Number.isFinite(imageNumber)) {
      throw new Error('Missing image number to edit.')
    }
    const sorted = [...images].sort((a, b) => a.startTime - b.startTime)
    if (imageNumber < 1 || imageNumber > sorted.length) {
      throw new Error(`Image #${imageNumber} is out of range (1–${sorted.length}).`)
    }
    return sorted[imageNumber - 1]
  }

  const runEditImage = async (
    spec: EditImageInstruction,
    files: UploadedFile[],
    updateStatus: (text: string, loading: boolean) => void
  ) => {
    updateStatus('Editing image...', true)
    const targetImage = resolveEditTargetImage(spec)
    if (!targetImage.url) {
      throw new Error('Target image has no source URL.')
    }
    const sourceRef = await resolveImageUrlReference(targetImage.url)
    if (!sourceRef) {
      throw new Error('Failed to load the timeline image to edit.')
    }
    const attachedRefs = await resolveAttachedImageReferences(files)
    const referenceImages = [sourceRef, ...attachedRefs]
    const response = await fetch('/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: imageEditPrompt(spec.prompt, true, attachedRefs.length),
        referenceImages,
      }),
    })
    const data = await response.json()
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to edit image')
    }
    if (!data.image_base64) {
      throw new Error('No edited image was returned')
    }
    const mimeType = data.image_mime_type || 'image/png'
    const blob = base64ToBlob(data.image_base64, mimeType)
    const name = spec.prompt.substring(0, 50) + (spec.prompt.length > 50 ? '...' : '')
    const uploadFile = new File([blob], `edited-${Date.now()}.png`, { type: mimeType })
    const assetId = await uploadToAccountLibrary(uploadFile)
    const sourceUrl = assetId ? accountMediaAssetPlaybackUrl(assetId) : URL.createObjectURL(blob)
    pauseHistory()
    try {
      await applyReplacementWithUrl(targetImage.id, sourceUrl, name)
    } finally {
      resumeHistory()
      pushHistory()
    }
    updateStatus('Image updated in place on the timeline.', false)
  }

  const runGenerateVideo = async (
    spec: GenerateVideoInstruction,
    files: UploadedFile[],
    updateStatus: (text: string, loading: boolean) => void
  ) => {
    updateStatus('Generating video...', true)
    const { images } = useManifestStore.getState()
    const timelineRefs = spec.referenceImageNumbers?.length
      ? await resolveManifestImageReferences(spec.referenceImageNumbers, images)
      : []
    const attachedRefs = await resolveAttachedImageReferences(files)
    const refImages = [...timelineRefs, ...attachedRefs].slice(0, 3)
    const response = await fetch('/api/generate-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: videoPromptWithReferences(spec.prompt, refImages.length),
        negativePrompt: spec.negativePrompt,
        referenceImages: refImages.length > 0 ? refImages : undefined,
      }),
    })
    const data = await response.json()
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to generate video')
    }
    if (!data.video_base64) {
      throw new Error('No video was returned')
    }
    const mimeType = data.video_mime_type || 'video/mp4'
    const blob = base64ToBlob(data.video_base64, mimeType)
    const title = spec.prompt.substring(0, 50) + (spec.prompt.length > 50 ? '...' : '')
    const uploadFile = new File([blob], `generated-${Date.now()}.mp4`, { type: mimeType })
    const { duration } = await resolveVideoMetadata(URL.createObjectURL(blob))
    if (!validateMediaDuration(duration, 'Video')) {
      throw new Error('Generated video exceeds upload duration limit.')
    }
    const assetId = await uploadToAccountLibrary(uploadFile, duration)
    const sourceUrl = assetId ? accountMediaAssetPlaybackUrl(assetId) : URL.createObjectURL(blob)
    pauseHistory()
    try {
      await addVideoToTimelineAtPlayhead(sourceUrl, title)
    } finally {
      resumeHistory()
      pushHistory()
    }
    updateStatus('Video generated and added to the timeline.', false)
  }

  const runGenerateSpeech = async (
    spec: GenerateSpeechInstruction,
    updateStatus: (text: string, loading: boolean) => void
  ) => {
    let referenceAudio: { audioBase64: string; mimeType: string } | undefined
    let referenceTimelineAudio: AudioClass | null = null
    let referenceBuffer: AudioBuffer | null = null

    if (spec.referenceAudioNumber && !spec.multiSpeaker) {
      updateStatus(`Loading reference voice from audio #${spec.referenceAudioNumber}...`, true)
      const { audios } = useManifestStore.getState()
      const sorted = [...audios].sort((a, b) => a.startTime - b.startTime)
      const refN = spec.referenceAudioNumber
      if (refN < 1 || refN > sorted.length) {
        throw new Error(`Reference audio #${refN} is out of range (1–${sorted.length}).`)
      }
      referenceTimelineAudio = sorted[refN - 1]
      if (!referenceTimelineAudio.url) {
        throw new Error(`Reference audio #${refN} has no source URL.`)
      }
      const refResponse = await fetch(referenceTimelineAudio.url)
      if (!refResponse.ok) {
        throw new Error(`Failed to load reference audio #${refN}.`)
      }
      const refBlob = await refResponse.blob()
      referenceAudio = {
        audioBase64: await blobToBase64(refBlob),
        mimeType: refBlob.type || 'audio/wav',
      }
      const pitchCtx = new AudioContext()
      try {
        referenceBuffer = await decodeAudioFromUrl(pitchCtx, referenceTimelineAudio.url)
      } finally {
        await pitchCtx.close()
      }
    }

    updateStatus('Generating speech...', true)
    const response = await fetch('/api/generate-speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: spec.prompt,
        voiceName: spec.voiceName,
        multiSpeaker: spec.multiSpeaker,
        speakers: spec.speakers,
        referenceAudio,
      }),
    })
    const data = await response.json()
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to generate speech')
    }
    if (!data.audio_base64) {
      throw new Error('No speech audio was returned')
    }
    const mimeType = data.audio_mime_type || 'audio/wav'
    const blob = base64ToBlob(data.audio_base64, mimeType)
    const name = spec.prompt.substring(0, 50) + (spec.prompt.length > 50 ? '...' : '')
    const uploadFile = new File([blob], `speech-${Date.now()}.wav`, { type: mimeType })
    const blobUrl = URL.createObjectURL(blob)
    const duration = await resolveAudioDurationFromUrl(blobUrl)
    if (!validateMediaDuration(duration, 'Audio')) {
      throw new Error('Generated speech exceeds upload duration limit.')
    }
    const assetId = await uploadToAccountLibrary(uploadFile, duration)
    const sourceUrl = assetId ? accountMediaAssetPlaybackUrl(assetId) : blobUrl
    pauseHistory()
    try {
      await addAudioToTimelineAtPlayhead(sourceUrl, name, duration)
      if (referenceTimelineAudio && referenceBuffer) {
        const pitchCtx = new AudioContext()
        try {
          const generatedBuffer = await decodeAudioFromUrl(pitchCtx, blobUrl)
          const refHz = medianPitchHzFromBuffer(
            referenceBuffer,
            referenceTimelineAudio.trimStart ?? 0,
            referenceTimelineAudio.trimEnd ?? 0,
            referenceTimelineAudio.originalDuration
          )
          const genHz = medianPitchHzFromBuffer(generatedBuffer)
          if (refHz && genHz) {
            const pitch = pitchShiftToMatchReference(
              refHz,
              genHz,
              referenceTimelineAudio.pitch ?? 1
            )
            const newAudioId = useSelectionStore.getState().selectedAudioId
            if (newAudioId) {
              updateAudio(newAudioId, { pitch })
            }
          }
        } finally {
          await pitchCtx.close()
        }
      }
    } finally {
      resumeHistory()
      pushHistory()
    }
    const refSuffix =
      spec.referenceAudioNumber && !spec.multiSpeaker
        ? ` matching audio #${spec.referenceAudioNumber}`
        : ''
    updateStatus(`Speech generated${refSuffix} and added to the timeline.`, false)
  }

  const runTranscribeAudio = async (
    spec: TranscribeAudioInstruction,
    updateStatus: (text: string, loading: boolean) => void
  ) => {
    updateStatus('Transcribing audio...', true)
    const { audios } = useManifestStore.getState()
    const sorted = [...audios].sort((a, b) => a.startTime - b.startTime)
    const audioNumber = spec.audioNumber
    if (audioNumber < 1 || audioNumber > sorted.length) {
      throw new Error(`Audio #${audioNumber} is out of range (1–${sorted.length}).`)
    }
    const audio = sorted[audioNumber - 1]
    if (!audio.url) {
      throw new Error(`Audio #${audioNumber} has no source URL.`)
    }
    const response = await fetch(audio.url)
    if (!response.ok) {
      throw new Error(`Failed to load audio #${audioNumber}.`)
    }
    const blob = await response.blob()
    const audioBase64 = await blobToBase64(blob)
    const transcribeResponse = await fetch('/api/transcribe-audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audioBase64,
        mimeType: blob.type || 'audio/mpeg',
        trimStart: audio.trimStart ?? 0,
        trimEnd: audio.trimEnd ?? 0,
        originalDuration: audio.originalDuration,
      }),
    })
    const data = await transcribeResponse.json()
    if (!transcribeResponse.ok || !data.success) {
      throw new Error(data.error || 'Failed to transcribe audio')
    }
    const segments = (data.segments ?? []) as TranscribeSegment[]
    if (segments.length === 0) {
      throw new Error('No speech detected in the audio.')
    }
    const playbackSpeed = audio.playbackSpeed ?? 1
    pauseHistory()
    try {
      applyTranscriptionSegments(segments, audio.startTime, playbackSpeed)
    } finally {
      resumeHistory()
      pushHistory()
    }
    updateStatus(`Added ${segments.length} subtitle segments from audio #${audioNumber}.`, false)
  }

  const resolveTimelineAudioForSpeech = async (audioNumber: number) => {
    const { audios } = useManifestStore.getState()
    const sorted = [...audios].sort((a, b) => a.startTime - b.startTime)
    if (audioNumber < 1 || audioNumber > sorted.length) {
      throw new Error(`Audio #${audioNumber} is out of range (1–${sorted.length}).`)
    }
    const audio = sorted[audioNumber - 1]
    if (!audio.url) {
      throw new Error(`Audio #${audioNumber} has no source URL.`)
    }
    const response = await fetch(audio.url)
    if (!response.ok) {
      throw new Error(`Failed to load audio #${audioNumber}.`)
    }
    const blob = await response.blob()
    const trimStart = audio.trimStart ?? 0
    const trimEnd = audio.trimEnd ?? 0
    const originalDuration = audio.originalDuration
    const regionDuration =
      originalDuration !== undefined
        ? Math.max(0, originalDuration - trimStart - trimEnd)
        : await resolveAudioDurationFromUrl(URL.createObjectURL(blob))
    if (regionDuration > VEO_MAX_SPEECH_SECONDS) {
      throw new Error(`Audio #${audioNumber} must be ${VEO_MAX_SPEECH_SECONDS} seconds or less for talking animation.`)
    }
    return {
      audioBase64: await blobToBase64(blob),
      mimeType: blob.type || 'audio/mpeg',
      trimStart,
      trimEnd,
      originalDuration,
      regionDuration,
      audioBlob: blob,
      name: audio.name,
    }
  }

  const runAnimateToSpeech = async (
    spec: AnimateToSpeechInstruction,
    files: UploadedFile[],
    updateStatus: (text: string, loading: boolean) => void
  ) => {
    updateStatus('Preparing talking animation...', true)

    let firstFrame: { base64: string; mimeType: string } | null = null
    let targetImage: ImageClass | null = null
    let targetVideo: VideoModel | null = null
    let appendAtTime: number | undefined
    const visualTarget = spec.visualTarget ?? 'selected'
    const { images, videos, playbackTime } = useManifestStore.getState()
    const sortedVideos = [...videos].sort((a, b) => a.timestamp - b.timestamp)

    const resolveVideoFrame = async (video: VideoModel, framePosition: VideoFramePosition) => {
      const captureTime = captureTimeForVideoFramePosition(video, framePosition, playbackTime)
      const dataUrl = await captureVideoFrameDataUrl(video, captureTime)
      return dataUrlToReferenceImage(dataUrl)
    }

    if (visualTarget === 'attached') {
      const attachedImages = await resolveAttachedImageReferences(files)
      if (attachedImages.length === 0) {
        throw new Error('Attach an image file to animate, or specify an image/video number.')
      }
      firstFrame = attachedImages[0]
    } else if (visualTarget === 'image_number') {
      const imageNumber = spec.imageNumber
      if (imageNumber === undefined || !Number.isFinite(imageNumber)) {
        throw new Error('Missing image number to animate.')
      }
      const sorted = [...images].sort((a, b) => a.startTime - b.startTime)
      if (imageNumber < 1 || imageNumber > sorted.length) {
        throw new Error(`Image #${imageNumber} is out of range (1–${sorted.length}).`)
      }
      targetImage = sorted[imageNumber - 1]
      if (!targetImage.url) throw new Error(`Image #${imageNumber} has no source URL.`)
      firstFrame = await resolveImageUrlReference(targetImage.url)
    } else if (visualTarget === 'video_number') {
      const videoNumber = spec.videoNumber
      if (videoNumber === undefined || !Number.isFinite(videoNumber)) {
        throw new Error('Missing video number to animate.')
      }
      if (videoNumber < 1 || videoNumber > sortedVideos.length) {
        throw new Error(`Video #${videoNumber} is out of range (1–${sortedVideos.length}).`)
      }
      const sourceVideo = sortedVideos[videoNumber - 1]
      const framePosition = spec.videoFramePosition ?? 'playhead'
      const appendAfter = spec.appendAfterVideo ?? framePosition === 'last'
      firstFrame = await resolveVideoFrame(sourceVideo, framePosition)
      if (appendAfter) {
        appendAtTime = videoTimelineEndSeconds(sourceVideo)
      } else {
        targetVideo = sourceVideo
      }
    } else {
      const selectedImageId = useSelectionStore.getState().selectedImageId
      const selectedVideoId = useSelectionStore.getState().selectedVideoId
      if (selectedImageId) {
        targetImage = images.find((i) => i.id === selectedImageId) ?? null
        if (!targetImage?.url) throw new Error('Selected image has no source URL.')
        firstFrame = await resolveImageUrlReference(targetImage.url)
      } else if (selectedVideoId) {
        const sourceVideo = videos.find((v) => v.id === selectedVideoId) ?? null
        if (!sourceVideo) throw new Error('Selected video was not found on the timeline.')
        const framePosition = spec.videoFramePosition ?? 'playhead'
        const appendAfter = spec.appendAfterVideo ?? framePosition === 'last'
        firstFrame = await resolveVideoFrame(sourceVideo, framePosition)
        if (appendAfter) {
          appendAtTime = videoTimelineEndSeconds(sourceVideo)
        } else {
          targetVideo = sourceVideo
        }
      } else {
        const attachedImages = await resolveAttachedImageReferences(files)
        if (attachedImages.length > 0) {
          firstFrame = attachedImages[0]
        } else {
          throw new Error(
            'Select an image or video, specify a number (e.g. from the end of video 1), or attach an image file.'
          )
        }
      }
    }

    if (!firstFrame) {
      throw new Error('Failed to load the visual source for animation.')
    }

    let audioPayload: {
      audioBase64: string
      mimeType: string
      trimStart: number
      trimEnd: number
      originalDuration?: number
      regionDuration: number
      audioBlob: Blob
      name: string
    }

    if (spec.audioNumber !== undefined) {
      audioPayload = await resolveTimelineAudioForSpeech(spec.audioNumber)
    } else {
      const attachedAudio = await resolveAttachedAudioReference(files)
      if (!attachedAudio) {
        throw new Error('Specify an audio track number or attach an audio file in chat.')
      }
      const duration = await resolveAudioDurationFromUrl(URL.createObjectURL(attachedAudio.blob))
      if (duration > VEO_MAX_SPEECH_SECONDS) {
        throw new Error(`Attached audio must be ${VEO_MAX_SPEECH_SECONDS} seconds or less for talking animation.`)
      }
      audioPayload = {
        audioBase64: attachedAudio.base64,
        mimeType: attachedAudio.mimeType,
        trimStart: 0,
        trimEnd: 0,
        regionDuration: duration,
        audioBlob: attachedAudio.blob,
        name: files.find((f) => f.mediaType === 'audio')?.name ?? 'Speech',
      }
    }

    updateStatus('Generating lip-sync animation...', true)
    const response = await fetch('/api/animate-to-speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstFrame,
        audioBase64: audioPayload.audioBase64,
        mimeType: audioPayload.mimeType,
        trimStart: audioPayload.trimStart,
        trimEnd: audioPayload.trimEnd,
        originalDuration: audioPayload.originalDuration,
        motionPrompt: spec.motionPrompt,
      }),
    })
    const data = await response.json()
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to animate to speech')
    }
    if (!data.video_base64) {
      throw new Error('No talking video was returned')
    }

    updateStatus('Applying your audio track...', true)
    const generatedBlob = base64ToBlob(data.video_base64, data.video_mime_type || 'video/mp4')
    const muxedBlob = await replaceVideoAudioTrack(generatedBlob, audioPayload.audioBlob, {
      trimStartSeconds: audioPayload.trimStart,
      durationSeconds: audioPayload.regionDuration,
    })
    const title = `Talking: ${audioPayload.name}`.substring(0, 50)
    const uploadFile = new File([muxedBlob], `talking-${Date.now()}.mp4`, { type: 'video/mp4' })
    const { duration } = await resolveVideoMetadata(URL.createObjectURL(muxedBlob))
    if (!validateMediaDuration(duration, 'Video')) {
      throw new Error('Generated talking video exceeds upload duration limit.')
    }
    const assetId = await uploadToAccountLibrary(uploadFile, duration)
    const sourceUrl = assetId ? accountMediaAssetPlaybackUrl(assetId) : URL.createObjectURL(muxedBlob)
    const aspectRatio = FIXED_ASPECT_RATIO
    const [rw, rh] = ASPECT_RATIOS[aspectRatio]

    pauseHistory()
    try {
      if (targetImage) {
        const crop = await computeMediaCropForAspect(
          sourceUrl,
          'video',
          aspectRatio,
          targetImage.width,
          targetImage.height,
          targetImage.cropAspect ?? aspectRatio
        )
        const videoInstance = new VideoModel(
          `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          title,
          sourceUrl,
          duration,
          targetImage.startTime,
          undefined,
          undefined,
          undefined,
          0,
          0,
          undefined,
          targetImage.x,
          targetImage.y,
          targetImage.width,
          targetImage.height,
          targetImage.opacity,
          targetImage.animation as AnimationMode,
          targetImage.transition as TransitionMode,
          targetImage.zoomIntensity,
          targetImage.transitionDuration,
          targetImage.animationDuration,
          targetImage.animationZoomEasing,
          undefined,
          undefined,
          undefined,
          targetImage.transitionSlideEasing,
          targetImage.transitionCircleEasing,
          targetImage.row,
          true,
          crop.cropAspect ?? targetImage.cropAspect,
          crop.cropSx ?? targetImage.cropSx,
          crop.cropSy ?? targetImage.cropSy,
          crop.cropSw ?? targetImage.cropSw,
          crop.cropSh ?? targetImage.cropSh,
          undefined,
          undefined,
          undefined,
          1
        )
        replaceImageWithVideo(targetImage.id, videoInstance)
      } else if (targetVideo) {
        replaceVideoSource(targetVideo.id, sourceUrl, title)
        updateVideo(targetVideo.id, { duration, muted: false })
      } else if (appendAtTime !== undefined) {
        await addVideoToTimelineAtTime(sourceUrl, title, appendAtTime)
      } else {
        await addVideoToTimelineAtPlayhead(sourceUrl, title)
      }
    } finally {
      resumeHistory()
      pushHistory()
    }

    updateStatus('Talking animation added with your audio.', false)
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
        updates.animationDuration = t.animation === 'stretch-out' ? item.duration : 1.0
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
    const audio: { replacement: ReplaceInstruction; file: UploadedFile }[] = []
    const video: { replacement: ReplaceInstruction; file: UploadedFile }[] = []
    const image: { replacement: ReplaceInstruction; file: UploadedFile }[] = []

    for (const replacement of replacements) {
      const file = files[replacement.fileIndex]
      if (!file) continue
      if (file.mediaType === 'audio') audio.push({ replacement, file })
      else if (file.mediaType === 'video') video.push({ replacement, file })
      else image.push({ replacement, file })
    }

    const uploadUrlsForFileIndices = async (
      fileIndices: number[],
      upload: (file: UploadedFile) => Promise<string>
    ): Promise<Map<number, string>> => {
      const urlByFileIndex = new Map<number, string>()
      await Promise.all(
        fileIndices.map(async (fileIndex) => {
          const file = files[fileIndex]
          if (!file) return
          urlByFileIndex.set(fileIndex, await upload(file))
        })
      )
      return urlByFileIndex
    }

    const uploadImageFile = async (file: UploadedFile): Promise<string> => {
      const blob = new Blob(
        [Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0))],
        { type: file.mimeType }
      )
      const uploadFile = new File([blob], file.name, { type: file.mimeType })
      const assetId = await uploadToAccountLibrary(uploadFile)
      return assetId ? accountMediaAssetPlaybackUrl(assetId) : URL.createObjectURL(blob)
    }

    const uploadVideoFile = async (file: UploadedFile): Promise<string> => {
      const { duration } = await resolveVideoMetadata(file.blobUrl)
      if (!validateMediaDuration(duration, 'Video')) return file.blobUrl
      const blob = await fetch(file.blobUrl).then((res) => res.blob())
      const uploadFile = new File([blob], file.name, { type: file.mimeType })
      const assetId = await uploadToAccountLibrary(uploadFile, duration)
      return assetId ? accountMediaAssetPlaybackUrl(assetId) : file.blobUrl
    }

    await Promise.all([
      (async () => {
        const audioFileIndices = [...new Set(audio.map(({ replacement }) => replacement.fileIndex))]
        await Promise.all(
          audioFileIndices.map(async (fileIndex) => {
            const file = files[fileIndex]
            if (!file) return
            const duration = await resolveAudioDurationFromUrl(file.blobUrl)
            if (!validateMediaDuration(duration, 'Audio')) return
            const blob = await fetch(file.blobUrl).then((res) => res.blob())
            const uploadFile = new File([blob], file.name, { type: file.mimeType })
            void uploadToAccountLibrary(uploadFile, duration)
          })
        )
        await Promise.all(
          audio.map(({ replacement, file }) => applyAudioReplacement(replacement.targetId, file))
        )
      })(),
      (async () => {
        const videoFileIndices = [...new Set(video.map(({ replacement }) => replacement.fileIndex))]
        const videoUrlByFileIndex = await uploadUrlsForFileIndices(videoFileIndices, uploadVideoFile)
        await Promise.all(
          video.map(({ replacement, file }) =>
            applyVideoReplacement(
              replacement.targetId,
              file,
              videoUrlByFileIndex.get(replacement.fileIndex) ?? file.blobUrl
            )
          )
        )
      })(),
      (async () => {
        const imageFileIndices = [...new Set(image.map(({ replacement }) => replacement.fileIndex))]
        const imageUrlByFileIndex = await uploadUrlsForFileIndices(imageFileIndices, uploadImageFile)
        await Promise.all(
          image.map(({ replacement, file }) => {
            const sourceUrl = imageUrlByFileIndex.get(replacement.fileIndex)
            if (!sourceUrl) return Promise.resolve()
            return applyReplacementWithUrl(replacement.targetId, sourceUrl, file.name)
          })
        )
      })(),
    ])
  }

  const applySolidReplacements = async (replacements: SolidColorReplaceInstruction[]) => {
    for (const r of replacements) {
      const url = createSolidColorDataUrl(r.color)
      await applyReplacementWithUrl(r.targetId, url, `Solid (${r.color})`)
    }
  }

  const parseEqualSplitPrompt = (prompt: string): EqualSplitRequest | null => {
    const normalized = prompt.toLowerCase().replace(/#/g, ' ')
    const match = normalized.match(
      /split\s+(image|text|video)\s+(\d+)\s+(?:into|in|to)\s+(\d+)\s+(?:equal\s+)?(?:parts?|pieces?|segments?)/i
    )
    if (!match) return null
    const kind = match[1].toLowerCase() as EqualSplitRequest['kind']
    const itemNumber = Number.parseInt(match[2], 10)
    const parts = Number.parseInt(match[3], 10)
    if (!Number.isFinite(itemNumber) || !Number.isFinite(parts)) return null
    if (itemNumber < 1 || parts < 2) return null
    return { kind, itemNumber, parts }
  }

  const handleSend = async () => {
    if (!inputValue.trim()) return

    const userPrompt = inputValue.trim()
    const userMessage: Message = {
      id: Date.now().toString(),
      text: userPrompt,
      isUser: true,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInputValue('')

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

    const filesSnapshot = [...uploadedFiles]
    if (filesSnapshot.length > 0) {
      setUploadedFiles([])
    }

    try {
      const equalSplitRequest = parseEqualSplitPrompt(userPrompt)
      if (equalSplitRequest) {
        const { images, texts, videos } = useManifestStore.getState()
        const { kind, itemNumber, parts } = equalSplitRequest

        let targetId: string | undefined
        let rangeStart = 0
        let rangeEnd = 0

        if (kind === 'image') {
          const target = [...images].sort((a, b) => a.startTime - b.startTime)[itemNumber - 1]
          if (!target) {
            updateStatus(`Error: image #${itemNumber} was not found.`, false)
            return
          }
          targetId = target.id
          rangeStart = target.startTime
          rangeEnd = target.endTime
        } else if (kind === 'text') {
          const target = [...texts].sort((a, b) => a.startTime - b.startTime)[itemNumber - 1]
          if (!target) {
            updateStatus(`Error: text #${itemNumber} was not found.`, false)
            return
          }
          targetId = target.id
          rangeStart = target.startTime
          rangeEnd = target.endTime
        } else {
          const target = [...videos].sort((a, b) => a.timestamp - b.timestamp)[itemNumber - 1]
          if (!target) {
            updateStatus(`Error: video #${itemNumber} was not found.`, false)
            return
          }
          targetId = target.id
          rangeStart = target.timestamp
          rangeEnd = target.timestamp + (target.duration ?? 0)
        }

        const duration = rangeEnd - rangeStart
        if (!(duration > 0)) {
          updateStatus(`Error: ${kind} #${itemNumber} has invalid duration.`, false)
          return
        }

        const splitTimes: number[] = []
        for (let i = 1; i < parts; i++) {
          splitTimes.push(rangeStart + (duration * i) / parts)
        }

        pauseHistory()
        try {
          if (kind === 'image') splitImageAtTimes(targetId, splitTimes)
          else if (kind === 'text') splitTextAtTimes(targetId, splitTimes)
          else splitVideoAtTimes(targetId, splitTimes)
        } finally {
          resumeHistory()
          pushHistory()
        }

        updateStatus(`Split ${kind} #${itemNumber} into ${parts} equal parts.`, false)
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
          pitch: a.pitch,
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

      const uploadedFilesMeta = filesSnapshot.map((f, i) => ({ index: i, name: f.name, type: f.mediaType }))

      const libraryResponse = await fetch('/api/media/list?all=1')
      if (!libraryResponse.ok) {
        const body = await libraryResponse.json().catch(() => null)
        throw new Error(body?.error ?? 'Failed to load media library')
      }
      const libraryData = await libraryResponse.json()
      const library = {
        folders: (libraryData.folders ?? []).map((f: { id: string; name: string; parent_id: string | null }) => ({
          id: f.id,
          name: f.name,
          parent_id: f.parent_id,
        })),
        assets: (libraryData.assets ?? []).map((a: { id: string; name: string; kind: string; folder_id: string | null }) => ({
          id: a.id,
          name: a.name,
          kind: a.kind,
          folder_id: a.folder_id,
        })),
      }

      const response = await fetch('/api/route-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userPrompt, manifest, library, uploadedFiles: uploadedFilesMeta }),
      })

      const data = await response.json()

      if (!response.ok || data.error) {
        updateStatus(`Error: ${data.error || 'Failed to process request'}`, false)
        return
      }

      if (data.action === 'no_op') {
        updateStatus(data.message, false)
        return
      }

      if (data.action === 'generate_image') {
        const spec = data.imageGeneration as GenerateImageInstruction | undefined
        if (!spec?.prompt) {
          updateStatus('Error: Missing image generation parameters.', false)
          return
        }
        await runGenerateImage(spec, filesSnapshot, updateStatus)
        return
      }

      if (data.action === 'edit_image') {
        const spec = data.editImage as EditImageInstruction | undefined
        if (!spec?.prompt) {
          updateStatus('Error: Missing image edit parameters.', false)
          return
        }
        await runEditImage(spec, filesSnapshot, updateStatus)
        return
      }

      if (data.action === 'generate_video') {
        const spec = data.videoGeneration as GenerateVideoInstruction | undefined
        if (!spec?.prompt) {
          updateStatus('Error: Missing video generation parameters.', false)
          return
        }
        await runGenerateVideo(spec, filesSnapshot, updateStatus)
        return
      }

      if (data.action === 'generate_speech') {
        const spec = data.speechGeneration as GenerateSpeechInstruction | undefined
        if (!spec?.prompt) {
          updateStatus('Error: Missing speech generation parameters.', false)
          return
        }
        await runGenerateSpeech(spec, updateStatus)
        return
      }

      if (data.action === 'transcribe_audio') {
        const spec = data.transcribeAudio as TranscribeAudioInstruction | undefined
        if (!spec?.audioNumber) {
          updateStatus('Error: Missing transcription parameters.', false)
          return
        }
        await runTranscribeAudio(spec, updateStatus)
        return
      }

      if (data.action === 'animate_to_speech') {
        const spec = data.animateToSpeech as AnimateToSpeechInstruction | undefined
        if (!spec) {
          updateStatus('Error: Missing talking animation parameters.', false)
          return
        }
        await runAnimateToSpeech(spec, filesSnapshot, updateStatus)
        return
      }

      if (data.action === 'delete_library_items') {
        await runDeleteLibraryItems(data.deleteLibraryItems || [])
        updateStatus(data.message, false)
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
    if (!inputValue.trim()) return
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

  const copyUserMessage = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedMessageId(id)
    window.setTimeout(() => {
      setCopiedMessageId((current) => (current === id ? null : current))
    }, 2000)
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
            {message.isUser && (
              <div className={styles.messageActions}>
                <button
                  type="button"
                  className={styles.copyMessageBtn}
                  onClick={() => copyUserMessage(message.id, message.text)}
                  title={copiedMessageId === message.id ? 'Copied' : 'Copy prompt'}
                  aria-label={copiedMessageId === message.id ? 'Copied' : 'Copy prompt'}
                >
                  {copiedMessageId === message.id ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                  )}
                </button>
              </div>
            )}
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
              disabled={!inputValue.trim()}
              title="Send"
              aria-label="Send"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
