import { create } from 'zustand'

interface SelectionStore {
  selectedVideoId: string | null
  selectedImageId: string | null
  selectedTextId: string | null
  setSelectedVideoId: (id: string | null) => void
  setSelectedImageId: (id: string | null) => void
  setSelectedTextId: (id: string | null) => void
}

export const useSelectionStore = create<SelectionStore>((set) => ({
  selectedVideoId: null,
  selectedImageId: null,
  selectedTextId: null,
  setSelectedVideoId: (id) => set({ selectedVideoId: id }),
  setSelectedImageId: (id) => set({ selectedImageId: id }),
  setSelectedTextId: (id) => set({ selectedTextId: id }),
}))
