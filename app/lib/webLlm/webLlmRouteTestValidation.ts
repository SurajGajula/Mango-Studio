import {
  WEB_LLM_ROUTE_EXPERIMENTS,
  getWebLlmRouteExperiment,
} from '@/app/lib/webLlm/webLlmRouteExperiments'

type ParsedMutation = {
  type?: string
  id?: string
  muted?: boolean
  opacity?: number
  row?: number
}

type ParsedDeleteItem = {
  type?: string
  id?: string
}

type ParsedTransition = {
  type?: string
  id?: string
  animation?: string
  transition?: string
}

type ParsedText = {
  content?: string
  startTime?: number
  endTime?: number
}

export type WebLlmRouteTestValidation = {
  parsed: unknown | null
  parseError: string | null
  passed: boolean
  issues: string[]
  notes: string[]
}

const WEB_LLM_ROUTE_EXPERIMENTS_BY_PROMPT = new Map(
  WEB_LLM_ROUTE_EXPERIMENTS.map((experiment) => [experiment.prompt.trim(), experiment])
)

function parseToolArguments(toolArguments: string | null): { parsed: unknown | null; error: string | null } {
  if (!toolArguments) {
    return { parsed: null, error: 'Tool call returned no arguments.' }
  }

  try {
    return { parsed: JSON.parse(toolArguments), error: null }
  } catch {
    return { parsed: null, error: 'Tool arguments were not valid JSON.' }
  }
}

function mutationMap(mutations: ParsedMutation[]): Map<string, ParsedMutation> {
  return new Map(
    mutations
      .filter((mutation): mutation is ParsedMutation & { id: string } => typeof mutation.id === 'string')
      .map((mutation) => [mutation.id, mutation])
  )
}

function expectTool(
  toolName: string | null,
  expectedTool: string,
  issues: string[]
): boolean {
  if (toolName !== expectedTool) {
    issues.push(`Expected tool "${expectedTool}", got ${toolName ?? '(none)'}.`)
    return false
  }
  return true
}

function validateMuteAllVideos(parsed: Record<string, unknown>, issues: string[]): void {
  const mutations = Array.isArray(parsed.mutations) ? (parsed.mutations as ParsedMutation[]) : []
  const expectedIds = ['video-alpha', 'video-beta']
  const byId = mutationMap(mutations)

  for (const id of expectedIds) {
    const mutation = byId.get(id)
    if (!mutation) {
      issues.push(`Missing mutation for "${id}".`)
      continue
    }
    if (mutation.type !== 'updateVideo') {
      issues.push(`Mutation for "${id}" should be updateVideo.`)
    }
    if (mutation.muted !== true) {
      issues.push(`Mutation for "${id}" is missing muted: true.`)
    }
  }
}

function validateMuteSingleVideo(parsed: Record<string, unknown>, issues: string[]): void {
  const mutations = Array.isArray(parsed.mutations) ? (parsed.mutations as ParsedMutation[]) : []
  const byId = mutationMap(mutations)
  const target = byId.get('video-alpha')

  if (!target) {
    issues.push('Missing mutation for "video-alpha".')
  } else {
    if (target.type !== 'updateVideo') {
      issues.push('Mutation for "video-alpha" should be updateVideo.')
    }
    if (target.muted !== true) {
      issues.push('Mutation for "video-alpha" is missing muted: true.')
    }
  }

  if (byId.get('video-beta')) {
    issues.push('Should not mutate "video-beta" when only video 1 is requested.')
  }
}

function validateUnmuteAllVideos(parsed: Record<string, unknown>, issues: string[]): void {
  const mutations = Array.isArray(parsed.mutations) ? (parsed.mutations as ParsedMutation[]) : []
  const expectedIds = ['video-alpha', 'video-beta']
  const byId = mutationMap(mutations)

  for (const id of expectedIds) {
    const mutation = byId.get(id)
    if (!mutation) {
      issues.push(`Missing mutation for "${id}".`)
      continue
    }
    if (mutation.muted !== false) {
      issues.push(`Mutation for "${id}" is missing muted: false.`)
    }
  }
}

function validateSetVideoOpacity(parsed: Record<string, unknown>, issues: string[]): void {
  const mutations = Array.isArray(parsed.mutations) ? (parsed.mutations as ParsedMutation[]) : []
  const target = mutationMap(mutations).get('video-alpha')

  if (!target) {
    issues.push('Missing mutation for "video-alpha".')
    return
  }

  if (target.type !== 'updateVideo') {
    issues.push('Mutation for "video-alpha" should be updateVideo.')
  }

  if (typeof target.opacity !== 'number') {
    issues.push('Mutation for "video-alpha" is missing opacity.')
    return
  }

  if (Math.abs(target.opacity - 0.4) > 0.05) {
    issues.push(`Expected opacity near 0.4, got ${target.opacity}.`)
  }
}

function validateDeleteImageTwo(parsed: Record<string, unknown>, issues: string[]): void {
  const items = Array.isArray(parsed.items) ? (parsed.items as ParsedDeleteItem[]) : []
  const match = items.find((item) => item.id === 'image-beta')

  if (!match) {
    issues.push('Missing delete item for "image-beta".')
    return
  }

  if (match.type !== 'image') {
    issues.push('Deleted item should have type "image".')
  }

  if (items.length !== 1) {
    issues.push(`Expected exactly one delete item, got ${items.length}.`)
  }
}

function validateAddFadeTransition(parsed: Record<string, unknown>, issues: string[]): void {
  const transitions = Array.isArray(parsed.transitions)
    ? (parsed.transitions as ParsedTransition[])
    : []
  const target = transitions.find((entry) => entry.id === 'image-alpha')

  if (!target) {
    issues.push('Missing transition entry for "image-alpha".')
    return
  }

  if (target.type !== 'image') {
    issues.push('Transition target should have type "image".')
  }

  if (target.transition !== 'fade') {
    issues.push(`Expected transition "fade", got "${target.transition ?? '(none)'}".`)
  }
}

function validateAddTextOverlay(parsed: Record<string, unknown>, issues: string[]): void {
  const texts = Array.isArray(parsed.texts) ? (parsed.texts as ParsedText[]) : []
  if (texts.length === 0) {
    issues.push('Expected at least one text overlay.')
    return
  }

  const text = texts[0]
  const content = typeof text.content === 'string' ? text.content.toLowerCase() : ''
  if (!content.includes('hello')) {
    issues.push('Text content should include "Hello".')
  }

  if (typeof text.startTime !== 'number' || Math.abs(text.startTime - 0) > 0.25) {
    issues.push(`Expected startTime near 0, got ${text.startTime ?? '(none)'}.`)
  }

  if (typeof text.endTime !== 'number' || Math.abs(text.endTime - 3) > 0.25) {
    issues.push(`Expected endTime near 3, got ${text.endTime ?? '(none)'}.`)
  }
}

function validateMoveImageRow(parsed: Record<string, unknown>, issues: string[]): void {
  const mutations = Array.isArray(parsed.mutations) ? (parsed.mutations as ParsedMutation[]) : []
  const target = mutationMap(mutations).get('image-alpha')

  if (!target) {
    issues.push('Missing mutation for "image-alpha".')
    return
  }

  if (target.type !== 'updateImage') {
    issues.push('Mutation for "image-alpha" should be updateImage.')
  }

  if (target.row !== 2) {
    issues.push(`Expected row 2, got ${target.row ?? '(none)'}.`)
  }
}

function validateNoOp(parsed: Record<string, unknown>, issues: string[]): void {
  const reason = parsed.reason
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    issues.push('no_op should include a non-empty reason.')
  }
}

function validateMuteTenVideos(parsed: Record<string, unknown>, issues: string[]): void {
  const mutations = Array.isArray(parsed.mutations) ? (parsed.mutations as ParsedMutation[]) : []
  const expectedIds = Array.from({ length: 10 }, (_, index) => `video-${String(index + 1).padStart(2, '0')}`)
  const byId = mutationMap(mutations)

  for (const id of expectedIds) {
    const mutation = byId.get(id)
    if (!mutation) {
      issues.push(`Missing mutation for "${id}".`)
      continue
    }
    if (mutation.muted !== true) {
      issues.push(`Mutation for "${id}" is missing muted: true.`)
    }
  }
}

const experimentValidators: Record<string, (parsed: Record<string, unknown>, issues: string[]) => void> = {
  mute_all_videos: validateMuteAllVideos,
  mute_single_video: validateMuteSingleVideo,
  unmute_all_videos: validateUnmuteAllVideos,
  set_video_opacity: validateSetVideoOpacity,
  delete_image_two: validateDeleteImageTwo,
  add_fade_transition: validateAddFadeTransition,
  add_text_overlay: validateAddTextOverlay,
  move_image_row: validateMoveImageRow,
  greeting_no_op: validateNoOp,
  generate_image_no_op: validateNoOp,
  mute_ten_videos: validateMuteTenVideos,
}

export function validateWebLlmExperimentResult(
  experimentId: string,
  toolName: string | null,
  toolArguments: string | null
): WebLlmRouteTestValidation {
  const experiment = getWebLlmRouteExperiment(experimentId)
  const issues: string[] = []
  const notes: string[] = []

  if (!experiment) {
    return {
      parsed: null,
      parseError: null,
      passed: false,
      issues: [`Unknown experiment "${experimentId}".`],
      notes,
    }
  }

  if (!expectTool(toolName, experiment.expectedTool, issues)) {
    return { parsed: null, parseError: null, passed: false, issues, notes }
  }

  const { parsed, error } = parseToolArguments(toolArguments)
  if (error || !parsed || typeof parsed !== 'object') {
    return {
      parsed: null,
      parseError: error,
      passed: false,
      issues: [error ?? 'Tool arguments were not an object.'],
      notes,
    }
  }

  const validator = experimentValidators[experimentId]
  if (validator) {
    validator(parsed as Record<string, unknown>, issues)
  }

  if (issues.length === 0) {
    notes.push(`${experiment.title} passed for tier "${experiment.tier}".`)
  } else if (toolName === experiment.expectedTool) {
    notes.push('Correct tool selected, but payload was incomplete or wrong.')
  }

  return {
    parsed,
    parseError: null,
    passed: issues.length === 0,
    issues,
    notes,
  }
}

export function validateWebLlmRouteTestResult(
  toolName: string | null,
  toolArguments: string | null,
  prompt: string
): WebLlmRouteTestValidation {
  const experiment = WEB_LLM_ROUTE_EXPERIMENTS_BY_PROMPT.get(prompt.trim())
  if (experiment) {
    return validateWebLlmExperimentResult(experiment.id, toolName, toolArguments)
  }

  const issues: string[] = []
  const notes = ['No built-in validation rules for this custom prompt.']
  if (toolName !== 'edit_manifest') {
    issues.push(`Expected tool "edit_manifest", got ${toolName ?? '(none)'}.`)
  }

  const { parsed, error } = parseToolArguments(toolArguments)
  if (error) {
    issues.push(error)
  } else if (parsed && typeof parsed === 'object') {
    const mutations = Array.isArray((parsed as { mutations?: unknown }).mutations)
      ? ((parsed as { mutations: ParsedMutation[] }).mutations ?? [])
      : []
    if (mutations.some((mutation) => Object.keys(mutation).length <= 2)) {
      issues.push('At least one mutation only includes type/id with no edit fields.')
    }
  }

  return {
    parsed,
    parseError: error,
    passed: issues.length === 0,
    issues,
    notes,
  }
}
