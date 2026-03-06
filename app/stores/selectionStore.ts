import { create } from 'zustand'

interface SelectionStore {
  selectedVideoId: string | null
  selectedImageId: string | null
  setSelectedVideoId: (id: string | null) => void
  setSelectedImageId: (id: string | null) => void
}

export const useSelectionStore = create<SelectionStore>((set) => ({
  selectedVideoId: null,
  selectedImageId: null,
  setSelectedVideoId: (id) => set({ selectedVideoId: id }),
  setSelectedImageId: (id) => set({ selectedImageId: id }),
}))
