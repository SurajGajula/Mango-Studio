import { create } from 'zustand'
import { ManifestStore } from './manifest/types'
export * from './manifest/types'
import { createVideoSlice } from './manifest/videoSlice'
import { createImageSlice } from './manifest/imageSlice'
import { createTextSlice } from './manifest/textSlice'
import { createAudioSlice } from './manifest/audioSlice'
import { createEffectSlice } from './manifest/effectSlice'
import { createHistorySlice } from './manifest/historySlice'
import { createGeneralSlice } from './manifest/generalSlice'

export const useManifestStore = create<ManifestStore>((set, get) => ({
  videos: [],
  images: [],
  texts: [],
  audios: [],
  ...createGeneralSlice(set, get),
  ...createVideoSlice(set, get),
  ...createImageSlice(set, get),
  ...createTextSlice(set, get),
  ...createAudioSlice(set, get),
  ...createEffectSlice(set, get),
  ...createHistorySlice(set, get),
}))
