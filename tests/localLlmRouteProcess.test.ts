import { describe, expect, it } from 'vitest'
import {
  looksLikeTimelineEditRequest,
  processLocalLlmToolResult,
  shouldTryRuleFallback,
} from '@/app/lib/webLlm/localLlmRouteProcess'

describe('localLlmRouteProcess', () => {
  const manifest = {
    videos: [{ id: 'video-a', title: 'Intro', timestamp: 0, duration: 3, muted: false, transition: 'flash' }],
  }

  it('treats explicit no_op from the model as final', () => {
    const attempt = processLocalLlmToolResult(
      {
        toolName: 'no_op',
        toolArguments: JSON.stringify({ reason: 'Hello!' }),
        message: null,
        raw: {},
      },
      'Hi there',
      manifest
    )
    expect(attempt.status).toBe('explicit_no_op')
    expect(shouldTryRuleFallback(attempt)).toBe(false)
  })

  it('flags missing tool calls for rule fallback', () => {
    const attempt = processLocalLlmToolResult(
      {
        toolName: null,
        toolArguments: null,
        message: null,
        raw: {},
      },
      'add flash transitions to every video',
      manifest
    )
    expect(attempt.status).toBe('no_tool_call')
    expect(shouldTryRuleFallback(attempt)).toBe(true)
    expect(looksLikeTimelineEditRequest('add flash transitions to every video')).toBe(true)
  })

  it('accepts valid edit_manifest tool output', () => {
    const attempt = processLocalLlmToolResult(
      {
        toolName: 'edit_manifest',
        toolArguments: JSON.stringify({
          mutations: [{ type: 'updateVideo', id: 'video-a', muted: true }],
          message: 'Muted video.',
        }),
        message: null,
        raw: {},
      },
      'mute video 1',
      manifest
    )
    expect(attempt.status).toBe('success')
    expect(attempt.response.action).toBe('edit_manifest')
  })

  it('rejects delete_timeline_items for transition removal prompts', () => {
    const attempt = processLocalLlmToolResult(
      {
        toolName: 'delete_timeline_items',
        toolArguments: JSON.stringify({
          items: [{ type: 'video', id: 'video-a' }],
          message: 'Deleted.',
        }),
        message: null,
        raw: {},
      },
      'remove the flash transitions from all videos except video 6',
      manifest
    )
    expect(attempt.status).toBe('validation_failed')
    expect(attempt.response.message).toMatch(/set_transitions/i)
  })

  it('rejects partial range splits when rules expect more items', () => {
    const imageManifest = {
      images: [
        { id: 'img-1', name: 'A', startTime: 0, endTime: 2 },
        { id: 'img-2', name: 'B', startTime: 2, endTime: 4 },
        { id: 'img-3', name: 'C', startTime: 4, endTime: 6 },
        { id: 'img-4', name: 'D', startTime: 6, endTime: 8 },
      ],
    }
    const attempt = processLocalLlmToolResult(
      {
        toolName: 'split_at_marks',
        toolArguments: JSON.stringify({
          splits: [{ type: 'image', id: 'img-2', times: [3] }],
          message: 'Split image 2.',
        }),
        message: null,
        raw: {},
      },
      'split images 2-4 into 2',
      imageManifest
    )
    expect(attempt.status).toBe('validation_failed')
    expect(attempt.validationError).toMatch(/Expected 3 splits/)
    expect(shouldTryRuleFallback(attempt)).toBe(true)
  })

  it('accepts valid replace_images tool output', () => {
    const imageManifest = {
      images: [
        { id: 'img-1', name: 'A', startTime: 0, endTime: 2 },
        { id: 'img-2', name: 'B', startTime: 2, endTime: 4 },
      ],
    }
    const uploadedFiles = [{ index: 0, name: 'a.png', type: 'image' as const }]
    const attempt = processLocalLlmToolResult(
      {
        toolName: 'replace_images',
        toolArguments: JSON.stringify({
          replacements: [
            { targetId: 'img-1', fileIndex: 0 },
            { targetId: 'img-2', fileIndex: 0 },
          ],
          message: 'Replaced images.',
        }),
        message: null,
        raw: {},
      },
      'replace images 1-2',
      imageManifest,
      uploadedFiles
    )
    expect(attempt.status).toBe('success')
    expect(attempt.response.action).toBe('replace_images')
  })

  it('rejects replace_with_solid when prompt asks for a spanning solid image', () => {
    const imageManifest = {
      images: [
        { id: 'img-1', name: 'A', startTime: 0, endTime: 2 },
        { id: 'img-2', name: 'B', startTime: 2, endTime: 4 },
        { id: 'img-3', name: 'C', startTime: 4, endTime: 6 },
        { id: 'img-4', name: 'D', startTime: 6, endTime: 8 },
      ],
    }
    const attempt = processLocalLlmToolResult(
      {
        toolName: 'replace_with_solid',
        toolArguments: JSON.stringify({
          solidReplacements: [{ targetId: 'img-4', color: '#ffffff' }],
          message: 'Replaced image 4.',
        }),
        message: null,
        raw: {},
      },
      'make a white image the length of images 1-4',
      imageManifest
    )
    expect(attempt.status).toBe('validation_failed')
    expect(attempt.validationError).toMatch(/add_solid_image/)
    expect(shouldTryRuleFallback(attempt)).toBe(true)
  })
})
