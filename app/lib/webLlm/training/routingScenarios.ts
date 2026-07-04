import type { LocalChatManifest } from '@/app/lib/webLlm/buildLocalManifestContext'
import type { LocalRoutePromptResponse } from '@/app/lib/webLlm/localChatTypes'
import { resolveLocalRuleFallbackIntent } from '@/app/lib/webLlm/localRuleRouter'
import { looksLikeTimelineEditRequest } from '@/app/lib/webLlm/localLlmRouteProcess'
import type { Rng } from '@/app/lib/webLlm/training/rng'

export type RoutingScenarioContext = {
  manifest: LocalChatManifest
  rng: Rng
}

export type RoutingTrainingScenario = {
  id: string
  minVideos?: number
  minImages?: number
  minAudios?: number
  minTexts?: number
  build: (ctx: RoutingScenarioContext) => { prompt: string } | null
}

function videoCount(manifest: LocalChatManifest): number {
  return manifest.videos?.length ?? 0
}

function imageCount(manifest: LocalChatManifest): number {
  return manifest.images?.length ?? 0
}

function audioCount(manifest: LocalChatManifest): number {
  return manifest.audios?.length ?? 0
}

function textCount(manifest: LocalChatManifest): number {
  return manifest.texts?.length ?? 0
}

export const ROUTING_TRAINING_SCENARIOS: RoutingTrainingScenario[] = [
  {
    id: 'mute_all_videos',
    minVideos: 2,
    build: () => ({ prompt: 'Mute all videos on the timeline.' }),
  },
  {
    id: 'mute_single_video',
    minVideos: 2,
    build: ({ rng, manifest }) => {
      const number = rng.int(1, videoCount(manifest))
      return { prompt: `Mute video ${number} only.` }
    },
  },
  {
    id: 'unmute_all_videos',
    minVideos: 2,
    build: () => ({ prompt: 'Unmute all videos.' }),
  },
  {
    id: 'set_video_opacity',
    minVideos: 1,
    build: ({ rng, manifest }) => {
      const number = rng.int(1, videoCount(manifest))
      const percent = rng.pick([25, 40, 50, 75])
      return { prompt: `Set video ${number} opacity to ${percent}%.` }
    },
  },
  {
    id: 'delete_audio',
    minAudios: 1,
    build: () => ({ prompt: 'Delete the audio.' }),
  },
  {
    id: 'delete_image_numbered',
    minImages: 2,
    build: ({ rng, manifest }) => {
      const number = rng.int(1, imageCount(manifest))
      return { prompt: `Delete image ${number}.` }
    },
  },
  {
    id: 'add_flash_all_videos',
    minVideos: 3,
    build: () => ({ prompt: 'Add flash transitions to every video.' }),
  },
  {
    id: 'remove_flash_except_video',
    minVideos: 4,
    build: ({ rng, manifest }) => {
      const exceptNumber = rng.int(2, videoCount(manifest))
      return {
        prompt: `Remove the flash transitions from all videos except video ${exceptNumber}.`,
      }
    },
  },
  {
    id: 'remove_all_transitions_videos',
    minVideos: 3,
    build: () => ({ prompt: 'Remove transitions from all videos.' }),
  },
  {
    id: 'add_fade_image',
    minImages: 1,
    build: ({ rng, manifest }) => {
      const number = rng.int(1, imageCount(manifest))
      return { prompt: `Add a fade transition to image ${number}.` }
    },
  },
  {
    id: 'add_zoom_in_all_videos',
    minVideos: 3,
    build: () => ({ prompt: 'Add zoom in animation to every video.' }),
  },
  {
    id: 'add_shake_image',
    minImages: 1,
    build: ({ rng, manifest }) => {
      const number = rng.int(1, imageCount(manifest))
      return { prompt: `Add shake animation to image ${number}.` }
    },
  },
  {
    id: 'set_animation_duration',
    minVideos: 1,
    build: ({ rng, manifest }) => {
      const number = rng.int(1, videoCount(manifest))
      const seconds = rng.pick([1, 1.5, 2, 3])
      return { prompt: `Set video ${number} animation duration to ${seconds} seconds.` }
    },
  },
  {
    id: 'set_shake_intensity',
    minImages: 1,
    build: ({ rng, manifest }) => {
      const number = rng.int(1, imageCount(manifest))
      const percent = rng.pick([40, 60, 80])
      return { prompt: `Set image ${number} shake intensity to ${percent}%.` }
    },
  },
  {
    id: 'set_transition_duration',
    minVideos: 1,
    build: ({ rng, manifest }) => {
      const number = rng.int(1, videoCount(manifest))
      const seconds = rng.pick([0.5, 1, 1.5])
      return { prompt: `Set video ${number} transition duration to ${seconds} seconds.` }
    },
  },
  {
    id: 'remove_animations_all_videos',
    minVideos: 3,
    build: () => ({ prompt: 'Remove animations from all videos.' }),
  },
  {
    id: 'replace_every_other_blue',
    minImages: 4,
    build: () => ({
      prompt: 'Replace every other image with a blue one using the blue shape.',
    }),
  },
  {
    id: 'replace_image_numbered_red',
    minImages: 2,
    build: ({ rng, manifest }) => {
      const number = rng.int(1, imageCount(manifest))
      return { prompt: `Replace image ${number} with red.` }
    },
  },
  {
    id: 'move_video_row',
    minVideos: 1,
    build: ({ rng, manifest }) => {
      const number = rng.int(1, videoCount(manifest))
      const row = rng.pick([1, 2, 3])
      return { prompt: `Move video ${number} to row ${row}.` }
    },
  },
  {
    id: 'move_image_row',
    minImages: 1,
    build: ({ rng, manifest }) => {
      const number = rng.int(1, imageCount(manifest))
      const row = rng.pick([1, 2, 3])
      return { prompt: `Move image ${number} to row ${row}.` }
    },
  },
  {
    id: 'set_image_duration',
    minImages: 1,
    build: ({ rng, manifest }) => {
      const number = rng.int(1, imageCount(manifest))
      const seconds = rng.pick([2, 3, 4, 5])
      return { prompt: `Set image ${number} duration to ${seconds} seconds.` }
    },
  },
  {
    id: 'set_video_duration',
    minVideos: 1,
    build: ({ rng, manifest }) => {
      const number = rng.int(1, videoCount(manifest))
      const seconds = rng.pick([2, 3, 4, 5])
      return { prompt: `Set video ${number} duration to ${seconds} seconds.` }
    },
  },
  {
    id: 'move_image_start',
    minImages: 1,
    build: ({ rng, manifest }) => {
      const number = rng.int(1, imageCount(manifest))
      const start = rng.pick([0, 1, 2, 3])
      return { prompt: `Move image ${number} to start at ${start} seconds.` }
    },
  },
  {
    id: 'move_video_start',
    minVideos: 1,
    build: ({ rng, manifest }) => {
      const number = rng.int(1, videoCount(manifest))
      const start = rng.pick([0, 3, 5, 8])
      return { prompt: `Move video ${number} to start at ${start} seconds.` }
    },
  },
  {
    id: 'set_video_playback_speed',
    minVideos: 1,
    build: ({ rng, manifest }) => {
      const number = rng.int(1, videoCount(manifest))
      const speed = rng.pick([0.5, 0.75, 1.5, 2])
      return { prompt: `Set video ${number} playback speed to ${speed}x.` }
    },
  },
  {
    id: 'slow_video_half_speed',
    minVideos: 1,
    build: ({ rng, manifest }) => {
      const number = rng.int(1, videoCount(manifest))
      return { prompt: `Slow down video ${number} to half speed.` }
    },
  },
  {
    id: 'set_image_opacity',
    minImages: 1,
    build: ({ rng, manifest }) => {
      const number = rng.int(1, imageCount(manifest))
      const percent = rng.pick([30, 50, 70])
      return { prompt: `Set image ${number} opacity to ${percent}%.` }
    },
  },
  {
    id: 'delete_video_numbered',
    minVideos: 2,
    build: ({ rng, manifest }) => {
      const number = rng.int(1, videoCount(manifest))
      return { prompt: `Delete video ${number}.` }
    },
  },
  {
    id: 'delete_text_numbered',
    minTexts: 1,
    build: ({ rng, manifest }) => {
      const number = rng.int(1, textCount(manifest))
      return { prompt: `Delete text ${number}.` }
    },
  },
  {
    id: 'split_image_half',
    minImages: 1,
    build: ({ rng, manifest }) => {
      const number = rng.int(1, imageCount(manifest))
      return { prompt: `Split image ${number} in half.` }
    },
  },
  {
    id: 'split_video_half',
    minVideos: 1,
    build: ({ rng, manifest }) => {
      const number = rng.int(1, videoCount(manifest))
      return { prompt: `Split video ${number} in half.` }
    },
  },
  {
    id: 'split_image_fourths',
    minImages: 1,
    build: ({ rng, manifest }) => {
      const number = rng.int(1, imageCount(manifest))
      return { prompt: `Split image ${number} into 4 parts.` }
    },
  },
  {
    id: 'duplicate_images_range',
    minImages: 3,
    build: ({ rng, manifest }) => {
      const last = imageCount(manifest)
      const first = rng.int(1, Math.max(1, last - 2))
      const end = rng.int(first + 1, last)
      return { prompt: `Duplicate images ${first} to ${end}.` }
    },
  },
  {
    id: 'duplicate_videos_range',
    minVideos: 3,
    build: ({ rng, manifest }) => {
      const last = videoCount(manifest)
      const first = rng.int(1, Math.max(1, last - 2))
      const end = rng.int(first + 1, last)
      return { prompt: `Duplicate videos ${first} to ${end}.` }
    },
  },
  {
    id: 'crop_image_16_9',
    minImages: 1,
    build: ({ rng, manifest }) => {
      const number = rng.int(1, imageCount(manifest))
      return { prompt: `Set image ${number} crop to 16:9.` }
    },
  },
  {
    id: 'crop_video_1_1',
    minVideos: 1,
    build: ({ rng, manifest }) => {
      const number = rng.int(1, videoCount(manifest))
      return { prompt: `Crop video ${number} to 1:1.` }
    },
  },
  {
    id: 'add_grainy_effect',
    minImages: 1,
    build: ({ rng }) => {
      const start = rng.int(0, 2)
      const end = start + rng.int(3, 6)
      return { prompt: `Add grainy effect from ${start} to ${end} seconds.` }
    },
  },
  {
    id: 'add_vignette_effect',
    minVideos: 1,
    build: ({ rng }) => {
      const start = rng.int(0, 1)
      const end = start + rng.int(4, 8)
      return { prompt: `Add vignette from ${start} to ${end} seconds.` }
    },
  },
  {
    id: 'step_growth_image',
    minImages: 1,
    build: ({ rng, manifest }) => {
      const number = rng.int(1, imageCount(manifest))
      const steps = rng.pick([3, 4, 5])
      return { prompt: `Make image ${number} grow in ${steps} steps.` }
    },
  },
  {
    id: 'normalize_audio_volumes',
    minAudios: 3,
    build: ({ rng, manifest }) => {
      const ref = 1
      const targets = rng.pick([
        [2, 3],
        [2],
        [2, 3, audioCount(manifest)],
      ])
      const targetList = targets.filter((n) => n !== ref && n <= audioCount(manifest))
      if (targetList.length === 0) {
        return { prompt: 'Match audio 2 volume to audio 1.' }
      }
      if (targetList.length === 1) {
        return { prompt: `Match audio ${targetList[0]} volume to audio ${ref}.` }
      }
      return { prompt: `Make audios ${targetList.join(' and ')} the same volume as audio ${ref}.` }
    },
  },
  {
    id: 'center_text',
    minTexts: 1,
    build: ({ rng, manifest }) => {
      const number = rng.int(1, textCount(manifest))
      return { prompt: `Center text ${number}.` }
    },
  },
  {
    id: 'text_negative_style',
    minTexts: 1,
    build: ({ rng, manifest }) => {
      const number = rng.int(1, textCount(manifest))
      return { prompt: `Make text ${number} negative style.` }
    },
  },
  {
    id: 'add_text_overlay',
    minImages: 1,
    build: ({ rng }) => {
      const start = rng.int(0, 2)
      const end = start + rng.int(2, 4)
      return {
        prompt: `Add text "Hello world" from ${start} to ${end} seconds.`,
      }
    },
  },
  {
    id: 'greeting_no_op',
    minVideos: 1,
    build: () => ({ prompt: 'Hi there! How are you?' }),
  },
]

export function scenarioMatchesManifest(
  scenario: RoutingTrainingScenario,
  manifest: LocalChatManifest
): boolean {
  if (scenario.minVideos && videoCount(manifest) < scenario.minVideos) {
    return false
  }
  if (scenario.minImages && imageCount(manifest) < scenario.minImages) {
    return false
  }
  if (scenario.minAudios && audioCount(manifest) < scenario.minAudios) {
    return false
  }
  if (scenario.minTexts && textCount(manifest) < scenario.minTexts) {
    return false
  }
  return true
}

export function computeRoutingGroundTruth(
  prompt: string,
  manifest: LocalChatManifest
): LocalRoutePromptResponse | null {
  const fallback = resolveLocalRuleFallbackIntent(prompt, manifest)
  if (fallback) {
    return fallback
  }

  const normalized = prompt.toLowerCase().trim()
  if (
    /^(hi|hello|hey)\b/.test(normalized) ||
    (!looksLikeTimelineEditRequest(prompt) && /\b(how are you|good morning)\b/.test(normalized))
  ) {
    return {
      action: 'no_op',
      message: 'Local mode supports timeline edits only.',
    }
  }

  return null
}

export function pickScenarioForManifest(rng: Rng, manifest: LocalChatManifest): RoutingTrainingScenario {
  const eligible = ROUTING_TRAINING_SCENARIOS.filter((scenario) => scenarioMatchesManifest(scenario, manifest))
  if (eligible.length === 0) {
    return ROUTING_TRAINING_SCENARIOS[0]
  }
  return rng.pick(eligible)
}
