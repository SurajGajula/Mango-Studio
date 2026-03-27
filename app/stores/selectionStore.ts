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
  contextMenu: ContextMenuState
  setSelectedVideoId: (id: string | null) => void
  setSelectedImageId: (id: string | null) => void
  setSelectedTextId: (id: string | null) => void
  setSelectedAudioId: (id: string | null) => void
  setSelectedEffectId: (id: string | null) => void
  clearSelection: () => void
  selectVideo: (id: string | null) => void
  selectImage: (id: string | null) => void
  selectText: (id: string | null) => void
  selectAudio: (id: string | null) => void
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
  contextMenu: {
    isOpen: false,
    x: 0,
    y: 0,
    itemId: null,
    itemType: null,
  },
  setSelectedVideoId: (id) => set({ selectedVideoId: id }),
  setSelectedImageId: (id) => set({ selectedImageId: id }),
  setSelectedTextId: (id) => set({ selectedTextId: id }),
  setSelectedAudioId: (id) => set({ selectedAudioId: id }),
  setSelectedEffectId: (id) => set({ selectedEffectId: id }),
  clearSelection: () => set({
    selectedVideoId: null,
    selectedImageId: null,
    selectedTextId: null,
    selectedAudioId: null,
    selectedEffectId: null,
  }),
  selectVideo: (id) => set({
    selectedVideoId: id,
    selectedImageId: null,
    selectedTextId: null,
    selectedAudioId: null,
    selectedEffectId: null,
  }),
  selectImage: (id) => set({
    selectedVideoId: null,
    selectedImageId: id,
    selectedTextId: null,
    selectedAudioId: null,
    selectedEffectId: null,
  }),
  selectText: (id) => set({
    selectedVideoId: null,
    selectedImageId: null,
    selectedTextId: id,
    selectedAudioId: null,
    selectedEffectId: null,
  }),
  selectAudio: (id) => set({
    selectedVideoId: null,
    selectedImageId: null,
    selectedTextId: null,
    selectedAudioId: id,
    selectedEffectId: null,
  }),
  selectEffect: (id) => set({
    selectedVideoId: null,
    selectedImageId: null,
    selectedTextId: null,
    selectedAudioId: null,
    selectedEffectId: id,
  }),
  setContextMenu: (menu) => set({ contextMenu: menu }),
  closeContextMenu: () => set((state) => ({ 
    contextMenu: { ...state.contextMenu, isOpen: false } 
  })),
}))
