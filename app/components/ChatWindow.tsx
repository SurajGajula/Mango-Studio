'use client'

import { useState, useRef, useEffect } from 'react'
import { useAuth } from './AuthProvider'
import { useManifestStore } from '@/app/stores/manifestStore'
import PaymentModal from './modals/PaymentModal'
import type {
  ManifestMutation,
  SplitInstruction,
  ReplaceInstruction,
  AddTextInstruction,
  AddEffectInstruction,
  TransitionInstruction,
  CropInstruction,
} from '@/app/api/route-prompt/route'
import { TextClass } from '@/app/models/TextClass'
import { EffectClass } from '@/app/models/EffectClass'
import { ImageClass, AnimationMode, TransitionMode } from '@/app/models/ImageClass'
import { computeCropForAspect, computeImageDimensions, ASPECT_RATIOS, computeVideoDimensions, computeVideoCropForAspect, computeMediaCropForAspect } from '@/app/lib/mediaUtils'
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
  mimeType: string
}

export default function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const updateImage = useManifestStore((state) => state.updateImage)
  const updateVideo = useManifestStore((state) => state.updateVideo)
  const updateText = useManifestStore((state) => state.updateText)
  const trimAudio = useManifestStore((state) => state.trimAudio)
  const splitVideoAtTimes = useManifestStore((state) => state.splitVideoAtTimes)
  const splitImageAtTimes = useManifestStore((state) => state.splitImageAtTimes)
  const replaceImageSource = useManifestStore((state) => state.replaceImageSource)
  const replaceVideoWithImage = useManifestStore((state) => state.replaceVideoWithImage)
  const addText = useManifestStore((state) => state.addText)
  const addEffect = useManifestStore((state) => state.addEffect)
  const pauseHistory = useManifestStore((state) => state.pauseHistory)
  const resumeHistory = useManifestStore((state) => state.resumeHistory)
  const pushHistory = useManifestStore((state) => state.pushHistory)
  const pendingPrompt = useManifestStore((state) => state.pendingPrompt)
  const setPendingPrompt = useManifestStore((state) => state.setPendingPrompt)
  const setItemPlaybackSpeed = useManifestStore((state) => state.setItemPlaybackSpeed)
  const { user, supabase, profile } = useAuth()

  const handleManageSubscription = async () => {
    try {
      const response = await fetch('/api/customer-portal', {
        method: 'POST',
      })
      const data = await response.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error(data.error || 'Failed to open billing portal')
      }
    } catch (error) {
      console.error('Portal error:', error)
      alert('Failed to open subscription management.')
    }
  }

  const handleSignOut = async () => {
    if (supabase) {
      await supabase.auth.signOut()
    }
  }

  useEffect(() => {
    if (pendingPrompt) {
      setInputValue(pendingPrompt)
      setPendingPrompt(null)
      textareaRef.current?.focus()
    }
  }, [pendingPrompt, setPendingPrompt])

  const applyMutations = (mutations: ManifestMutation[]) => {
    for (const m of mutations) {
      if (m.type === 'updateImage') updateImage(m.id, { startTime: m.startTime, endTime: m.endTime })
      else if (m.type === 'updateVideo') {
        if (m.playbackSpeed !== undefined) {
          setItemPlaybackSpeed(m.id, m.playbackSpeed)
        }
        updateVideo(m.id, { timestamp: m.timestamp, duration: m.duration, muted: m.muted })
      } else if (m.type === 'updateText') updateText(m.id, { startTime: m.startTime, endTime: m.endTime })
      else if (m.type === 'updateAudio') {
        if (m.playbackSpeed !== undefined) {
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

  const applyNewTexts = (newTexts: AddTextInstruction[]) => {
    for (const t of newTexts) {
      addText(new TextClass(
        `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        t.content,
        t.startTime,
        t.endTime,
      ))
    }
  }

  const applyNewEffects = (newEffects: AddEffectInstruction[]) => {
    for (const e of newEffects) {
      addEffect(new EffectClass(
        `effect-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        e.type,
        e.startTime,
        e.endTime,
        0 // Default row
      ))
    }
  }

  const applyTransitions = (transitions: TransitionInstruction[]) => {
    const { images, videos } = useManifestStore.getState()
    for (const t of transitions) {
      const updates: { animation?: AnimationMode; transition?: TransitionMode; zoomIntensity?: number; transitionDuration?: number; animationDuration?: number } = {}
      if (t.animation !== undefined) updates.animation = t.animation
      if (t.transition !== undefined) updates.transition = t.transition
      if (t.zoomIntensity !== undefined) updates.zoomIntensity = t.zoomIntensity
      
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
    const { images, videos, aspectRatio } = useManifestStore.getState()
    for (const c of crops) {
      if (c.type === 'image') {
        const image = images.find((i) => i.id === c.id)
        if (!image) continue
        if (c.cropAspect === 'none') {
          const dims = await computeImageDimensions(image.url, aspectRatio, image.isMainTrack)
          updateImage(c.id, { ...dims, cropAspect: undefined, cropSx: 0, cropSy: 0, cropSw: 1, cropSh: 1 })
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
          const dims = await computeVideoDimensions(video.url || '', aspectRatio, video.row === 0)
          updateVideo(c.id, { ...dims, cropAspect: undefined, cropSx: 0, cropSy: 0, cropSw: 1, cropSh: 1 })
        } else {
          const ratio = ASPECT_RATIOS[c.cropAspect]
          if (!ratio) continue
          const patch = await computeVideoCropForAspect(video, aspectRatio, ratio[0], ratio[1], c.cropAspect)
          updateVideo(c.id, patch)
        }
      }
    }
  }

  const applyReplacements = async (replacements: ReplaceInstruction[], files: UploadedFile[]) => {
    const { images, videos, aspectRatio } = useManifestStore.getState()
    for (const r of replacements) {
      const file = files[r.fileIndex]
      if (!file) continue
      const blob = new Blob(
        [Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0))],
        { type: file.mimeType }
      )
      const url = URL.createObjectURL(blob)
      
      const originalImage = images.find((i) => i.id === r.targetId)
      const originalVideo = videos.find((v) => v.id === r.targetId)

      if (originalImage) {
        if (originalImage.cropAspect) {
          const ratio = ASPECT_RATIOS[originalImage.cropAspect]
          if (ratio) {
            const tempImage = new ImageClass('tmp', '', url, 0, 1)
            const patch = await computeCropForAspect(tempImage, aspectRatio, ratio[0], ratio[1], originalImage.cropAspect)
            updateImage(r.targetId, { ...patch, url, name: file.name })
          } else {
            replaceImageSource(r.targetId, url, file.name)
          }
        } else {
          const dims = await computeImageDimensions(url, aspectRatio, originalImage.isMainTrack)
          updateImage(r.targetId, { ...dims, url, name: file.name })
        }
      } else if (originalVideo) {
        const imageId = `image-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        const startTime = originalVideo.timestamp
        const endTime = startTime + (originalVideo.duration ?? 0)
        
        let patch: any
        if (originalVideo.cropAspect && ASPECT_RATIOS[originalVideo.cropAspect]) {
          const ratio = ASPECT_RATIOS[originalVideo.cropAspect]
          patch = await computeMediaCropForAspect(url, 'image', aspectRatio, ratio[0], ratio[1], originalVideo.cropAspect)
        } else {
          const dims = await computeImageDimensions(url, aspectRatio, originalVideo.row === 0)
          patch = { ...dims, cropSx: 0, cropSy: 0, cropSw: 1, cropSh: 1 }
        }

        const image = new ImageClass(
          imageId,
          file.name,
          url,
          startTime,
          endTime,
          patch.x,
          patch.y,
          patch.width,
          patch.height,
          1,
          new Date(),
          originalVideo.row === 0,
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
          originalVideo.row
        )
        
        replaceVideoWithImage(originalVideo.id, image)
      }
    }
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
      const { videos, images, texts, audios } = useManifestStore.getState()
      const manifest = {
        images: images.map((i) => ({ id: i.id, name: i.name, startTime: i.startTime, endTime: i.endTime, animation: i.animation, transition: i.transition, zoomIntensity: i.zoomIntensity, transitionDuration: i.transitionDuration, animationDuration: i.animationDuration, cropAspect: i.cropAspect })),
        videos: videos.map((v) => ({ id: v.id, title: v.title, timestamp: v.timestamp, duration: v.duration, playbackSpeed: v.playbackSpeed, muted: v.muted, isOverlay: v.isOverlay, animation: v.animation, transition: v.transition, zoomIntensity: v.zoomIntensity, transitionDuration: v.transitionDuration, animationDuration: v.animationDuration, cropAspect: v.cropAspect })),
        texts: texts.map((t) => ({ id: t.id, content: t.content, startTime: t.startTime, endTime: t.endTime })),
        audios: audios.map((a) => ({ id: a.id, name: a.name, startTime: a.startTime, endTime: a.endTime, originalDuration: a.originalDuration, trimStart: a.trimStart, trimEnd: a.trimEnd, playbackSpeed: a.playbackSpeed, marks: a.marks })),
      }

      const filesSnapshot = uploadedFiles
      const uploadedFilesMeta = filesSnapshot.map((f, i) => ({ index: i, name: f.name }))

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
        } else if (data.action === 'split_at_marks') {
          applySplits(data.splits || [])
        } else if (data.action === 'add_text') {
          applyNewTexts(data.newTexts || [])
        } else if (data.action === 'replace_images') {
          await applyReplacements(data.replacements || [], filesSnapshot)
          setUploadedFiles([])
        } else if (data.action === 'set_transitions') {
          applyTransitions(data.transitions || [])
        } else if (data.action === 'set_crop') {
          await applyCrops(data.crops || [])
        } else if (data.action === 'add_effect') {
          applyNewEffects(data.newEffects || [])
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
      const newHeight = Math.max(70, Math.min(textarea.scrollHeight, 150))
      textarea.style.height = `${newHeight}px`
    }
  }

  useEffect(() => {
    adjustTextareaHeight()
  }, [inputValue])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    const newFiles: UploadedFile[] = []
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.readAsDataURL(file)
      })
      newFiles.push({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: file.name,
        base64,
        mimeType: file.type,
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
      {user && (
        <div className={styles.header}>
          <div className={styles.userInfo}>
            <span className={styles.userEmail}>{user.email}</span>
            {profile?.requests_remaining !== undefined && (
              <span className={styles.requestCount}>{profile.requests_remaining} requests left</span>
            )}
          </div>
          <div className={styles.headerButtons}>
            {profile?.is_pro ? (
              <button className={styles.manageButton} onClick={handleManageSubscription} title="Manage Subscription">
                Pro
              </button>
            ) : (
              <button className={styles.proButton} onClick={() => setShowPaymentModal(true)}>
                Pro
              </button>
            )}
            <button className={styles.signOutButton} onClick={handleSignOut} title="Sign Out">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sign Out
            </button>
          </div>
        </div>
      )}
      {showPaymentModal && <PaymentModal onClose={() => setShowPaymentModal(false)} />}
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
        <div className={styles.referenceImagesContainer}>
          {uploadedFiles.map((file) => (
            <div key={file.id} className={styles.referenceImageItem}>
              <img
                src={`data:${file.mimeType};base64,${file.base64}`}
                alt={file.name}
                className={styles.referenceImagePreview}
              />
              <button
                className={styles.removeImageButton}
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
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        <button
          className={styles.attachButton}
          onClick={() => fileInputRef.current?.click()}
          title="Attach images"
          disabled={isProcessing}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </button>
        <textarea
          ref={textareaRef}
          placeholder="Edit the timeline..."
          className={styles.input}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isProcessing}
          rows={2}
        />
        <button
          className={styles.sendButton}
          onClick={handleSend}
          disabled={isProcessing || !inputValue.trim()}
          title={isProcessing ? 'Processing...' : 'Send'}
        >
          {isProcessing ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.spinnerIcon}>
              <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}
