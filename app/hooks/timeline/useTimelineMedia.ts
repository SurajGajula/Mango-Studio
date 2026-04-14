import { useCallback } from 'react'
import { addImageAtCurrentPlayhead } from '@/app/lib/addImageAtPlayhead'
import { addAudioToTimelineAtPlayhead, addVideoToTimelineAtPlayhead } from '@/app/lib/timelineMediaInsert'
import { getOrCreateObjectURLForFile } from '@/app/lib/fileObjectUrlCache'

export function useTimelineMedia() {
  const uploadToAccountLibrary = useCallback(async (file: File, durationSeconds?: number) => {
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
  }, [])

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    for (const file of Array.from(files)) {
      if (file.type.startsWith('video/')) {
        const blobUrl = getOrCreateObjectURLForFile(file)
        const videoElement = document.createElement('video')
        videoElement.src = blobUrl
        await new Promise<void>((resolve, reject) => {
          videoElement.onloadedmetadata = () => resolve()
          videoElement.onerror = () => reject(new Error('Unable to read video metadata'))
        })
        const duration = Number(videoElement.duration) || 0
        if (duration > 600) {
          alert('Video uploads must be under 10 minutes.')
          continue
        }
        await uploadToAccountLibrary(file, duration)
        const title = file.name.replace(/\.[^.]+$/, '').substring(0, 50)
        await addVideoToTimelineAtPlayhead(blobUrl, title)
      } else if (file.type.startsWith('image/')) {
        const blobUrl = getOrCreateObjectURLForFile(file)
        await uploadToAccountLibrary(file)
        await addImageAtCurrentPlayhead(blobUrl, file.name)
      } else if (file.type.startsWith('audio/')) {
        const blobUrl = getOrCreateObjectURLForFile(file)
        try {
          const arrayBuffer = await file.arrayBuffer()
          const audioCtx = new AudioContext()
          const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
          await audioCtx.close()
          const audioDuration = audioBuffer.duration
          if (audioDuration > 600) {
            alert('Audio uploads must be under 10 minutes.')
            continue
          }
          await uploadToAccountLibrary(file, audioDuration)
          await addAudioToTimelineAtPlayhead(blobUrl, file.name, audioDuration)
        } catch {
        }
      }
    }

    e.target.value = ''
  }, [
    uploadToAccountLibrary,
  ])

  return { handleFileSelect }
}
