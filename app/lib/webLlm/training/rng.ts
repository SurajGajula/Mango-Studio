export type Rng = {
  next: () => number
  int: (min: number, max: number) => number
  pick: <T>(items: T[]) => T
  shuffle: <T>(items: T[]) => T[]
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0
  const next = () => {
    state = (1664525 * state + 1013904223) >>> 0
    return state / 0x100000000
  }
  return {
    next,
    int(min, max) {
      return Math.floor(next() * (max - min + 1)) + min
    },
    pick(items) {
      return items[Math.floor(next() * items.length)]
    },
    shuffle(items) {
      const copy = [...items]
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1))
        ;[copy[i], copy[j]] = [copy[j], copy[i]]
      }
      return copy
    },
  }
}
