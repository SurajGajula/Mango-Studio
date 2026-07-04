import type { LocalChatManifest } from '@/app/lib/webLlm/buildLocalManifestContext'
import { indexLocalManifest } from '@/app/lib/webLlm/localManifestIndex'
import type { LocalRoutePromptResponse } from '@/app/lib/webLlm/localChatTypes'
import type { TransitionInstruction } from '@/app/lib/chatRouteTypes'

function mutationHasEditField(mutation: Record<string, unknown>): boolean {
  const ignored = new Set(['type', 'id'])
  return Object.keys(mutation).some((key) => !ignored.has(key))
}

function transitionHasEditField(transition: TransitionInstruction): boolean {
  if (transition.animation || transition.transition) {
    return true
  }
  return (
    transition.animationDuration !== undefined ||
    transition.transitionDuration !== undefined ||
    transition.zoomIntensity !== undefined ||
    transition.zoomDistanceIntensity !== undefined ||
    transition.animationZoomEasing !== undefined
  )
}

import type { LocalUploadedFileMeta } from '@/app/lib/webLlm/localReplaceImagesIntent'

export function validateLocalRouteResponse(
  response: LocalRoutePromptResponse,
  manifest: LocalChatManifest,
  uploadedFiles?: LocalUploadedFileMeta[]
): string | null {
  if (response.action === 'no_op') {
    return null
  }

  const knownIds = indexLocalManifest(manifest).kindById

  if (response.action === 'edit_manifest') {
    const mutations = response.mutations ?? []
    if (mutations.length === 0) {
      return 'edit_manifest returned no mutations.'
    }
    for (const mutation of mutations) {
      if (!knownIds.has(mutation.id)) {
        return `Unknown timeline id "${mutation.id}".`
      }
      const record = mutation as unknown as Record<string, unknown>
      if (!mutationHasEditField(record)) {
        return `Mutation for "${mutation.id}" is missing edit fields.`
      }
    }
    return null
  }

  if (response.action === 'delete_timeline_items') {
    const items = response.deleteItems ?? []
    if (items.length === 0) {
      return 'delete_timeline_items returned no items.'
    }
    for (const item of items) {
      if (!knownIds.has(item.id)) {
        return `Unknown timeline id "${item.id}".`
      }
      const actualKind = knownIds.get(item.id)
      if (actualKind && item.type !== actualKind) {
        return `Delete type "${item.type}" does not match timeline id "${item.id}" (${actualKind}).`
      }
    }
    return null
  }

  if (response.action === 'set_transitions') {
    const transitions = response.transitions ?? []
    if (transitions.length === 0) {
      return 'set_transitions returned no transitions.'
    }
    for (const transition of transitions) {
      if (!knownIds.has(transition.id)) {
        return `Unknown timeline id "${transition.id}".`
      }
      if (!transitionHasEditField(transition)) {
        return `Transition for "${transition.id}" is missing animation, transition, or property fields.`
      }
    }
    return null
  }

  if (response.action === 'add_text') {
    const texts = response.newTexts ?? []
    if (texts.length === 0) {
      return 'add_text returned no text overlays.'
    }
    for (const text of texts) {
      if (typeof text.startTime !== 'number' || typeof text.endTime !== 'number') {
        return 'Text overlay is missing startTime or endTime.'
      }
      if (text.endTime <= text.startTime) {
        return 'Text overlay endTime must be after startTime.'
      }
    }
    return null
  }

  if (response.action === 'add_solid_image') {
    const images = response.newSolidImages ?? []
    if (images.length === 0) {
      return 'add_solid_image returned no images.'
    }
    for (const image of images) {
      if (typeof image.startTime !== 'number' || typeof image.endTime !== 'number') {
        return 'Solid image is missing startTime or endTime.'
      }
      if (image.endTime <= image.startTime) {
        return 'Solid image endTime must be after startTime.'
      }
      if (typeof image.color !== 'string' || image.color.trim().length === 0) {
        return 'Solid image is missing a color.'
      }
    }
    return null
  }

  if (response.action === 'replace_images') {
    const replacements = response.replacements ?? []
    if (replacements.length === 0) {
      return 'replace_images returned no replacements.'
    }
    const fileCount = uploadedFiles?.length ?? 0
    for (const replacement of replacements) {
      if (!knownIds.has(replacement.targetId)) {
        return `Unknown timeline id "${replacement.targetId}".`
      }
      const kind = knownIds.get(replacement.targetId)
      if (kind !== 'image' && kind !== 'video' && kind !== 'audio') {
        return `replace_images target "${replacement.targetId}" must be an image, video, or audio.`
      }
      if (
        typeof replacement.fileIndex !== 'number' ||
        replacement.fileIndex < 0 ||
        (fileCount > 0 && replacement.fileIndex >= fileCount)
      ) {
        return `replace_images fileIndex ${replacement.fileIndex} is out of range.`
      }
    }
    return null
  }

  if (response.action === 'replace_with_solid') {
    const replacements = response.solidReplacements ?? []
    if (replacements.length === 0) {
      return 'replace_with_solid returned no replacements.'
    }
    for (const replacement of replacements) {
      if (!knownIds.has(replacement.targetId)) {
        return `Unknown timeline id "${replacement.targetId}".`
      }
      const kind = knownIds.get(replacement.targetId)
      if (kind !== 'image' && kind !== 'video') {
        return `replace_with_solid target "${replacement.targetId}" must be an image or video.`
      }
      if (typeof replacement.color !== 'string' || replacement.color.trim().length === 0) {
        return `Replacement for "${replacement.targetId}" is missing a color.`
      }
    }
    return null
  }

  if (response.action === 'split_at_marks') {
    const splits = response.splits ?? []
    if (splits.length === 0) {
      return 'split_at_marks returned no splits.'
    }
    for (const split of splits) {
      if (!knownIds.has(split.id)) {
        return `Unknown timeline id "${split.id}".`
      }
      if (!Array.isArray(split.times) || split.times.length === 0) {
        return `Split for "${split.id}" is missing times.`
      }
    }
    return null
  }

  if (response.action === 'duplicate_timeline_range') {
    const range = response.duplicateRange
    if (!range) {
      return 'duplicate_timeline_range is missing duplicateRange.'
    }
    if (range.firstNumber < 1 || range.lastNumber < range.firstNumber) {
      return 'duplicate_timeline_range has an invalid number range.'
    }
    return null
  }

  if (response.action === 'set_crop') {
    const crops = response.crops ?? []
    if (crops.length === 0) {
      return 'set_crop returned no crops.'
    }
    for (const crop of crops) {
      if (!knownIds.has(crop.id)) {
        return `Unknown timeline id "${crop.id}".`
      }
      if (!crop.cropAspect) {
        return `Crop for "${crop.id}" is missing cropAspect.`
      }
    }
    return null
  }

  if (response.action === 'add_effect') {
    const effects = response.newEffects ?? []
    if (effects.length === 0) {
      return 'add_effect returned no effects.'
    }
    for (const effect of effects) {
      if (typeof effect.startTime !== 'number' || typeof effect.endTime !== 'number') {
        return 'Effect is missing startTime or endTime.'
      }
      if (effect.endTime <= effect.startTime) {
        return 'Effect endTime must be after startTime.'
      }
    }
    return null
  }

  if (response.action === 'set_step_growth') {
    const grows = response.stepGrowth ?? []
    if (grows.length === 0) {
      return 'set_step_growth returned no grows.'
    }
    for (const grow of grows) {
      if (grow.id && !knownIds.has(grow.id)) {
        return `Unknown timeline id "${grow.id}".`
      }
      if (!grow.steps || grow.steps < 1) {
        return 'Step growth is missing a valid steps count.'
      }
    }
    return null
  }

  if (response.action === 'normalize_audio_volumes') {
    const spec = response.normalizeAudioVolumes
    if (!spec) {
      return 'normalize_audio_volumes is missing parameters.'
    }
    if (spec.targetAudioNumbers.length === 0) {
      return 'normalize_audio_volumes has no target audios.'
    }
    return null
  }

  return `Local mode does not support action "${response.action}".`
}
