import { generateId } from '@/app/lib/idUtils'

export type MediaKeyframe = {
  id: string
  t: number
  cropSx: number
  cropSy: number
  cropSw: number
  cropSh: number
  zoomIntensity: number
  x?: number
  y?: number
  width?: number
  height?: number
}

export type AudioMark = {
  id: string
  t: number
}

export function normalizeAudioMarks(marks: unknown): AudioMark[] {
  if (!Array.isArray(marks)) return []
  return marks.map((entry) => {
    if (typeof entry === 'number') {
      return { id: generateId('amark'), t: entry }
    }
    const m = entry as Partial<AudioMark>
    return {
      id: typeof m.id === 'string' ? m.id : generateId('amark'),
      t: typeof m.t === 'number' ? m.t : 0,
    }
  })
}
