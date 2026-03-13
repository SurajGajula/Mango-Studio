import { create } from 'zustand'

interface SelectionStore {
  selectedVideoId: string | null
  selectedImageId: string | null
  selectedTextId: string | null
  selectedAudioId: string | null
  setSelectedVideoId: (id: string | null) => void
  setSelectedImageId: (id: string | null) => void
  setSelectedTextId: (id: string | null) => void
  setSelectedAudioId: (id: string | null) => void
  clearSelection: () => void
  selectVideo: (id: string | null) => void
  selectImage: (id: string | null) => void
  selectText: (id: string | null) => void
  selectAudio: (id: string | null) => void
}

export const useSelectionStore = create<SelectionStore>((set) => ({
  selectedVideoId: null,
  selectedImageId: null,
  selectedTextId: null,
  selectedAudioId: null,
  setSelectedVideoId: (id) => set({ selectedVideoId: id }),
  setSelectedImageId: (id) => set({ selectedImageId: id }),
  setSelectedTextId: (id) => set({ selectedTextId: id }),
  setSelectedAudioId: (id) => set({ selectedAudioId: id }),
  clearSelection: () => set({
    selectedVideoId: null,
    selectedImageId: null,
    selectedTextId: null,
    selectedAudioId: null,
  }),
  selectVideo: (id) => set({
    selectedVideoId: id,
    selectedImageId: null,
    selectedTextId: null,
    selectedAudioId: null,
  }),
  selectImage: (id) => set({
    selectedVideoId: null,
    selectedImageId: id,
    selectedTextId: null,
    selectedAudioId: null,
  }),
  selectText: (id) => set({
    selectedVideoId: null,
    selectedImageId: null,
    selectedTextId: id,
    selectedAudioId: null,
  }),
  selectAudio: (id) => set({
    selectedVideoId: null,
    selectedImageId: null,
    selectedTextId: null,
    selectedAudioId: id,
  }),
}))
