import { VideoClass } from '@/app/models/VideoClass'
import { ImageClass } from '@/app/models/ImageClass'
import { TextClass } from '@/app/models/TextClass'
import { AudioClass } from '@/app/models/AudioClass'
import { EffectClass } from '@/app/models/EffectClass'

export type AspectRatio = '16:9' | '9:16'

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
  playbackTime: number
  isPlaying: boolean
  aspectRatio: AspectRatio
  history: HistoryEntry[]
  historyIndex: number
  pushHistory: () => void
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
  setPlaybackRate: (rate: number) => void
  setAspectRatio: (ratio: AspectRatio) => void
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
  bulkUpdateMainTrackItems: (
    imagePatches: Array<{ id: string; startTime?: number; endTime?: number }>,
    videoTimestampPatches: Array<{ id: string; timestamp: number }>
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
  setItemPlaybackSpeed: (id: string, speed: number) => void
  splitVideoAtTimes: (id: string, times: number[]) => void
  splitImageAtTimes: (id: string, times: number[]) => void
  duplicateItem: (id: string) => void
  effects: EffectClass[]
  addEffect: (effect: EffectClass) => void
  updateEffect: (id: string, updates: Partial<EffectClass>) => void
  removeEffect: (id: string) => void
  removeAllEffects: () => void
  resetStore: () => void
}

export type BlobEntry = { videos: VideoClass[]; images: ImageClass[] }
