import type { WebLlmChatTool } from '@/app/lib/webLlm/webLlmTestTools'
import {
  WEB_LLM_ADD_TEXT_EXPERIMENT_TOOLS,
  WEB_LLM_DELETE_EXPERIMENT_TOOLS,
  WEB_LLM_EDIT_EXPERIMENT_TOOLS,
  WEB_LLM_FULL_ROUTING_EXPERIMENT_TOOLS,
  WEB_LLM_TRANSITION_EXPERIMENT_TOOLS,
} from '@/app/lib/webLlm/webLlmTestTools'

export type WebLlmRoutingTier = 'local_safe' | 'local_try' | 'cloud_only'

export type WebLlmRouteExperiment = {
  id: string
  title: string
  tier: WebLlmRoutingTier
  description: string
  prompt: string
  tools: WebLlmChatTool[]
  expectedTool: string
}

function videoLines(
  entries: Array<{ id: string; title: string; muted?: boolean }>
): string {
  const lines = entries.map(
    (entry, index) =>
      `  - #${index + 1} id="${entry.id}" title="${entry.title}" muted=${entry.muted ?? false}`
  )
  return `Videos (${entries.length}):\n${lines.join('\n')}`
}

function imageLines(
  entries: Array<{ id: string; name: string; startTime: number; endTime: number; row?: number }>
): string {
  const lines = entries.map(
    (entry, index) =>
      `  - #${index + 1} id="${entry.id}" name="${entry.name}" startTime=${entry.startTime}s endTime=${entry.endTime}s row=${entry.row ?? 0}`
  )
  return `Images (${entries.length}):\n${lines.join('\n')}`
}

const TWO_VIDEO_MANIFEST = videoLines([
  { id: 'video-alpha', title: 'Intro', muted: false },
  { id: 'video-beta', title: 'B-roll', muted: false },
])

const TWO_MUTED_VIDEO_MANIFEST = videoLines([
  { id: 'video-alpha', title: 'Intro', muted: true },
  { id: 'video-beta', title: 'B-roll', muted: true },
])

const THREE_IMAGE_MANIFEST = imageLines([
  { id: 'image-alpha', name: 'Cover', startTime: 0, endTime: 3 },
  { id: 'image-beta', name: 'Scene', startTime: 3, endTime: 6 },
  { id: 'image-gamma', name: 'Outro', startTime: 6, endTime: 9 },
])

const TEN_VIDEO_MANIFEST = videoLines(
  Array.from({ length: 10 }, (_, index) => ({
    id: `video-${String(index + 1).padStart(2, '0')}`,
    title: `Clip ${index + 1}`,
    muted: false,
  }))
)

export const WEB_LLM_ROUTE_EXPERIMENTS: WebLlmRouteExperiment[] = [
  {
    id: 'mute_all_videos',
    title: 'Mute all videos',
    tier: 'local_safe',
    description: 'Basic multi-item edit_manifest with muted: true on every video.',
    prompt: `Mute all videos on the timeline.\n\nCurrent timeline:\n${TWO_VIDEO_MANIFEST}`,
    tools: WEB_LLM_EDIT_EXPERIMENT_TOOLS,
    expectedTool: 'edit_manifest',
  },
  {
    id: 'mute_single_video',
    title: 'Mute video #1 only',
    tier: 'local_safe',
    description: 'Single-target mute; should not mute the second clip.',
    prompt: `Mute video 1 only.\n\nCurrent timeline:\n${TWO_VIDEO_MANIFEST}`,
    tools: WEB_LLM_EDIT_EXPERIMENT_TOOLS,
    expectedTool: 'edit_manifest',
  },
  {
    id: 'unmute_all_videos',
    title: 'Unmute all videos',
    tier: 'local_safe',
    description: 'Boolean flip to muted: false on every video.',
    prompt: `Unmute all videos.\n\nCurrent timeline:\n${TWO_MUTED_VIDEO_MANIFEST}`,
    tools: WEB_LLM_EDIT_EXPERIMENT_TOOLS,
    expectedTool: 'edit_manifest',
  },
  {
    id: 'set_video_opacity',
    title: 'Set video opacity to 40%',
    tier: 'local_safe',
    description: 'Numeric field extraction on a single video.',
    prompt: `Set video 1 opacity to 40%.\n\nCurrent timeline:\n${TWO_VIDEO_MANIFEST}`,
    tools: WEB_LLM_EDIT_EXPERIMENT_TOOLS,
    expectedTool: 'edit_manifest',
  },
  {
    id: 'delete_image_two',
    title: 'Delete image #2',
    tier: 'local_safe',
    description: 'delete_timeline_items with one image id.',
    prompt: `Delete image 2.\n\nCurrent timeline:\n${THREE_IMAGE_MANIFEST}`,
    tools: WEB_LLM_DELETE_EXPERIMENT_TOOLS,
    expectedTool: 'delete_timeline_items',
  },
  {
    id: 'add_fade_transition',
    title: 'Add fade to image #1',
    tier: 'local_try',
    description: 'set_transitions with transition fade on one image.',
    prompt: `Add a fade transition to image 1.\n\nCurrent timeline:\n${THREE_IMAGE_MANIFEST}`,
    tools: WEB_LLM_TRANSITION_EXPERIMENT_TOOLS,
    expectedTool: 'set_transitions',
  },
  {
    id: 'add_zoom_in_all_videos',
    title: 'Add zoom-in to all videos',
    tier: 'local_try',
    description: 'set_transitions with zoom-in animation on every video.',
    prompt: `Add zoom in animation to every video.\n\nCurrent timeline:\n${TWO_VIDEO_MANIFEST}`,
    tools: WEB_LLM_TRANSITION_EXPERIMENT_TOOLS,
    expectedTool: 'set_transitions',
  },
  {
    id: 'set_animation_duration',
    title: 'Set animation duration on video #1',
    tier: 'local_try',
    description: 'set_transitions with animationDuration property only.',
    prompt: `Set video 1 animation duration to 2 seconds.\n\nCurrent timeline:\n${TWO_VIDEO_MANIFEST}`,
    tools: WEB_LLM_TRANSITION_EXPERIMENT_TOOLS,
    expectedTool: 'set_transitions',
  },
  {
    id: 'add_text_overlay',
    title: 'Add text overlay',
    tier: 'local_try',
    description: 'add_text with content and a time range.',
    prompt: `Add text "Hello world" from 0 to 3 seconds.\n\nCurrent timeline:\n${THREE_IMAGE_MANIFEST}`,
    tools: WEB_LLM_ADD_TEXT_EXPERIMENT_TOOLS,
    expectedTool: 'add_text',
  },
  {
    id: 'move_image_row',
    title: 'Move image #1 to row 2',
    tier: 'local_try',
    description: 'edit_manifest row change on one image.',
    prompt: `Move image 1 to row 2.\n\nCurrent timeline:\n${THREE_IMAGE_MANIFEST}`,
    tools: WEB_LLM_EDIT_EXPERIMENT_TOOLS,
    expectedTool: 'edit_manifest',
  },
  {
    id: 'greeting_no_op',
    title: 'Greeting should no-op',
    tier: 'cloud_only',
    description: 'Non-edit chat should route to no_op, not edit_manifest.',
    prompt: `Hi there! How are you?\n\nCurrent timeline:\n${TWO_VIDEO_MANIFEST}`,
    tools: WEB_LLM_FULL_ROUTING_EXPERIMENT_TOOLS,
    expectedTool: 'no_op',
  },
  {
    id: 'generate_image_no_op',
    title: 'Generation request should no-op',
    tier: 'cloud_only',
    description: 'Pro generation intents should not be handled locally.',
    prompt: `Generate a photorealistic cat image for the timeline.\n\nCurrent timeline:\n${THREE_IMAGE_MANIFEST}`,
    tools: WEB_LLM_FULL_ROUTING_EXPERIMENT_TOOLS,
    expectedTool: 'no_op',
  },
  {
    id: 'mute_ten_videos',
    title: 'Mute 10 videos (stress)',
    tier: 'local_try',
    description: 'Larger manifest; tests id coverage across many items.',
    prompt: `Mute all videos on the timeline.\n\nCurrent timeline:\n${TEN_VIDEO_MANIFEST}`,
    tools: WEB_LLM_EDIT_EXPERIMENT_TOOLS,
    expectedTool: 'edit_manifest',
  },
]

export function getWebLlmRouteExperiment(id: string): WebLlmRouteExperiment | undefined {
  return WEB_LLM_ROUTE_EXPERIMENTS.find((experiment) => experiment.id === id)
}

export function webLlmRouteExperimentsByTier(tier: WebLlmRoutingTier): WebLlmRouteExperiment[] {
  return WEB_LLM_ROUTE_EXPERIMENTS.filter((experiment) => experiment.tier === tier)
}
