import { describe, expect, it } from 'vitest'
import { summarizeWebLlmExperimentBatch } from '@/app/lib/webLlm/webLlmExperimentRunner'
import { validateWebLlmExperimentResult } from '@/app/lib/webLlm/webLlmRouteTestValidation'
import { WEB_LLM_ROUTE_TEST_PROMPT } from '@/app/lib/webLlm/webLlmTestTools'

describe('validateWebLlmExperimentResult', () => {
  it('flags mute test output that omits muted: true', () => {
    const result = validateWebLlmExperimentResult(
      'mute_all_videos',
      'edit_manifest',
      JSON.stringify({
        mutations: [
          { type: 'updateVideo', id: 'video-alpha' },
          { type: 'updateVideo', id: 'video-beta' },
        ],
        message: 'Videos muted.',
      })
    )

    expect(result.passed).toBe(false)
    expect(result.issues).toContain('Mutation for "video-alpha" is missing muted: true.')
  })

  it('passes when both videos are muted', () => {
    const result = validateWebLlmExperimentResult(
      'mute_all_videos',
      'edit_manifest',
      JSON.stringify({
        mutations: [
          { type: 'updateVideo', id: 'video-alpha', muted: true },
          { type: 'updateVideo', id: 'video-beta', muted: true },
        ],
        message: 'Muted all videos.',
      })
    )

    expect(result.passed).toBe(true)
  })

  it('expects no_op for greetings', () => {
    const result = validateWebLlmExperimentResult(
      'greeting_no_op',
      'edit_manifest',
      JSON.stringify({ mutations: [], message: 'Hi' })
    )

    expect(result.passed).toBe(false)
    expect(result.issues[0]).toContain('Expected tool "no_op"')
  })

  it('validates custom prompt via prompt map', () => {
    const result = validateWebLlmExperimentResult(
      'mute_all_videos',
      'edit_manifest',
      JSON.stringify({
        mutations: [
          { type: 'updateVideo', id: 'video-alpha', muted: true },
          { type: 'updateVideo', id: 'video-beta', muted: true },
        ],
        message: 'Muted all videos.',
      })
    )

    expect(result.passed).toBe(true)
    expect(WEB_LLM_ROUTE_TEST_PROMPT.length).toBeGreaterThan(0)
  })
})

describe('summarizeWebLlmExperimentBatch', () => {
  it('computes tier pass rates', () => {
    const summary = summarizeWebLlmExperimentBatch([
      {
        experimentId: 'mute_all_videos',
        title: 'Mute all videos',
        tier: 'local_safe',
        passed: true,
        toolName: 'edit_manifest',
        toolArguments: '{}',
        issues: [],
        notes: [],
        latencyMs: 10,
        error: null,
      },
      {
        experimentId: 'greeting_no_op',
        title: 'Greeting should no-op',
        tier: 'cloud_only',
        passed: false,
        toolName: 'edit_manifest',
        toolArguments: '{}',
        issues: ['wrong tool'],
        notes: [],
        latencyMs: 12,
        error: null,
      },
    ])

    expect(summary.passed).toBe(1)
    expect(summary.byTier.local_safe.passRate).toBe(1)
    expect(summary.byTier.cloud_only.passRate).toBe(0)
  })
})
