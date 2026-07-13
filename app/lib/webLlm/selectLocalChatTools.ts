import type { WebLlmChatTool } from '@/app/lib/webLlm/webLlmTestTools'
import {
  promptIsMotionEdit,
  promptIsTimelineItemDeletion,
} from '@/app/lib/webLlm/localTransitionPrompt'
import {
  promptLooksLikeSolidOrMediaReplace,
  promptLooksLikeSplit,
} from '@/app/lib/webLlm/localSplitSolidHints'
import type { LocalUploadedFileMeta } from '@/app/lib/webLlm/localReplaceImagesIntent'
import {
  WEB_LLM_ADD_TEXT_EXPERIMENT_TOOLS,
  WEB_LLM_CROP_EXPERIMENT_TOOLS,
  WEB_LLM_DELETE_EXPERIMENT_TOOLS,
  WEB_LLM_DUPLICATE_EXPERIMENT_TOOLS,
  WEB_LLM_EDIT_EXPERIMENT_TOOLS,
  WEB_LLM_EFFECT_EXPERIMENT_TOOLS,
  WEB_LLM_LOCAL_CHAT_TOOLS,
  WEB_LLM_NORMALIZE_AUDIO_EXPERIMENT_TOOLS,
  WEB_LLM_SOLID_MEDIA_EXPERIMENT_TOOLS,
  WEB_LLM_SOLID_MEDIA_WITH_FILES_EXPERIMENT_TOOLS,
  WEB_LLM_SPLIT_EXPERIMENT_TOOLS,
  WEB_LLM_STEP_GROWTH_EXPERIMENT_TOOLS,
  WEB_LLM_TRANSITION_EXPERIMENT_TOOLS,
} from '@/app/lib/webLlm/webLlmTestTools'

function normalizePrompt(prompt: string): string {
  return prompt.toLowerCase().replace(/#/g, ' ').trim()
}

export function selectLocalChatTools(
  prompt: string,
  uploadedFiles?: LocalUploadedFileMeta[]
): WebLlmChatTool[] {
  const normalized = normalizePrompt(prompt)
  const hasFiles = Boolean(uploadedFiles && uploadedFiles.length > 0)

  if (promptLooksLikeSplit(prompt)) {
    return WEB_LLM_SPLIT_EXPERIMENT_TOOLS
  }

  if (promptLooksLikeSolidOrMediaReplace(prompt, uploadedFiles)) {
    return hasFiles
      ? WEB_LLM_SOLID_MEDIA_WITH_FILES_EXPERIMENT_TOOLS
      : WEB_LLM_SOLID_MEDIA_EXPERIMENT_TOOLS
  }

  if (promptIsMotionEdit(prompt)) {
    return WEB_LLM_TRANSITION_EXPERIMENT_TOOLS
  }

  if (promptIsTimelineItemDeletion(prompt)) {
    return WEB_LLM_DELETE_EXPERIMENT_TOOLS
  }

  if (/\bduplicate\b/.test(normalized)) {
    return WEB_LLM_DUPLICATE_EXPERIMENT_TOOLS
  }

  if (/\b(?:crop|16:9|4:3|1:1|9:16|3:4)\b/.test(normalized)) {
    return WEB_LLM_CROP_EXPERIMENT_TOOLS
  }

  if (/\b(?:crt|dither|vignette|blur|cool|grainy|glitch|vivid|contrast|black|white)\b/.test(normalized) && /\badd\b/.test(normalized)) {
    return WEB_LLM_EFFECT_EXPERIMENT_TOOLS
  }

  if (/\bgrow\s+in\s+\d+\s+steps\b/.test(normalized)) {
    return WEB_LLM_STEP_GROWTH_EXPERIMENT_TOOLS
  }

  if (/\b(?:normalize|match|same\s+volume|loudness)\b/.test(normalized) && /\baudio/.test(normalized)) {
    return WEB_LLM_NORMALIZE_AUDIO_EXPERIMENT_TOOLS
  }

  if (
    /\b(?:mute|unmute|opacity|move|duration|length|speed|center|negative|highlight)\b/.test(normalized) ||
    /\brow\s+\d+\b/.test(normalized)
  ) {
    return WEB_LLM_EDIT_EXPERIMENT_TOOLS
  }

  if (/\badd\s+text\b/.test(normalized)) {
    return WEB_LLM_ADD_TEXT_EXPERIMENT_TOOLS
  }

  return WEB_LLM_LOCAL_CHAT_TOOLS
}
