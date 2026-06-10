export type VeoDurationSeconds = 4 | 6 | 8

export const VEO_MAX_SPEECH_SECONDS = 8

export function veoDurationForAudioSeconds(seconds: number): VeoDurationSeconds {
  if (seconds <= 0) {
    throw new Error('Audio has no playable duration.')
  }
  if (seconds > VEO_MAX_SPEECH_SECONDS) {
    throw new Error(`Audio must be ${VEO_MAX_SPEECH_SECONDS} seconds or less for talking animation.`)
  }
  if (seconds <= 4) return 4
  if (seconds <= 6) return 6
  return 8
}
