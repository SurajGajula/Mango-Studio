import { describe, expect, it } from 'vitest'
import {
  buildRoutingTrainingJsonlRecord,
  formatRoutingTrainingJsonl,
} from '@/app/lib/webLlm/training/buildRoutingTrainingRecord'
import { generateRoutingDataset } from '@/app/lib/webLlm/training/generateRoutingDataset'
import { computeRoutingGroundTruth } from '@/app/lib/webLlm/training/routingScenarios'
import { createRng } from '@/app/lib/webLlm/training/rng'
import { generateSyntheticManifest } from '@/app/lib/webLlm/training/syntheticManifestGenerator'

describe('generateRoutingDataset', () => {
  it('builds validated ground-truth JSONL examples', async () => {
    const result = await generateRoutingDataset({
      count: 8,
      seed: 42,
      includeExperiments: false,
      useGeminiTeacher: false,
    })

    expect(result.examples.length).toBeGreaterThan(0)
    expect(result.stats.valid).toBe(result.examples.length)
    expect(result.jsonl.split('\n').length).toBe(result.examples.length)
  })
})

describe('computeRoutingGroundTruth', () => {
  it('labels remove flash except requests as set_transitions', () => {
    const manifest = {
      videos: Array.from({ length: 6 }, (_, index) => ({
        id: `video-${index + 1}`,
        title: `Clip ${index + 1}`,
        timestamp: index * 3,
        duration: 3,
        transition: 'flash',
      })),
    }

    const result = computeRoutingGroundTruth(
      'remove the flash transitions from all videos except video 6',
      manifest
    )

    expect(result?.action).toBe('set_transitions')
    expect(result?.transitions).toHaveLength(5)
    expect(result?.transitions?.every((entry) => entry.transition === 'none')).toBe(true)
  })

  it('labels zoom-in animation requests as set_transitions', () => {
    const manifest = {
      videos: Array.from({ length: 3 }, (_, index) => ({
        id: `video-${index + 1}`,
        title: `Clip ${index + 1}`,
        timestamp: index * 3,
        duration: 3,
      })),
    }

    const result = computeRoutingGroundTruth('Add zoom in animation to every video.', manifest)

    expect(result?.action).toBe('set_transitions')
    expect(result?.transitions).toHaveLength(3)
    expect(result?.transitions?.every((entry) => entry.animation === 'zoom-in')).toBe(true)
  })

  it('labels animation duration edits as set_transitions', () => {
    const manifest = {
      videos: [{ id: 'video-1', title: 'Clip', timestamp: 0, duration: 3 }],
    }

    const result = computeRoutingGroundTruth('Set video 1 animation duration to 2 seconds.', manifest)

    expect(result?.action).toBe('set_transitions')
    expect(result?.transitions).toEqual([
      { type: 'video', id: 'video-1', animationDuration: 2 },
    ])
  })

  it('labels split requests as split_at_marks', () => {
    const manifest = {
      images: [{ id: 'image-1', name: 'Cover', startTime: 0, endTime: 4 }],
    }

    const result = computeRoutingGroundTruth('Split image 1 in half.', manifest)

    expect(result?.action).toBe('split_at_marks')
    expect(result?.splits?.[0]?.times).toEqual([2])
  })

  it('labels duplicate requests as duplicate_timeline_range', () => {
    const manifest = {
      images: [
        { id: 'image-1', name: 'A', startTime: 0, endTime: 2 },
        { id: 'image-2', name: 'B', startTime: 2, endTime: 4 },
        { id: 'image-3', name: 'C', startTime: 4, endTime: 6 },
      ],
    }

    const result = computeRoutingGroundTruth('Duplicate images 1 to 3.', manifest)

    expect(result?.action).toBe('duplicate_timeline_range')
    expect(result?.duplicateRange).toEqual({ kind: 'image', firstNumber: 1, lastNumber: 3 })
  })
})

describe('buildRoutingTrainingJsonlRecord', () => {
  it('formats OpenAI-style tool-call training rows', () => {
    const manifest = generateSyntheticManifest(createRng(1), { videoCount: 2, imageCount: 0 })
    const record = buildRoutingTrainingJsonlRecord({
      prompt: 'Mute all videos on the timeline.',
      manifest,
      toolName: 'edit_manifest',
      toolArguments: JSON.stringify({
        mutations: [{ type: 'updateVideo', id: manifest.videos?.[0]?.id, muted: true }],
        message: 'Muted.',
      }),
    })

    const jsonl = formatRoutingTrainingJsonl([record])
    const parsed = JSON.parse(jsonl)
    expect(parsed.messages).toHaveLength(2)
    expect(parsed.messages[1].tool_calls[0].function.name).toBe('edit_manifest')
    expect(parsed.tools.length).toBeGreaterThan(0)
  })
})
