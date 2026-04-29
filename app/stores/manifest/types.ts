import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { TextClass } from '@/app/models/TextClass'
import { AudioClass } from '@/app/models/AudioClass'
import { EffectClass } from '@/app/models/EffectClass'

export type AspectRatio = '9:16'

export interface HistoryEntry {
  videos: VideoClass[]
  images: ImageClass[]
  texts: TextClass[]
  audios: AudioClass[]
  effects: EffectClass[]
}

export interface ManifestStore {
  videos: VideoClass[]
  images: ImageClass[]
  texts: TextClass[]
  audios: AudioClass[]
  pendingPrompt: string | null
  pendingVideoReplaceSpeed: {
    videoId: string
    playbackSpeed: number
    speedStart: number
    speedEnd: number
    speedEasing: 'linear' | 'ease'
  } | null
  setPendingVideoReplaceSpeed: (
    value: {
      videoId: string
      playbackSpeed: number
      speedStart: number
      speedEnd: number
      speedEasing: 'linear' | 'ease'
    } | null
  ) => void
  videoReplaceFilePickerRequest: { videoId: string } | null
  setVideoReplaceFilePickerRequest: (value: { videoId: string } | null) => void
  playbackTime: number
  isPlaying: boolean
  isLooping: boolean
  history: HistoryEntry[]
  historyIndex: number
  pushHistory: (opts?: { force?: boolean }) => void
  pauseHistory: () => void
  resumeHistory: () => void
  undo: () => void
  redo: () => void
  addVideo: (video: VideoClass) => void
  updateVideo: (id: string, updates: Partial<VideoClass>) => void
  removeVideo: (id: string) => void
  trimVideo: (id: string, trimStart: number, trimEnd: number, newTimestamp?: number) => void
  splitVideo: (id: string, playbackTime: number) => void
  splitImage: (id: string, playbackTime: number) => void
  recalculateTimestamps: () => void
  getTotalDuration: () => number
  setPendingPrompt: (prompt: string | null) => void
  playbackRate: number
  setPlaybackTime: (time: number) => void
  setIsPlaying: (playing: boolean) => void
  setIsLooping: (looping: boolean) => void
  setPlaybackRate: (rate: number) => void
  addImage: (image: ImageClass) => void
  removeImage: (id: string) => void
  updateImage: (id: string, updates: Partial<ImageClass>) => void
  replaceImageSource: (id: string, newUrl: string, newName: string) => void
  replaceImageWithVideo: (
    imageId: string,
    video: VideoClass
  ) => void
  replaceVideoSource: (id: string, newUrl: string, newTitle: string) => void
  replaceVideoWithImage: (
    videoId: string,
    image: ImageClass
  ) => void
  addText: (text: TextClass) => void
  updateText: (id: string, updates: Partial<TextClass>) => void
  removeText: (id: string) => void
  splitText: (id: string, playbackTime: number) => void
  addAudio: (audio: AudioClass) => void
  updateAudio: (id: string, updates: Partial<AudioClass>) => void
  splitAudio: (id: string, playbackTime: number) => void
  removeAudio: (id: string) => void
  trimAudio: (id: string, trimStart: number, trimEnd: number, startTime?: number) => void
  setItemPlaybackSpeed: (id: string, speed: number, speedStart?: number, speedEnd?: number, speedEasing?: 'linear' | 'ease') => boolean
  splitVideoAtTimes: (id: string, times: number[]) => void
  splitImageAtTimes: (id: string, times: number[]) => void
  duplicateItem: (id: string) => void
  duplicateTimelineRange: (kind: 'image' | 'video', firstNumber: number, lastNumber: number) => void
  effects: EffectClass[]
  addEffect: (effect: EffectClass) => void
  updateEffect: (id: string, updates: Partial<EffectClass>) => void
  removeEffect: (id: string) => void
  removeAllEffects: () => void
  moveItemToRow: (id: string, targetRow: number, newTime?: number) => void
  insertRow: (atIndex: number) => void
  deleteRow: (atIndex: number) => void
  resetStore: () => void
}

export type BlobEntry = { videos: VideoClass[]; images: ImageClass[] }
