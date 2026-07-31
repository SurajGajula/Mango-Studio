import { useCallback } from 'react'
import { addImageAtCurrentPlayhead } from '@/app/lib/addImageAtPlayhead'
import { addAudioToTimelineAtPlayhead, addVideoToTimelineAtPlayhead } from '@/app/lib/timelineMediaInsert'
import { getOrCreateObjectURLForFile, revokeFileObjectUrl } from '@/app/lib/fileObjectUrlCache'
import { accountMediaAssetPlaybackUrl, uploadToAccountLibrary, validateMediaDuration } from '@/app/lib/timeline'

export function useTimelineMedia() {
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    for (const file of Array.from(files)) {
      if (file.type.startsWith('video/')) {
        const blobUrl = getOrCreateObjectURLForFile(file)
        const videoElement = document.createElement('video')
        videoElement.preload = 'metadata'
        videoElement.src = blobUrl
        await new Promise<void>((resolve, reject) => {
          videoElement.onloadedmetadata = () => resolve()
          videoElement.onerror = () => reject(new Error('Unable to read video metadata'))
        })
        const duration = Number(videoElement.duration) || 0
        videoElement.removeAttribute('src')
        videoElement.load()
        if (!validateMediaDuration(duration, 'Video')) {
          revokeFileObjectUrl(blobUrl)
          continue
        }
        const assetId = await uploadToAccountLibrary(file, duration)
        const playbackUrl = assetId ? accountMediaAssetPlaybackUrl(assetId) : blobUrl
        const title = file.name.replace(/\.[^.]+$/, '').substring(0, 50)
        await addVideoToTimelineAtPlayhead(playbackUrl, title)
        if (playbackUrl !== blobUrl) revokeFileObjectUrl(blobUrl)
      } else if (file.type.startsWith('image/')) {
        const blobUrl = getOrCreateObjectURLForFile(file)
        const assetId = await uploadToAccountLibrary(file)
        const playbackUrl = assetId ? accountMediaAssetPlaybackUrl(assetId) : blobUrl
        await addImageAtCurrentPlayhead(playbackUrl, file.name)
        if (playbackUrl !== blobUrl) revokeFileObjectUrl(blobUrl)
      } else if (file.type.startsWith('audio/')) {
        const blobUrl = getOrCreateObjectURLForFile(file)
        try {
          const arrayBuffer = await file.arrayBuffer()
          const audioCtx = new AudioContext()
          const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
          await audioCtx.close()
          const audioDuration = audioBuffer.duration
          if (!validateMediaDuration(audioDuration, 'Audio')) {
            revokeFileObjectUrl(blobUrl)
            continue
          }
          const assetId = await uploadToAccountLibrary(file, audioDuration)
          const playbackUrl = assetId ? accountMediaAssetPlaybackUrl(assetId) : blobUrl
          await addAudioToTimelineAtPlayhead(playbackUrl, file.name, audioDuration)
          if (playbackUrl !== blobUrl) revokeFileObjectUrl(blobUrl)
        } catch {
        }
      }
    }

    e.target.value = ''
  }, [])

  return { handleFileSelect }
}
