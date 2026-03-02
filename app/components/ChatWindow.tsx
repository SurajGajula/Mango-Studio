'use client'

import { useState, useRef, useEffect } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import { VideoClass } from '@/app/models/VideoClass'
import styles from './ChatWindow.module.css'

interface Message {
  id: string
  text: string
  isUser: boolean
  timestamp: Date
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64)
  const byteNumbers = new Array(byteCharacters.length)
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i)
  }
  const byteArray = new Uint8Array(byteNumbers)
  return new Blob([byteArray], { type: mimeType })
}

type ImageType = 'reference' | 'firstFrame' | 'lastFrame'

interface ReferenceImage {
  id: string
  name: string
  base64: string
  mimeType: string
  imageType: ImageType
}

type GenerationMode = 'video' | 'image'

interface GeneratedImage {
  id: string
  base64: string
  mimeType: string
  prompt: string
}

export default function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [showSystemPromptModal, setShowSystemPromptModal] = useState(false)
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([])
  const [generationMode, setGenerationMode] = useState<GenerationMode>('video')
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const addVideo = useManifestStore((state) => state.addVideo)
  const replaceVideo = useManifestStore((state) => state.replaceVideo)
  const replaceTargetId = useManifestStore((state) => state.replaceTargetId)
  const setReplaceTargetId = useManifestStore((state) => state.setReplaceTargetId)
  const pendingPrompt = useManifestStore((state) => state.pendingPrompt)
  const setPendingPrompt = useManifestStore((state) => state.setPendingPrompt)
  const aspectRatio = useManifestStore((state) => state.aspectRatio)

  useEffect(() => {
    if (pendingPrompt) {
      setInputValue(pendingPrompt)
      setPendingPrompt(null)
      textareaRef.current?.focus()
    }
  }, [pendingPrompt, setPendingPrompt])

  const resolveVideoDuration = async (url: string): Promise<number | undefined> => {
    return new Promise((resolve) => {
      const probe = document.createElement('video')
      const timeout = window.setTimeout(() => {
        cleanup()
        resolve(undefined)
      }, 8000)

      const cleanup = () => {
        window.clearTimeout(timeout)
        probe.removeAttribute('src')
        probe.load()
      }

      probe.preload = 'metadata'
      probe.onloadedmetadata = () => {
        const duration = Number.isFinite(probe.duration) ? probe.duration : undefined
        cleanup()
        resolve(duration)
      }
      probe.onerror = () => {
        cleanup()
        resolve(undefined)
      }
      probe.src = url
    })
  }

  const handleSend = async () => {
    if (!inputValue.trim() || isGenerating) return

    const userPrompt = inputValue.trim()
    const fullPrompt = systemPrompt ? `${systemPrompt} ${userPrompt}` : userPrompt
    
    const userMessage: Message = {
      id: Date.now().toString(),
      text: userPrompt,
      isUser: true,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInputValue('')
    setIsGenerating(true)

    const loadingMessage: Message = {
      id: `loading-${Date.now()}`,
      text: generationMode === 'video' ? 'Generating video...' : 'Generating image...',
      isUser: false,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, loadingMessage])

    try {
      if (generationMode === 'image') {
        const refImages = referenceImages.filter((img) => img.imageType === 'reference')
        
        const response = await fetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: fullPrompt,
            aspectRatio,
            referenceImages: refImages.length > 0
              ? refImages.map((img) => ({ base64: img.base64, mimeType: img.mimeType }))
              : undefined,
          }),
        })

        const data = await response.json()
        setMessages((prev) => prev.filter((msg) => msg.id !== loadingMessage.id))

        if (!response.ok || !data.success) {
          const errorMessage: Message = {
            id: `error-${Date.now()}`,
            text: `Error: ${data.error || 'Failed to generate image'}`,
            isUser: false,
            timestamp: new Date(),
          }
          setMessages((prev) => [...prev, errorMessage])
          return
        }

        if (data.image_base64) {
          const newImage: GeneratedImage = {
            id: `img-${Date.now()}`,
            base64: data.image_base64,
            mimeType: data.image_mime_type || 'image/png',
            prompt: userPrompt,
          }
          setGeneratedImages((prev) => [...prev, newImage])

          const successMessage: Message = {
            id: `success-${Date.now()}`,
            text: 'Image generated! View it in the Generated Images section below.',
            isUser: false,
            timestamp: new Date(),
          }
          setMessages((prev) => [...prev, successMessage])
        }
      } else {
        const refImages = referenceImages.filter((img) => img.imageType === 'reference')
        const firstFrameImg = referenceImages.find((img) => img.imageType === 'firstFrame')
        const lastFrameImg = referenceImages.find((img) => img.imageType === 'lastFrame')

        const response = await fetch('/api/generate-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            prompt: fullPrompt, 
            aspectRatio, 
            negativePrompt: negativePrompt.trim() || undefined,
            referenceImages: refImages.length > 0 
              ? refImages.map((img) => ({ base64: img.base64, mimeType: img.mimeType }))
              : undefined,
            firstFrame: firstFrameImg 
              ? { base64: firstFrameImg.base64, mimeType: firstFrameImg.mimeType }
              : undefined,
            lastFrame: lastFrameImg 
              ? { base64: lastFrameImg.base64, mimeType: lastFrameImg.mimeType }
              : undefined,
          }),
        })

        const data = await response.json()
        setMessages((prev) => prev.filter((msg) => msg.id !== loadingMessage.id))

        if (!response.ok || !data.success) {
          const errorMessage: Message = {
            id: `error-${Date.now()}`,
            text: `Error: ${data.error || 'Failed to generate video'}`,
            isUser: false,
            timestamp: new Date(),
          }
          setMessages((prev) => [...prev, errorMessage])
          return
        }

        if (data.video_base64) {
          const videoId = `video-${Date.now()}`
          const mimeType = data.video_mime_type || 'video/mp4'
          
          const blob = base64ToBlob(data.video_base64, mimeType)
          const blobUrl = URL.createObjectURL(blob)
          
          const resolvedDuration = await resolveVideoDuration(blobUrl)
          const duration = resolvedDuration && resolvedDuration > 0 ? resolvedDuration : 8

          const video = new VideoClass(
            videoId,
            userPrompt.substring(0, 50) + (userPrompt.length > 50 ? '...' : ''),
            blobUrl,
            duration,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            userPrompt
          )

          if (replaceTargetId) {
            replaceVideo(replaceTargetId, video)
            setReplaceTargetId(null)
          } else {
            addVideo(video)
          }

          const successMessage: Message = {
            id: `success-${Date.now()}`,
            text: replaceTargetId ? 'Video replaced successfully!' : 'Video generated successfully!',
            isUser: false,
            timestamp: new Date(),
          }
          setMessages((prev) => [...prev, successMessage])
        }
      }
    } catch (error) {
      setMessages((prev) => prev.filter((msg) => msg.id !== loadingMessage.id))

      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        text: `Error: ${error instanceof Error ? error.message : 'Failed to generate'}`,
        isUser: false,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsGenerating(false)
    }
  }

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = '0px'
      const minHeight = 70
      const maxHeight = 150
      const newHeight = Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight))
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

    const newImages: ReferenceImage[] = []
    
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          const base64Data = result.split(',')[1]
          resolve(base64Data)
        }
        reader.readAsDataURL(file)
      })
      
      newImages.push({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: file.name,
        base64,
        mimeType: file.type,
        imageType: 'reference',
      })
    }
    
    setReferenceImages((prev) => [...prev, ...newImages])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const removeReferenceImage = (id: string) => {
    setReferenceImages((prev) => prev.filter((img) => img.id !== id))
  }

  const downloadGeneratedImage = (img: GeneratedImage) => {
    const link = document.createElement('a')
    link.href = `data:${img.mimeType};base64,${img.base64}`
    link.download = `generated-${img.id}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const useAsReference = (img: GeneratedImage, type: ImageType = 'reference') => {
    const newRef: ReferenceImage = {
      id: `ref-${Date.now()}`,
      name: `Generated: ${img.prompt.substring(0, 20)}...`,
      base64: img.base64,
      mimeType: img.mimeType,
      imageType: type,
    }
    setReferenceImages((prev) => [...prev, newRef])
  }

  const removeGeneratedImage = (id: string) => {
    setGeneratedImages((prev) => prev.filter((img) => img.id !== id))
  }

  const cycleImageType = (id: string) => {
    setReferenceImages((prev) => prev.map((img) => {
      if (img.id !== id) return img
      const typeOrder: ImageType[] = ['reference', 'firstFrame', 'lastFrame']
      const currentIndex = typeOrder.indexOf(img.imageType)
      const nextType = typeOrder[(currentIndex + 1) % typeOrder.length]
      return { ...img, imageType: nextType }
    }))
  }

  const getImageTypeLabel = (type: ImageType): string => {
    switch (type) {
      case 'reference': return 'Ref'
      case 'firstFrame': return '1st'
      case 'lastFrame': return 'Last'
    }
  }

  const hasSystemPrompt = systemPrompt.trim().length > 0 || negativePrompt.trim().length > 0

  return (
    <div className={styles.container}>
      <div className={styles.messages}>
        {messages.map((message) => (
          <div
            key={message.id}
            className={`${styles.message} ${message.isUser ? styles.userMessage : styles.botMessage}`}
          >
            <p>{message.text}</p>
          </div>
        ))}
      </div>
      {generatedImages.length > 0 && (
        <div className={styles.generatedImagesSection}>
          <div className={styles.sectionHeader}>Generated Images</div>
          <div className={styles.generatedImagesGrid}>
            {generatedImages.map((img) => (
              <div key={img.id} className={styles.generatedImageItem}>
                <img
                  src={`data:${img.mimeType};base64,${img.base64}`}
                  alt={img.prompt}
                  className={styles.generatedImagePreview}
                />
                <div className={styles.generatedImageActions}>
                  <button
                    onClick={() => downloadGeneratedImage(img)}
                    title="Download image"
                    className={styles.imageActionButton}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </button>
                  <button
                    onClick={() => useAsReference(img)}
                    title="Use as reference"
                    className={styles.imageActionButton}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </button>
                  <button
                    onClick={() => removeGeneratedImage(img.id)}
                    title="Remove"
                    className={styles.imageActionButton}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {referenceImages.length > 0 && (
        <div className={styles.referenceImagesContainer}>
          {referenceImages.map((img) => (
            <div key={img.id} className={styles.referenceImageItem}>
              <img
                src={`data:${img.mimeType};base64,${img.base64}`}
                alt={img.name}
                className={styles.referenceImagePreview}
              />
              <button
                className={styles.imageTypeButton}
                onClick={() => cycleImageType(img.id)}
                title="Click to change type: Reference → First Frame → Last Frame"
              >
                {getImageTypeLabel(img.imageType)}
              </button>
              <button
                className={styles.removeImageButton}
                onClick={() => removeReferenceImage(img.id)}
                title="Remove image"
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
        <div className={styles.buttonStack}>
          <button
            className={`${styles.modeToggleButton} ${generationMode === 'image' ? styles.imageMode : ''}`}
            onClick={() => setGenerationMode(generationMode === 'video' ? 'image' : 'video')}
            title={generationMode === 'video' ? 'Switch to image generation' : 'Switch to video generation'}
            disabled={isGenerating}
          >
            {generationMode === 'video' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            )}
          </button>
          {generationMode === 'video' && (
            <button
              className={`${styles.systemPromptButton} ${hasSystemPrompt ? styles.active : ''}`}
              onClick={() => setShowSystemPromptModal(true)}
              title={hasSystemPrompt ? `System prompt: ${systemPrompt}` : 'Add system prompt'}
            >
              ✦
            </button>
          )}
          <button
            className={`${styles.attachButton} ${referenceImages.length > 0 ? styles.active : ''}`}
            onClick={() => fileInputRef.current?.click()}
            title="Attach reference images"
            disabled={isGenerating}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </button>
        </div>
        <textarea
          ref={textareaRef}
          placeholder="Type a message..."
          className={styles.input}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isGenerating}
          rows={2}
        />
        <button
          className={styles.sendButton}
          onClick={handleSend}
          disabled={isGenerating || !inputValue.trim()}
          title={isGenerating ? 'Generating...' : 'Send'}
        >
          {isGenerating ? (
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

      {showSystemPromptModal && (
        <div className={styles.modalOverlay} onClick={() => setShowSystemPromptModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.promptSection}>
              <label className={styles.promptLabel}>System Prompt</label>
              <textarea
                className={styles.systemPromptInput}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="e.g., 'A cinematic shot of...', 'In the style of...'"
                rows={3}
              />
            </div>
            <div className={styles.promptSection}>
              <label className={styles.promptLabel}>Negative Prompt</label>
              <textarea
                className={styles.systemPromptInput}
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder="e.g., 'blurry, low quality, distorted faces...'"
                rows={3}
              />
            </div>
            <div className={styles.modalButtons}>
              <button
                className={styles.modalButtonClear}
                onClick={() => {
                  setSystemPrompt('')
                  setNegativePrompt('')
                }}
              >
                Clear All
              </button>
              <button
                className={styles.modalButtonSave}
                onClick={() => setShowSystemPromptModal(false)}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
