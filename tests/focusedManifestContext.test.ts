import { describe, expect, it } from 'vitest'
import { buildFocusedLocalManifestContext } from '@/app/lib/webLlm/buildFocusedLocalManifestContext'
import { parsePromptManifestFilter } from '@/app/lib/webLlm/parsePromptManifestFilter'

describe('parsePromptManifestFilter', () => {
  it('parses multiple video numbers from an and phrase', () => {
    const filter = parsePromptManifestFilter('add shake animations to videos 9 and 10')
    expect(filter.sections.has('video')).toBe(true)
    expect(filter.itemNumbers.video).toEqual([9, 10])
  })

  it('defaults to images and videos when no section is named', () => {
    const filter = parsePromptManifestFilter('mute everything on the timeline')
    expect(filter.sections.has('image')).toBe(true)
    expect(filter.sections.has('video')).toBe(true)
  })
})

describe('buildFocusedLocalManifestContext', () => {
  const manifest = {
    images: Array.from({ length: 20 }, (_, index) => ({
      id: `image-${index + 1}`,
      name: `Image ${index + 1}`,
      startTime: index,
      endTime: index + 1,
    })),
    videos: Array.from({ length: 12 }, (_, index) => ({
      id: `video-${index + 1}`,
      title: `Video ${index + 1}`,
      timestamp: index * 2,
      duration: 2,
      animation: 'none',
      transition: 'none',
    })),
    audios: [
      {
        id: 'audio-1',
        name: 'Music',
        startTime: 0,
        endTime: 18,
        originalDuration: 18,
        marks: [{ t: 1.5 }, { t: 3.0 }],
      },
      {
        id: 'audio-2',
        name: 'Voice',
        startTime: 0,
        endTime: 10,
        originalDuration: 10,
      },
    ],
  }

  it('includes only referenced videos with original numbering', () => {
    const context = buildFocusedLocalManifestContext(
      'add shake animations to videos 9 and 10',
      manifest
    )

    expect(context).toContain('Videos (12 total, showing #9, #10)')
    expect(context).toContain('#9 id="video-9"')
    expect(context).toContain('#10 id="video-10"')
    expect(context).not.toContain('video-1"')
    expect(context).not.toContain('Images (')
    expect(context).not.toContain('Audios (')
  })

  it('omits verbose audio marks unless splitting audio', () => {
    const withoutMarks = buildFocusedLocalManifestContext('match audio 1 to audio 2', manifest)
    expect(withoutMarks).not.toContain('marksSourceFileSeconds')

    const withMarks = buildFocusedLocalManifestContext('split audio 1 at marks', manifest)
    expect(withMarks).toContain('trim=')
  })
})
