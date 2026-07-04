import type { LocalRoutePromptResponse } from '@/app/lib/webLlm/localChatTypes'

export function routeResponseToToolCall(
  response: LocalRoutePromptResponse
): { toolName: string; toolArguments: string } | null {
  if (response.action === 'no_op') {
    return {
      toolName: 'no_op',
      toolArguments: JSON.stringify({ reason: response.message }),
    }
  }

  if (response.action === 'edit_manifest') {
    return {
      toolName: 'edit_manifest',
      toolArguments: JSON.stringify({
        mutations: response.mutations ?? [],
        message: response.message,
      }),
    }
  }

  if (response.action === 'delete_timeline_items') {
    return {
      toolName: 'delete_timeline_items',
      toolArguments: JSON.stringify({
        items: response.deleteItems ?? [],
        message: response.message,
      }),
    }
  }

  if (response.action === 'set_transitions') {
    return {
      toolName: 'set_transitions',
      toolArguments: JSON.stringify({
        transitions: response.transitions ?? [],
        message: response.message,
      }),
    }
  }

  if (response.action === 'add_text') {
    return {
      toolName: 'add_text',
      toolArguments: JSON.stringify({
        texts: response.newTexts ?? [],
        message: response.message,
      }),
    }
  }

  if (response.action === 'replace_images') {
    return {
      toolName: 'replace_images',
      toolArguments: JSON.stringify({
        replacements: response.replacements ?? [],
        message: response.message,
      }),
    }
  }

  if (response.action === 'add_solid_image') {
    return {
      toolName: 'add_solid_image',
      toolArguments: JSON.stringify({
        images: response.newSolidImages ?? [],
        message: response.message,
      }),
    }
  }

  if (response.action === 'replace_with_solid') {
    return {
      toolName: 'replace_with_solid',
      toolArguments: JSON.stringify({
        replacements: response.solidReplacements ?? [],
        message: response.message,
      }),
    }
  }

  if (response.action === 'split_at_marks') {
    return {
      toolName: 'split_at_marks',
      toolArguments: JSON.stringify({
        splits: response.splits ?? [],
        message: response.message,
      }),
    }
  }

  if (response.action === 'duplicate_timeline_range' && response.duplicateRange) {
    return {
      toolName: 'duplicate_timeline_range',
      toolArguments: JSON.stringify({
        ...response.duplicateRange,
        message: response.message,
      }),
    }
  }

  if (response.action === 'set_crop') {
    return {
      toolName: 'set_crop',
      toolArguments: JSON.stringify({
        crops: response.crops ?? [],
        message: response.message,
      }),
    }
  }

  if (response.action === 'add_effect') {
    return {
      toolName: 'add_effect',
      toolArguments: JSON.stringify({
        effects: response.newEffects ?? [],
        message: response.message,
      }),
    }
  }

  if (response.action === 'set_step_growth') {
    return {
      toolName: 'set_step_growth',
      toolArguments: JSON.stringify({
        grows: response.stepGrowth ?? [],
        message: response.message,
      }),
    }
  }

  if (response.action === 'normalize_audio_volumes' && response.normalizeAudioVolumes) {
    return {
      toolName: 'normalize_audio_volumes',
      toolArguments: JSON.stringify({
        ...response.normalizeAudioVolumes,
        message: response.message,
      }),
    }
  }

  return null
}
