import { describe, expect, it } from 'vitest'
import { resolveLocalCropIntent } from '@/app/lib/webLlm/localCropIntent'
import { resolveLocalDeleteIntent } from '@/app/lib/webLlm/localDeleteIntent'
import { resolveLocalDuplicateIntent } from '@/app/lib/webLlm/localDuplicateIntent'
import { resolveLocalAnimationIntent } from '@/app/lib/webLlm/localAnimationIntent'
import { resolveLocalEditManifestIntent } from '@/app/lib/webLlm/localEditManifestIntent'
import { resolveLocalAddSolidImageIntent } from '@/app/lib/webLlm/localAddSolidImageIntent'
import { resolveLocalReplaceImagesIntent } from '@/app/lib/webLlm/localReplaceImagesIntent'
import { resolveLocalReplaceSolidIntent } from '@/app/lib/webLlm/localReplaceSolidIntent'
import { tryHighConfidenceRuleRoute } from '@/app/lib/webLlm/localRuleRouter'
import { resolveLocalSplitIntent } from '@/app/lib/webLlm/localSplitIntent'
import { resolveLocalTransitionIntent } from '@/app/lib/webLlm/localTransitionIntent'
import { selectLocalChatTools } from '@/app/lib/webLlm/selectLocalChatTools'
import { getLocalUnsupportedPromptReason } from '@/app/lib/webLlm/localUnsupportedPrompt'
import { mapLocalToolCallToRouteResponse } from '@/app/lib/webLlm/mapLocalToolCall'
import {
  localDeleteIntentMismatch,
  sanitizeLocalRouteResponse,
} from '@/app/lib/webLlm/sanitizeLocalRouteResponse'
import { validateLocalRouteResponse } from '@/app/lib/webLlm/validateLocalRouteResponse'

describe('localUnsupportedPrompt', () => {
  it('blocks generation requests', () => {
    expect(getLocalUnsupportedPromptReason('Generate a cat image')).toMatch(/generation/i)
  })

  it('allows timeline edits', () => {
    expect(getLocalUnsupportedPromptReason('Mute all videos')).toBeNull()
  })

  it('allows make-white-image shape requests', () => {
    expect(
      getLocalUnsupportedPromptReason('make a white image the length of images 1-4')
    ).toBeNull()
  })

  it('still blocks generative make image requests', () => {
    expect(getLocalUnsupportedPromptReason('make a photorealistic cat image')).toMatch(/generation/i)
  })
})

describe('resolveLocalDeleteIntent', () => {
  const manifest = {
    videos: [
      { id: 'video-a', title: 'A', timestamp: 0, duration: 3 },
      { id: 'video-b', title: 'B', timestamp: 3, duration: 3 },
    ],
    audios: [{ id: 'audio-a', name: 'Song', startTime: 0, endTime: 10 }],
  }

  it('deletes audio items for "delete the audio"', () => {
    const result = resolveLocalDeleteIntent('delete the audio', manifest)
    expect(result?.action).toBe('delete_timeline_items')
    expect(result?.deleteItems).toEqual([{ type: 'audio', id: 'audio-a' }])
  })

  it('does not delete videos when audio is requested', () => {
    const result = resolveLocalDeleteIntent('delete the audio', manifest)
    expect(result?.deleteItems?.some((item) => item.type === 'video')).toBe(false)
  })

  it('deletes a numbered video when requested', () => {
    const result = resolveLocalDeleteIntent('delete video 2', manifest)
    expect(result?.deleteItems).toEqual([{ type: 'video', id: 'video-b' }])
  })
})

describe('sanitizeLocalRouteResponse', () => {
  it('fixes delete item types from manifest ids', () => {
    const response = sanitizeLocalRouteResponse(
      mapLocalToolCallToRouteResponse(
        'delete_timeline_items',
        JSON.stringify({
          items: [{ type: 'video', id: 'audio-a' }],
          message: 'Deleted.',
        })
      ),
      {
        audios: [{ id: 'audio-a', name: 'Song', startTime: 0, endTime: 10 }],
      }
    )

    expect(response.deleteItems).toEqual([{ type: 'audio', id: 'audio-a' }])
  })

  it('rejects video deletes for audio prompts after sanitization', () => {
    const response = sanitizeLocalRouteResponse(
      mapLocalToolCallToRouteResponse(
        'delete_timeline_items',
        JSON.stringify({
          items: [
            { type: 'video', id: 'video-a' },
            { type: 'video', id: 'video-b' },
          ],
          message: 'Deleted.',
        })
      ),
      {
        videos: [
          { id: 'video-a', title: 'A', timestamp: 0, duration: 3 },
          { id: 'video-b', title: 'B', timestamp: 3, duration: 3 },
        ],
        audios: [{ id: 'audio-a', name: 'Song', startTime: 0, endTime: 10 }],
      }
    )

    expect(
      localDeleteIntentMismatch('delete the audio', response, {
        videos: [
          { id: 'video-a', title: 'A', timestamp: 0, duration: 3 },
          { id: 'video-b', title: 'B', timestamp: 3, duration: 3 },
        ],
        audios: [{ id: 'audio-a', name: 'Song', startTime: 0, endTime: 10 }],
      })
    ).toMatch(/instead of audio/i)
  })
})

describe('resolveLocalEditManifestIntent', () => {
  const manifest = {
    videos: [
      { id: 'video-a', title: 'Intro', timestamp: 0, duration: 3, muted: false },
      { id: 'video-b', title: 'B-roll', timestamp: 3, duration: 3, muted: false },
    ],
  }

  it('mutes all videos without calling the model', () => {
    const result = resolveLocalEditManifestIntent('Mute all videos on the timeline.', manifest)
    expect(result?.action).toBe('edit_manifest')
    expect(result?.mutations).toEqual([
      { type: 'updateVideo', id: 'video-a', muted: true },
      { type: 'updateVideo', id: 'video-b', muted: true },
    ])
  })

  it('sets opacity from a percentage', () => {
    const result = resolveLocalEditManifestIntent('Set video 1 opacity to 40%.', manifest)
    expect(result?.mutations).toEqual([{ type: 'updateVideo', id: 'video-a', opacity: 0.4 }])
  })
})

describe('resolveLocalTransitionIntent', () => {
  const manifest = {
    videos: [
      { id: 'video-a', title: 'Intro', timestamp: 0, duration: 3 },
      { id: 'video-b', title: 'B-roll', timestamp: 3, duration: 3 },
      { id: 'video-c', title: 'Outro', timestamp: 6, duration: 3 },
    ],
  }

  it('adds flash transitions to every video', () => {
    const result = resolveLocalTransitionIntent('add flash transitions to every video', manifest)
    expect(result?.action).toBe('set_transitions')
    expect(result?.transitions).toEqual([
      { type: 'video', id: 'video-a', transition: 'flash' },
      { type: 'video', id: 'video-b', transition: 'flash' },
      { type: 'video', id: 'video-c', transition: 'flash' },
    ])
  })

  it('routes flash-every-video through high-confidence rules', () => {
    const result = tryHighConfidenceRuleRoute('add flash transitions to every video', manifest)
    expect(result?.action).toBe('set_transitions')
    expect(result?.transitions).toHaveLength(3)
    expect(result?.transitions?.every((entry) => entry.transition === 'flash')).toBe(true)
  })

  it('sets flash duration on every video', () => {
    const result = resolveLocalTransitionIntent(
      'set flash duration to 0.5 on every video',
      manifest
    )
    expect(result?.transitions).toEqual([
      { type: 'video', id: 'video-a', transition: 'flash', transitionDuration: 0.5 },
      { type: 'video', id: 'video-b', transition: 'flash', transitionDuration: 0.5 },
      { type: 'video', id: 'video-c', transition: 'flash', transitionDuration: 0.5 },
    ])
  })

  it('sets negative flash mode and color', () => {
    const result = resolveLocalTransitionIntent(
      'add negative flash transitions with white color to every video',
      manifest
    )
    expect(result?.transitions).toEqual([
      {
        type: 'video',
        id: 'video-a',
        transition: 'flash',
        transitionColor: '#ffffff',
        transitionFlashMode: 'negative',
      },
      {
        type: 'video',
        id: 'video-b',
        transition: 'flash',
        transitionColor: '#ffffff',
        transitionFlashMode: 'negative',
      },
      {
        type: 'video',
        id: 'video-c',
        transition: 'flash',
        transitionColor: '#ffffff',
        transitionFlashMode: 'negative',
      },
    ])
  })

  it('adds fade to a single numbered image', () => {
    const imageManifest = {
      images: [{ id: 'img-1', name: 'Cover', startTime: 0, endTime: 3 }],
    }
    const result = resolveLocalTransitionIntent('Add a fade transition to image 1.', imageManifest)
    expect(result?.transitions).toEqual([{ type: 'image', id: 'img-1', transition: 'fade' }])
  })

  it('removes flash transitions from all videos except one', () => {
    const manifest = {
      videos: [
        { id: 'video-a', title: 'A', timestamp: 0, duration: 3, transition: 'flash' },
        { id: 'video-b', title: 'B', timestamp: 3, duration: 3, transition: 'flash' },
        { id: 'video-c', title: 'C', timestamp: 6, duration: 3, transition: 'none' },
        { id: 'video-d', title: 'D', timestamp: 9, duration: 3, transition: 'flash' },
        { id: 'video-e', title: 'E', timestamp: 12, duration: 3, transition: 'flash' },
        { id: 'video-f', title: 'F', timestamp: 15, duration: 3, transition: 'flash' },
      ],
    }
    const result = resolveLocalTransitionIntent(
      'remove the flash transitions from all videos except video 6',
      manifest
    )
    expect(result?.action).toBe('set_transitions')
    expect(result?.transitions).toEqual([
      { type: 'video', id: 'video-a', transition: 'none' },
      { type: 'video', id: 'video-b', transition: 'none' },
      { type: 'video', id: 'video-d', transition: 'none' },
      { type: 'video', id: 'video-e', transition: 'none' },
    ])
  })
})

describe('resolveLocalAnimationIntent', () => {
  const manifest = {
    videos: [
      { id: 'video-a', title: 'Intro', timestamp: 0, duration: 3 },
      { id: 'video-b', title: 'B-roll', timestamp: 3, duration: 3 },
      { id: 'video-c', title: 'Outro', timestamp: 6, duration: 3 },
    ],
    images: [{ id: 'img-1', name: 'Cover', startTime: 0, endTime: 3 }],
  }

  it('adds zoom-in animation to every video', () => {
    const result = resolveLocalAnimationIntent('Add zoom in animation to every video.', manifest)
    expect(result?.action).toBe('set_transitions')
    expect(result?.transitions).toEqual([
      { type: 'video', id: 'video-a', animation: 'zoom-in' },
      { type: 'video', id: 'video-b', animation: 'zoom-in' },
      { type: 'video', id: 'video-c', animation: 'zoom-in' },
    ])
  })

  it('adds shake animation to a numbered image', () => {
    const result = resolveLocalAnimationIntent('Add shake animation to image 1.', manifest)
    expect(result?.transitions).toEqual([{ type: 'image', id: 'img-1', animation: 'shake' }])
  })

  it('sets animation duration on a numbered video', () => {
    const result = resolveLocalAnimationIntent('Set video 2 animation duration to 2 seconds.', manifest)
    expect(result?.transitions).toEqual([
      { type: 'video', id: 'video-b', animationDuration: 2 },
    ])
  })

  it('sets shake intensity as a fraction from percent', () => {
    const result = resolveLocalAnimationIntent('Set image 1 shake intensity to 60%.', manifest)
    expect(result?.transitions).toEqual([{ type: 'image', id: 'img-1', zoomIntensity: 0.6 }])
  })

  it('removes animations from all videos', () => {
    const result = resolveLocalAnimationIntent('Remove animations from all videos.', manifest)
    expect(result?.action).toBe('set_transitions')
    expect(result?.transitions).toEqual([
      { type: 'video', id: 'video-a', animation: 'none' },
      { type: 'video', id: 'video-b', animation: 'none' },
      { type: 'video', id: 'video-c', animation: 'none' },
    ])
  })

  it('adds shake to multiple numbered videos', () => {
    const largeManifest = {
      videos: Array.from({ length: 10 }, (_, index) => ({
        id: `video-${index + 1}`,
        title: `Clip ${index + 1}`,
        timestamp: index * 2,
        duration: 2,
      })),
    }
    const result = resolveLocalAnimationIntent(
      'add shake animations to videos 9 and 10',
      largeManifest
    )
    expect(result?.transitions).toEqual([
      { type: 'video', id: 'video-9', animation: 'shake' },
      { type: 'video', id: 'video-10', animation: 'shake' },
    ])
  })
})

describe('selectLocalChatTools', () => {
  it('uses transition tools for flash prompts', () => {
    const tools = selectLocalChatTools('add flash transitions to every video')
    expect(tools.map((tool) => tool.function.name)).toEqual(['set_transitions', 'no_op'])
  })

  it('uses transition tools for transition removal prompts', () => {
    const tools = selectLocalChatTools('remove the flash transitions from all videos except video 6')
    expect(tools.map((tool) => tool.function.name)).toEqual(['set_transitions', 'no_op'])
  })

  it('uses transition tools for animation prompts', () => {
    const tools = selectLocalChatTools('Add zoom in animation to every video.')
    expect(tools.map((tool) => tool.function.name)).toEqual(['set_transitions', 'no_op'])
  })

  it('uses a minimal tool set for mute prompts', () => {
    const tools = selectLocalChatTools('Mute all videos')
    expect(tools.map((tool) => tool.function.name)).toEqual(['edit_manifest', 'no_op'])
  })

  it('uses solid/media tools when files are attached for replace prompts', () => {
    const tools = selectLocalChatTools('replace images 1-3', [
      { index: 0, name: 'a.png', type: 'image' },
    ])
    expect(tools.map((tool) => tool.function.name)).toEqual([
      'replace_images',
      'replace_with_solid',
      'add_solid_image',
      'no_op',
    ])
  })

  it('uses solid/media tools for shape color prompts', () => {
    const tools = selectLocalChatTools('make every other image blue')
    expect(tools.map((tool) => tool.function.name)).toEqual([
      'replace_with_solid',
      'add_solid_image',
      'no_op',
    ])
  })

  it('uses split tools for range split prompts', () => {
    const tools = selectLocalChatTools('split images 2-9 into 2')
    expect(tools.map((tool) => tool.function.name)).toEqual(['split_at_marks', 'no_op'])
  })
})

describe('resolveLocalReplaceImagesIntent', () => {
  const manifest = {
    images: [
      { id: 'img-1', name: 'A', startTime: 0, endTime: 2 },
      { id: 'img-2', name: 'B', startTime: 2, endTime: 4 },
      { id: 'img-3', name: 'C', startTime: 4, endTime: 6 },
      { id: 'img-4', name: 'D', startTime: 6, endTime: 8 },
    ],
  }

  const oneImageFile = [{ index: 0, name: 'upload.png', type: 'image' as const }]
  const threeImageFiles = [
    { index: 0, name: 'a.png', type: 'image' as const },
    { index: 1, name: 'b.png', type: 'image' as const },
    { index: 2, name: 'c.png', type: 'image' as const },
  ]

  it('replaces an image range with one uploaded file', () => {
    const result = resolveLocalReplaceImagesIntent(
      'replace images 1-3',
      manifest,
      oneImageFile
    )
    expect(result?.action).toBe('replace_images')
    expect(result?.replacements).toEqual([
      { targetId: 'img-1', fileIndex: 0 },
      { targetId: 'img-2', fileIndex: 0 },
      { targetId: 'img-3', fileIndex: 0 },
    ])
  })

  it('maps one file per target when counts match', () => {
    const result = resolveLocalReplaceImagesIntent(
      'replace images 1-3',
      manifest,
      threeImageFiles
    )
    expect(result?.replacements).toEqual([
      { targetId: 'img-1', fileIndex: 0 },
      { targetId: 'img-2', fileIndex: 1 },
      { targetId: 'img-3', fileIndex: 2 },
    ])
  })

  it('routes replace-images with attachments through high-confidence rules', () => {
    const result = tryHighConfidenceRuleRoute(
      'replace images 1-8',
      {
        images: Array.from({ length: 8 }, (_, i) => ({
          id: `img-${i + 1}`,
          name: `Image ${i + 1}`,
          startTime: i * 2,
          endTime: (i + 1) * 2,
        })),
      },
      oneImageFile
    )
    expect(result?.action).toBe('replace_images')
    expect(result?.replacements).toHaveLength(8)
    expect(result?.replacements?.every((r) => r.fileIndex === 0)).toBe(true)
  })

  it('returns null without attachments', () => {
    expect(resolveLocalReplaceImagesIntent('replace images 1-3', manifest, [])).toBeNull()
  })
})

describe('resolveLocalReplaceSolidIntent', () => {
  const manifest = {
    images: [
      { id: 'img-1', name: 'A', startTime: 0, endTime: 2 },
      { id: 'img-2', name: 'B', startTime: 2, endTime: 4 },
      { id: 'img-3', name: 'C', startTime: 4, endTime: 6 },
      { id: 'img-4', name: 'D', startTime: 6, endTime: 8 },
    ],
  }

  it('replaces every other image with blue from shapes wording', () => {
    const result = resolveLocalReplaceSolidIntent(
      'replace every other image with a blue one using the blue image in the shapes',
      manifest
    )
    expect(result?.action).toBe('replace_with_solid')
    expect(result?.solidReplacements).toEqual([
      { targetId: 'img-1', color: '#0066ff' },
      { targetId: 'img-3', color: '#0066ff' },
    ])
  })

  it('replaces a numbered image with a solid color', () => {
    const result = resolveLocalReplaceSolidIntent('replace image 2 with red', manifest)
    expect(result?.solidReplacements).toEqual([{ targetId: 'img-2', color: '#ff0000' }])
  })

  it('adds a white image spanning an image range from make-white phrasing', () => {
    const result = resolveLocalAddSolidImageIntent(
      'make a white image the length of images 1-4',
      manifest
    )
    expect(result?.action).toBe('add_solid_image')
    expect(result?.newSolidImages).toEqual([{ color: '#ffffff', startTime: 0, endTime: 8 }])
  })

  it('routes make-white span prompts through high-confidence rules', () => {
    const result = tryHighConfidenceRuleRoute(
      'make a white image the length of images 1-4',
      manifest
    )
    expect(result?.action).toBe('add_solid_image')
    expect(result?.newSolidImages).toHaveLength(1)
    expect(result?.newSolidImages?.[0]).toEqual({ color: '#ffffff', startTime: 0, endTime: 8 })
  })

  it('does not treat span prompts as replace-with-solid', () => {
    const result = resolveLocalReplaceSolidIntent(
      'make a white image the length of images 1-4',
      manifest
    )
    expect(result).toBeNull()
  })
})

describe('validateLocalRouteResponse', () => {
  const manifest = {
    videos: [{ id: 'video-alpha', title: 'A', timestamp: 0, duration: 3, muted: false }],
  }

  it('rejects edit_manifest without edit fields', () => {
    const response = mapLocalToolCallToRouteResponse(
      'edit_manifest',
      JSON.stringify({
        mutations: [{ type: 'updateVideo', id: 'video-alpha' }],
        message: 'Done',
      })
    )
    expect(validateLocalRouteResponse(response, manifest)).toMatch(/missing edit fields/i)
  })

  it('accepts valid mute mutation', () => {
    const response = mapLocalToolCallToRouteResponse(
      'edit_manifest',
      JSON.stringify({
        mutations: [{ type: 'updateVideo', id: 'video-alpha', muted: true }],
        message: 'Muted video.',
      })
    )
    expect(validateLocalRouteResponse(response, manifest)).toBeNull()
  })

  it('accepts property-only set_transitions', () => {
    const response = mapLocalToolCallToRouteResponse(
      'set_transitions',
      JSON.stringify({
        transitions: [{ type: 'video', id: 'video-alpha', animationDuration: 2 }],
        message: 'Updated duration.',
      })
    )
    expect(validateLocalRouteResponse(response, manifest)).toBeNull()
  })
})

describe('resolveLocalEditManifestIntent timing', () => {
  const manifest = {
    images: [{ id: 'img-1', name: 'A', startTime: 0, endTime: 4 }],
    videos: [{ id: 'video-a', title: 'A', timestamp: 0, duration: 3 }],
    texts: [{ id: 'text-1', content: 'Hi', startTime: 0, endTime: 3 }],
  }

  it('sets image duration via endTime', () => {
    const result = resolveLocalEditManifestIntent('Set image 1 duration to 2 seconds.', manifest)
    expect(result?.mutations).toEqual([{ type: 'updateImage', id: 'img-1', endTime: 2 }])
  })

  it('moves video start timestamp', () => {
    const result = resolveLocalEditManifestIntent('Move video 1 to start at 5 seconds.', manifest)
    expect(result?.mutations).toEqual([{ type: 'updateVideo', id: 'video-a', timestamp: 5 }])
  })

  it('centers text on canvas', () => {
    const result = resolveLocalEditManifestIntent('Center text 1.', manifest)
    expect(result?.mutations).toEqual([{ type: 'updateText', id: 'text-1', centerOnCanvas: true }])
  })
})

describe('resolveLocalSplitIntent', () => {
  const manifest = {
    images: [
      { id: 'img-1', name: 'A', startTime: 0, endTime: 4 },
      { id: 'img-2', name: 'B', startTime: 4, endTime: 6 },
      { id: 'img-3', name: 'C', startTime: 6, endTime: 8 },
      { id: 'img-4', name: 'D', startTime: 8, endTime: 10 },
      { id: 'img-5', name: 'E', startTime: 10, endTime: 12 },
      { id: 'img-6', name: 'F', startTime: 12, endTime: 14 },
      { id: 'img-7', name: 'G', startTime: 14, endTime: 16 },
      { id: 'img-8', name: 'H', startTime: 16, endTime: 18 },
      { id: 'img-9', name: 'I', startTime: 18, endTime: 20 },
    ],
  }

  it('splits image in half', () => {
    const result = resolveLocalSplitIntent('Split image 1 in half.', manifest)
    expect(result?.action).toBe('split_at_marks')
    expect(result?.splits?.[0]).toEqual({ type: 'image', id: 'img-1', times: [2] })
  })

  it('splits image into N without requiring parts wording', () => {
    const result = resolveLocalSplitIntent('split image 1 into 36', manifest)
    expect(result?.action).toBe('split_at_marks')
    expect(result?.splits?.[0]?.id).toBe('img-1')
    expect(result?.splits?.[0]?.times).toHaveLength(35)
    expect(result?.splits?.[0]?.times?.[0]).toBeCloseTo(4 / 36, 8)
    expect(result?.splits?.[0]?.times?.[34]).toBeCloseTo((4 * 35) / 36, 8)
    expect(result?.message).toMatch(/36 equal parts/)
  })

  it('splits an image range into 2 each', () => {
    const result = resolveLocalSplitIntent('split images 2-9 into 2', manifest)
    expect(result?.action).toBe('split_at_marks')
    expect(result?.splits).toHaveLength(8)
    expect(result?.splits?.map((split) => split.id)).toEqual([
      'img-2',
      'img-3',
      'img-4',
      'img-5',
      'img-6',
      'img-7',
      'img-8',
      'img-9',
    ])
    expect(result?.splits?.[0]).toEqual({ type: 'image', id: 'img-2', times: [5] })
    expect(result?.splits?.[7]).toEqual({ type: 'image', id: 'img-9', times: [19] })
  })

  it('routes range split prompts through high-confidence rules', () => {
    const result = tryHighConfidenceRuleRoute('split images 2-9 into 2', manifest)
    expect(result?.action).toBe('split_at_marks')
    expect(result?.splits).toHaveLength(8)
  })
})

describe('resolveLocalDuplicateIntent', () => {
  it('duplicates image range', () => {
    const manifest = {
      images: [
        { id: 'img-1', name: 'A', startTime: 0, endTime: 2 },
        { id: 'img-2', name: 'B', startTime: 2, endTime: 4 },
        { id: 'img-3', name: 'C', startTime: 4, endTime: 6 },
      ],
    }
    const result = resolveLocalDuplicateIntent('Duplicate images 1 to 3.', manifest)
    expect(result?.duplicateRange).toEqual({ kind: 'image', firstNumber: 1, lastNumber: 3 })
  })
})

describe('resolveLocalCropIntent', () => {
  it('sets crop aspect', () => {
    const manifest = {
      images: [{ id: 'img-1', name: 'A', startTime: 0, endTime: 3 }],
    }
    const result = resolveLocalCropIntent('Set image 1 crop to 16:9.', manifest)
    expect(result?.crops).toEqual([{ type: 'image', id: 'img-1', cropAspect: '16:9' }])
  })
})
