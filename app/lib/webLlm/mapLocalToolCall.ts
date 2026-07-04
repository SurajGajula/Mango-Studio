import type {
  AddEffectInstruction,
  AddSolidImageInstruction,
  AddTextInstruction,
  CropInstruction,
  DeleteTimelineItemInstruction,
  ManifestMutation,
  NormalizeAudioVolumesInstruction,
  ReplaceInstruction,
  SplitInstruction,
  StepGrowthInstruction,
  TransitionInstruction,
  SolidColorReplaceInstruction,
} from '@/app/lib/chatRouteTypes'
import type { LocalRoutePromptResponse } from '@/app/lib/webLlm/localChatTypes'

export function mapLocalToolCallToRouteResponse(
  toolName: string | null,
  toolArguments: string | null
): LocalRoutePromptResponse {
  if (!toolName) {
    return {
      action: 'no_op',
      message: 'Local model did not return a tool call.',
    }
  }

  let args: Record<string, unknown> | null = null
  if (toolArguments) {
    try {
      args = JSON.parse(toolArguments) as Record<string, unknown>
    } catch {
      return {
        action: 'no_op',
        message: 'Local model returned malformed tool arguments.',
      }
    }
  }

  if (toolName === 'no_op') {
    const reason = typeof args?.reason === 'string' ? args.reason : 'That request is not supported in local mode.'
    return { action: 'no_op', message: reason }
  }

  if (!args) {
    return {
      action: 'no_op',
      message: 'Local model returned invalid tool arguments.',
    }
  }

  const message = typeof args.message === 'string' ? args.message : 'Done.'

  if (toolName === 'edit_manifest') {
    return {
      action: 'edit_manifest',
      mutations: (args.mutations as ManifestMutation[]) ?? [],
      message,
    }
  }

  if (toolName === 'delete_timeline_items') {
    return {
      action: 'delete_timeline_items',
      deleteItems: (args.items as DeleteTimelineItemInstruction[]) ?? [],
      message,
    }
  }

  if (toolName === 'set_transitions') {
    return {
      action: 'set_transitions',
      transitions: (args.transitions as TransitionInstruction[]) ?? [],
      message,
    }
  }

  if (toolName === 'add_text') {
    return {
      action: 'add_text',
      newTexts: (args.texts as AddTextInstruction[]) ?? [],
      message,
    }
  }

  if (toolName === 'replace_images') {
    return {
      action: 'replace_images',
      replacements: (args.replacements as ReplaceInstruction[]) ?? [],
      message,
    }
  }

  if (toolName === 'add_solid_image') {
    return {
      action: 'add_solid_image',
      newSolidImages: (args.images as AddSolidImageInstruction[]) ?? [],
      message,
    }
  }

  if (toolName === 'replace_with_solid') {
    return {
      action: 'replace_with_solid',
      solidReplacements: (args.replacements as SolidColorReplaceInstruction[]) ?? [],
      message,
    }
  }

  if (toolName === 'split_at_marks') {
    return {
      action: 'split_at_marks',
      splits: (args.splits as SplitInstruction[]) ?? [],
      message,
    }
  }

  if (toolName === 'duplicate_timeline_range') {
    const kind = args.kind === 'video' ? 'video' : 'image'
    const firstNumber = typeof args.firstNumber === 'number' ? args.firstNumber : 0
    const lastNumber = typeof args.lastNumber === 'number' ? args.lastNumber : 0
    return {
      action: 'duplicate_timeline_range',
      duplicateRange: { kind, firstNumber, lastNumber },
      message,
    }
  }

  if (toolName === 'set_crop') {
    return {
      action: 'set_crop',
      crops: (args.crops as CropInstruction[]) ?? [],
      message,
    }
  }

  if (toolName === 'add_effect') {
    return {
      action: 'add_effect',
      newEffects: (args.effects as AddEffectInstruction[]) ?? [],
      message,
    }
  }

  if (toolName === 'set_step_growth') {
    return {
      action: 'set_step_growth',
      stepGrowth: (args.grows as StepGrowthInstruction[]) ?? [],
      message,
    }
  }

  if (toolName === 'normalize_audio_volumes') {
    return {
      action: 'normalize_audio_volumes',
      normalizeAudioVolumes: {
        referenceAudioNumber: args.referenceAudioNumber as number,
        targetAudioNumbers: (args.targetAudioNumbers as number[]) ?? [],
      } satisfies NormalizeAudioVolumesInstruction,
      message,
    }
  }

  return {
    action: 'no_op',
    message: `Local mode does not support "${toolName}".`,
  }
}
