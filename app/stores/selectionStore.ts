import { create } from 'zustand'

interface ContextMenuState {
  isOpen: boolean
  x: number
  y: number
  itemId: string | null
  itemType: 'video' | 'image' | 'text' | 'audio' | 'effect' | null
}

interface SelectionStore {
  selectedVideoId: string | null
  selectedImageId: string | null
  selectedTextId: string | null
  selectedAudioId: string | null
  selectedEffectId: string | null
  selectedAudioMarkId: string | null
  selectedKeyframeId: string | null
  contextMenu: ContextMenuState
  setSelectedVideoId: (id: string | null) => void
  setSelectedImageId: (id: string | null) => void
  setSelectedTextId: (id: string | null) => void
  setSelectedAudioId: (id: string | null) => void
  setSelectedEffectId: (id: string | null) => void
  setSelectedAudioMarkId: (id: string | null) => void
  setSelectedKeyframeId: (id: string | null) => void
  clearSelection: () => void
  selectVideo: (id: string | null, keyframeId?: string | null) => void
  selectImage: (id: string | null, keyframeId?: string | null) => void
  selectText: (id: string | null) => void
  selectAudio: (id: string | null, audioMarkId?: string | null) => void
  selectEffect: (id: string | null) => void
  setContextMenu: (menu: ContextMenuState) => void
  closeContextMenu: () => void
}

export const useSelectionStore = create<SelectionStore>((set) => ({
  selectedVideoId: null,
  selectedImageId: null,
  selectedTextId: null,
  selectedAudioId: null,
  selectedEffectId: null,
  selectedAudioMarkId: null,
  selectedKeyframeId: null,
  contextMenu: {
    isOpen: false,
    x: 0,
    y: 0,
    itemId: null,
    itemType: null,
  },
  setSelectedVideoId: (id) =>
    set({ selectedVideoId: id, selectedKeyframeId: null, selectedAudioMarkId: null }),
  setSelectedImageId: (id) =>
    set({ selectedImageId: id, selectedKeyframeId: null, selectedAudioMarkId: null }),
  setSelectedTextId: (id) =>
    set({ selectedTextId: id, selectedKeyframeId: null, selectedAudioMarkId: null }),
  setSelectedAudioId: (id) =>
    set({ selectedAudioId: id, selectedAudioMarkId: null, selectedKeyframeId: null }),
  setSelectedEffectId: (id) =>
    set({ selectedEffectId: id, selectedKeyframeId: null, selectedAudioMarkId: null }),
  setSelectedAudioMarkId: (id) => set({ selectedAudioMarkId: id }),
  setSelectedKeyframeId: (id) => set({ selectedKeyframeId: id }),
  clearSelection: () =>
    set({
      selectedVideoId: null,
      selectedImageId: null,
      selectedTextId: null,
      selectedAudioId: null,
      selectedEffectId: null,
      selectedAudioMarkId: null,
      selectedKeyframeId: null,
    }),
  selectVideo: (id, keyframeId = null) =>
    set({
      selectedVideoId: id,
      selectedImageId: null,
      selectedTextId: null,
      selectedAudioId: null,
      selectedEffectId: null,
      selectedAudioMarkId: null,
      selectedKeyframeId: keyframeId,
    }),
  selectImage: (id, keyframeId = null) =>
    set({
      selectedVideoId: null,
      selectedImageId: id,
      selectedTextId: null,
      selectedAudioId: null,
      selectedEffectId: null,
      selectedAudioMarkId: null,
      selectedKeyframeId: keyframeId,
    }),
  selectText: (id) =>
    set({
      selectedVideoId: null,
      selectedImageId: null,
      selectedTextId: id,
      selectedAudioId: null,
      selectedEffectId: null,
      selectedAudioMarkId: null,
      selectedKeyframeId: null,
    }),
  selectAudio: (id, audioMarkId = null) =>
    set({
      selectedVideoId: null,
      selectedImageId: null,
      selectedTextId: null,
      selectedAudioId: id,
      selectedEffectId: null,
      selectedAudioMarkId: audioMarkId,
      selectedKeyframeId: null,
    }),
  selectEffect: (id) =>
    set({
      selectedVideoId: null,
      selectedImageId: null,
      selectedTextId: null,
      selectedAudioId: null,
      selectedEffectId: id,
      selectedAudioMarkId: null,
      selectedKeyframeId: null,
    }),
  setContextMenu: (menu) => set({ contextMenu: menu }),
  closeContextMenu: () =>
    set((state) => ({
      contextMenu: { ...state.contextMenu, isOpen: false },
    })),
}))
