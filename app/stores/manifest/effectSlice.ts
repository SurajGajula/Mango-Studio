import { EffectClass } from '@/app/models/EffectClass'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { generateId } from '@/app/lib/idUtils'
import { ManifestStore } from './types'

export const createEffectSlice = (set: any, get: any) => ({
  effects: [],
  addEffect: (effect: EffectClass) => {
    set((s: ManifestStore) => ({ effects: [...s.effects, effect] }))
    get().pushHistory()
  },

  updateEffect: (id: string, updates: Partial<EffectClass>) => {
    set((s: ManifestStore) => ({
      effects: s.effects.map((e) =>
        e.id === id ? e.copy(updates) : e
      ),
    }))
    get().pushHistory()
  },

  splitEffect: (id: string, playbackTime: number) => {
    const state = get()
    const effect = state.effects.find((e: EffectClass) => e.id === id)
    if (!effect) return

    if (playbackTime <= effect.startTime + 0.05 || playbackTime >= effect.endTime - 0.05) return

    const firstHalf = effect.copy({ endTime: playbackTime })
    const secondHalf = effect.copy({
      id: generateId('effect'),
      startTime: playbackTime,
      createdAt: new Date(),
    })

    useSelectionStore.getState().setSelectedEffectId(secondHalf.id)
    set((s: ManifestStore) => ({
      effects: s.effects.map((e) => (e.id === id ? firstHalf : e)).concat([secondHalf]),
    }))
    set({ playbackTime })
    get().pushHistory()
  },

  removeEffect: (id: string) => {
    set((s: ManifestStore) => ({ effects: s.effects.filter((e) => e.id !== id) }))
    get().pushHistory()
  },

  removeAllEffects: () => {
    set({ effects: [] })
    get().pushHistory()
  },
})
