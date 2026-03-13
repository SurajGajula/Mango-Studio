import { TextClass } from '@/app/models/TextClass'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { ManifestStore } from './types'

export const createTextSlice = (set: any, get: any) => ({
  addText: (text: TextClass) => {
    useSelectionStore.getState().setSelectedTextId(text.id)
    set((state: ManifestStore) => ({ texts: [...state.texts, text] }))
    get().pushHistory()
  },

  updateText: (id: string, updates: Partial<TextClass>) => {
    set((state: ManifestStore) => ({
      texts: state.texts.map((t) =>
        t.id === id ? t.copy(updates) : t
      ),
    }))
  },

  removeText: (id: string) => {
    const { selectedTextId, setSelectedTextId } = useSelectionStore.getState()
    if (selectedTextId === id) setSelectedTextId(null)
    set((s: ManifestStore) => ({ texts: s.texts.filter((t) => t.id !== id) }))
    get().pushHistory()
  },

  splitText: (id: string, playbackTime: number) => {
    const state = get()
    const text = state.texts.find((t: TextClass) => t.id === id)
    if (!text) return
    if (playbackTime <= text.startTime + 0.05 || playbackTime >= text.endTime - 0.05) return

    const firstHalf = text.copy({ endTime: playbackTime })
    const secondHalf = text.copy({
      id: `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      startTime: playbackTime,
      createdAt: new Date()
    })

    useSelectionStore.getState().setSelectedTextId(secondHalf.id)
    set((s: ManifestStore) => ({
      texts: s.texts.map((t) => (t.id === id ? firstHalf : t)).concat([secondHalf]),
    }))
    set({ playbackTime })
    get().pushHistory()
  },
})
