import { EffectClass } from '@/app/models/EffectClass'
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

  removeEffect: (id: string) => {
    set((s: ManifestStore) => ({ effects: s.effects.filter((e) => e.id !== id) }))
    get().pushHistory()
  },

  removeAllEffects: () => {
    set({ effects: [] })
    get().pushHistory()
  },
})
