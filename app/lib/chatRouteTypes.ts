export interface ManifestMutation {
  type: 'updateImage' | 'updateVideo' | 'updateText' | 'updateAudio'
  id: string
  row?: number
  startTime?: number
  endTime?: number
  timestamp?: number
  duration?: number
  trimStart?: number
  trimEnd?: number
  playbackSpeed?: number
  speedStart?: number
  speedEnd?: number
  speedEasing?: 'linear' | 'ease'
  muted?: boolean
  opacity?: number
  fontFamily?: string
  fontWeight?: string
  animation?: 'none' | 'keyboard' | 'speech' | 'shake'
  style?: 'normal' | 'negative' | 'highlight'
  textAlign?: 'left' | 'center' | 'right'
  centerOnCanvas?: boolean
  x?: number
  y?: number
  width?: number
  height?: number
}

export interface SplitInstruction {
  type: 'image' | 'video' | 'text' | 'audio'
  id: string
  times: number[]
}

export interface ReplaceInstruction {
  targetId: string
  fileIndex: number
}

export interface SolidColorReplaceInstruction {
  targetId: string
  color: string
}

export interface AddTextInstruction {
  content: string
  startTime: number
  endTime: number
}

export interface AddSolidImageInstruction {
  color: string
  startTime: number
  endTime: number
}

export interface AddEffectInstruction {
  type: 'crt-dither' | 'flashing-black-vignette' | 'black-and-white' | 'vivid-sharp' | 'pixel-glitch-scan' | 'grainy'
  startTime: number
  endTime: number
  intensity?: number
  contrast?: number
  flashSpeed?: number
}

export interface TransitionInstruction {
  type: 'image' | 'video'
  id: string
  animation?: 'none' | 'zoom-in' | 'zoom-out' | 'stretch-out' | 'shake' | 'jitter' | 'rotate' | 'slide-shake-left' | 'slide-shake-right' | string
  transition?: 'none' | 'split' | 'fade' | 'morph' | 'slide-in' | 'wipe' | 'circle' | 'rotate' | 'flash'
  zoomIntensity?: number
  zoomDistanceIntensity?: number
  transitionDuration?: number
  animationDuration?: number
  animationZoomEasing?: 'constant' | 'fast-slow' | 'slow-fast'
  transitionColor?: string
  transitionFlashMode?: 'solid' | 'negative'
  transitionDirection?: 'left' | 'right' | 'top' | 'bottom' | 'up' | 'down'
  transitionAxis?: 'horizontal' | 'vertical'
  transitionSlideEasing?: 'smooth' | 'ease-in' | 'ease-out' | 'linear'
  transitionCircleEasing?: 'smooth' | 'ease-in' | 'ease-out' | 'linear'
  transitionWipeEasing?: 'ease-in' | 'ease-out' | 'linear'
}

export interface CropInstruction {
  type: 'image' | 'video'
  id: string
  cropAspect: '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | 'none'
}

export interface StepGrowthInstruction {
  id?: string
  imageNumber?: number
  target?: 'image_id' | 'image_number' | 'selected'
  steps?: number
}

export interface NormalizeAudioVolumesInstruction {
  referenceAudioNumber: number
  targetAudioNumbers: number[]
}

export interface DeleteTimelineItemInstruction {
  type: 'image' | 'video' | 'text' | 'audio' | 'effect'
  id: string
}

export interface DeleteLibraryItemInstruction {
  type: 'asset' | 'folder'
  id: string
}

export type ChatRoutePromptAction =
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

export type ChatRoutePromptResponse = {
  action: ChatRoutePromptAction
  message: string
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
