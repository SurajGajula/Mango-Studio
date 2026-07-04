import { describe, expect, it } from 'vitest'
import {
  promptIsTimelineItemDeletion,
  promptIsTransitionRemoval,
} from '@/app/lib/webLlm/localTransitionPrompt'

describe('localTransitionPrompt', () => {
  it('detects transition removal prompts', () => {
    expect(
      promptIsTransitionRemoval('remove the flash transitions from all videos except video 6')
    ).toBe(true)
  })

  it('does not treat transition removal as timeline item deletion', () => {
    expect(
      promptIsTimelineItemDeletion('remove the flash transitions from all videos except video 6')
    ).toBe(false)
    expect(promptIsTimelineItemDeletion('delete video 2')).toBe(true)
  })
})
