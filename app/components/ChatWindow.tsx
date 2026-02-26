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

export default function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [showSystemPromptModal, setShowSystemPromptModal] = useState(false)
  const addVideo = useManifestStore((state) => state.addVideo)
  const aspectRatio = useManifestStore((state) => state.aspectRatio)

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
      text: 'Generating video...',
      isUser: false,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, loadingMessage])

    try {
      const response = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: fullPrompt, 
          aspectRatio, 
          negativePrompt: negativePrompt.trim() || undefined 
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
          duration
        )

        addVideo(video)

        const successMessage: Message = {
          id: `success-${Date.now()}`,
          text: 'Video generated successfully!',
          isUser: false,
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, successMessage])
      }
    } catch (error) {
      setMessages((prev) => prev.filter((msg) => msg.id !== loadingMessage.id))

      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        text: `Error: ${error instanceof Error ? error.message : 'Failed to generate video'}`,
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
      const minHeight = 42
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
      <div className={styles.inputContainer}>
        <button
          className={`${styles.systemPromptButton} ${hasSystemPrompt ? styles.active : ''}`}
          onClick={() => setShowSystemPromptModal(true)}
          title={hasSystemPrompt ? `System prompt: ${systemPrompt}` : 'Add system prompt'}
        >
          ✦
        </button>
        <textarea
          ref={textareaRef}
          placeholder="Type a message..."
          className={styles.input}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isGenerating}
          rows={1}
        />
        <button
          className={styles.sendButton}
          onClick={handleSend}
          disabled={isGenerating || !inputValue.trim()}
        >
          {isGenerating ? 'Generating...' : 'Send'}
        </button>
      </div>

      {showSystemPromptModal && (
        <div className={styles.modalOverlay} onClick={() => setShowSystemPromptModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3>Prompt Settings</h3>
            <div className={styles.promptSection}>
              <label className={styles.promptLabel}>System Prompt</label>
              <p className={styles.modalDescription}>
                This text will be prepended to every prompt you send.
              </p>
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
              <p className={styles.modalDescription}>
                Describe what you want to avoid in the generated video.
              </p>
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
