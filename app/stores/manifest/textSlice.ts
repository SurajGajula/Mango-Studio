import { TextClass } from '@/app/models/TextClass'
import { generateId } from '@/app/lib/idUtils'
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
      texts: state.texts.map((t) => {
        if (t.id !== id) return t
        if (typeof t.copy === 'function') {
          return t.copy(updates)
        }
        // Fallback for plain objects (e.g. from history or serialization)
        return new TextClass(
          updates.id ?? t.id,
          updates.content ?? t.content,
          updates.startTime ?? t.startTime,
          updates.endTime ?? t.endTime,
          updates.x ?? t.x,
          updates.y ?? t.y,
          updates.width ?? t.width,
          updates.height ?? t.height,
          updates.opacity ?? t.opacity,
          updates.fontSize ?? t.fontSize,
          updates.fontFamily ?? t.fontFamily,
          updates.color ?? t.color,
          updates.fontWeight ?? t.fontWeight,
          updates.textAlign ?? t.textAlign,
          updates.animation ?? t.animation,
          updates.style ?? t.style,
          updates.createdAt ?? t.createdAt,
          updates.row ?? t.row
        )
      }),
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

  splitTextAtTimes: (id: string, times: number[]) => {
    const state = get()
    const text = state.texts.find((t: TextClass) => t.id === id)
    if (!text) return

    const epsilon = 1e-6
    const validTimes = times
      .filter((t) => t > text.startTime + epsilon && t < text.endTime - epsilon)
      .sort((a, b) => a - b)
      .filter((t, i, arr) => i === 0 || t - arr[i - 1] > epsilon)

    if (validTimes.length === 0) return

    const boundaries = [text.startTime, ...validTimes, text.endTime]
    const newSegments: TextClass[] = boundaries.slice(0, -1).map((segStart, i) => {
      const segEnd = boundaries[i + 1]
      return text.copy({
        id: i === 0 ? text.id : generateId('text'),
        startTime: segStart,
        endTime: segEnd,
        createdAt: i === 0 ? text.createdAt : new Date(),
      })
    })

    useSelectionStore.getState().setSelectedTextId(newSegments[newSegments.length - 1].id)
    set((s: ManifestStore) => ({
      texts: s.texts.filter((t) => t.id !== id).concat(newSegments),
    }))
    get().pushHistory()
  },
})
