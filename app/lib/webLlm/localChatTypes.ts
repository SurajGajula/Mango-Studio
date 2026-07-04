import type {
  AddEffectInstruction,
  AddSolidImageInstruction,
  AddTextInstruction,
  CropInstruction,
  DeleteLibraryItemInstruction,
  DeleteTimelineItemInstruction,
  ManifestMutation,
  NormalizeAudioVolumesInstruction,
  ReplaceInstruction,
  SolidColorReplaceInstruction,
  SplitInstruction,
  StepGrowthInstruction,
  TransitionInstruction,
} from '@/app/lib/chatRouteTypes'

export type LocalRoutePromptAction =
  | 'no_op'
  | 'edit_manifest'
  | 'split_at_marks'
  | 'replace_images'
  | 'replace_with_solid'
  | 'add_solid_image'
  | 'add_text'
  | 'set_transitions'
  | 'set_step_growth'
  | 'set_crop'
  | 'add_effect'
  | 'delete_timeline_items'
  | 'delete_library_items'
  | 'duplicate_timeline_range'
  | 'normalize_audio_volumes'

export type LocalRoutePromptResponse = {
  action: LocalRoutePromptAction
  message: string
  error?: string
  mutations?: ManifestMutation[]
  splits?: SplitInstruction[]
  replacements?: ReplaceInstruction[]
  solidReplacements?: SolidColorReplaceInstruction[]
  newSolidImages?: AddSolidImageInstruction[]
  newTexts?: AddTextInstruction[]
  newEffects?: AddEffectInstruction[]
  transitions?: TransitionInstruction[]
  stepGrowth?: StepGrowthInstruction[]
  crops?: CropInstruction[]
  deleteItems?: DeleteTimelineItemInstruction[]
  deleteLibraryItems?: DeleteLibraryItemInstruction[]
  duplicateRange?: { kind: 'image' | 'video'; firstNumber: number; lastNumber: number }
  normalizeAudioVolumes?: NormalizeAudioVolumesInstruction
}
