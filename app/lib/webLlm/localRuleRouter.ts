import { resolveLocalAddSolidImageIntent } from '@/app/lib/webLlm/localAddSolidImageIntent'
import { resolveLocalAddTextIntent } from '@/app/lib/webLlm/localAddTextIntent'
import { resolveLocalAnimationIntent } from '@/app/lib/webLlm/localAnimationIntent'
import { resolveLocalCropIntent } from '@/app/lib/webLlm/localCropIntent'
import { resolveLocalDeleteIntent } from '@/app/lib/webLlm/localDeleteIntent'
import { resolveLocalDuplicateIntent } from '@/app/lib/webLlm/localDuplicateIntent'
import { resolveLocalEditManifestIntent } from '@/app/lib/webLlm/localEditManifestIntent'
import { resolveLocalEffectIntent } from '@/app/lib/webLlm/localEffectIntent'
import { resolveLocalNormalizeAudioIntent } from '@/app/lib/webLlm/localNormalizeAudioIntent'
import {
  resolveLocalReplaceImagesIntent,
  type LocalUploadedFileMeta,
} from '@/app/lib/webLlm/localReplaceImagesIntent'
import { resolveLocalReplaceSolidIntent } from '@/app/lib/webLlm/localReplaceSolidIntent'
import { resolveLocalSplitIntent } from '@/app/lib/webLlm/localSplitIntent'
import { resolveLocalStepGrowthIntent } from '@/app/lib/webLlm/localStepGrowthIntent'
import { resolveLocalTransitionIntent } from '@/app/lib/webLlm/localTransitionIntent'
import type { LocalChatManifest } from '@/app/lib/webLlm/buildLocalManifestContext'
import type { LocalRoutePromptResponse } from '@/app/lib/webLlm/localChatTypes'
import { validateLocalRouteResponse } from '@/app/lib/webLlm/validateLocalRouteResponse'

export type LocalRuleRouteContext = {
  prompt: string
  manifest: LocalChatManifest
  uploadedFiles?: LocalUploadedFileMeta[]
}

type RuleResolver = {
  resolve: (context: LocalRuleRouteContext) => LocalRoutePromptResponse | null
}

const RULE_RESOLVERS: RuleResolver[] = [
  { resolve: ({ prompt, manifest }) => resolveLocalAnimationIntent(prompt, manifest) },
  { resolve: ({ prompt, manifest }) => resolveLocalTransitionIntent(prompt, manifest) },
  { resolve: ({ prompt, manifest }) => resolveLocalSplitIntent(prompt, manifest) },
  { resolve: ({ prompt, manifest }) => resolveLocalDuplicateIntent(prompt, manifest) },
  { resolve: ({ prompt, manifest }) => resolveLocalCropIntent(prompt, manifest) },
  { resolve: ({ prompt }) => resolveLocalEffectIntent(prompt) },
  { resolve: ({ prompt, manifest }) => resolveLocalStepGrowthIntent(prompt, manifest) },
  { resolve: ({ prompt, manifest }) => resolveLocalNormalizeAudioIntent(prompt, manifest) },
  { resolve: ({ prompt, manifest }) => resolveLocalDeleteIntent(prompt, manifest) },
  {
    resolve: ({ prompt, manifest, uploadedFiles }) =>
      resolveLocalReplaceImagesIntent(prompt, manifest, uploadedFiles ?? []),
  },
  { resolve: ({ prompt, manifest }) => resolveLocalAddSolidImageIntent(prompt, manifest) },
  { resolve: ({ prompt, manifest }) => resolveLocalReplaceSolidIntent(prompt, manifest) },
  { resolve: ({ prompt, manifest }) => resolveLocalEditManifestIntent(prompt, manifest) },
  { resolve: ({ prompt }) => resolveLocalAddTextIntent(prompt) },
]

function validateRuleCandidate(
  candidate: LocalRoutePromptResponse,
  manifest: LocalChatManifest,
  uploadedFiles?: LocalUploadedFileMeta[]
): boolean {
  return validateLocalRouteResponse(candidate, manifest, uploadedFiles) === null
}

export function tryHighConfidenceRuleRoute(
  prompt: string,
  manifest: LocalChatManifest,
  uploadedFiles?: LocalUploadedFileMeta[]
): LocalRoutePromptResponse | null {
  const context: LocalRuleRouteContext = { prompt, manifest, uploadedFiles }

  if (uploadedFiles && uploadedFiles.length > 0) {
    const replaceImages = resolveLocalReplaceImagesIntent(prompt, manifest, uploadedFiles)
    if (replaceImages && validateRuleCandidate(replaceImages, manifest, uploadedFiles)) {
      return replaceImages
    }
  }

  const transition = resolveLocalTransitionIntent(prompt, manifest)
  if (transition && validateRuleCandidate(transition, manifest, uploadedFiles)) {
    return transition
  }

  const animation = resolveLocalAnimationIntent(prompt, manifest)
  if (animation && validateRuleCandidate(animation, manifest, uploadedFiles)) {
    return animation
  }

  const split = resolveLocalSplitIntent(prompt, manifest)
  if (split && validateRuleCandidate(split, manifest, uploadedFiles)) {
    return split
  }

  const addSolid = resolveLocalAddSolidImageIntent(prompt, manifest)
  if (addSolid && validateRuleCandidate(addSolid, manifest, uploadedFiles)) {
    return addSolid
  }

  const solidReplace = resolveLocalReplaceSolidIntent(prompt, manifest)
  if (solidReplace && validateRuleCandidate(solidReplace, manifest, uploadedFiles)) {
    return solidReplace
  }
  return null
}

export function resolveLocalRuleFallbackIntent(
  prompt: string,
  manifest: LocalChatManifest,
  uploadedFiles?: LocalUploadedFileMeta[]
): LocalRoutePromptResponse | null {
  const context: LocalRuleRouteContext = { prompt, manifest, uploadedFiles }
  for (const { resolve } of RULE_RESOLVERS) {
    const candidate = resolve(context)
    if (!candidate) {
      continue
    }
    if (validateRuleCandidate(candidate, manifest, uploadedFiles)) {
      return candidate
    }
  }
  return null
}
