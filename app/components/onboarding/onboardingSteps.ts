export type OnboardingStepPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center'

export type OnboardingStep = {
  id: string
  title: string
  description: string
  target?: string
  placement?: OnboardingStepPlacement
  tip?: string
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Mango Studio',
    description:
      'You are in the editor. This quick tour shows how to upload media, arrange clips on the timeline, and export a finished video.',
    placement: 'center',
  },
  {
    id: 'upload',
    title: 'Upload your media',
    description:
      'Add videos, images, or audio to your library. Everything you upload stays in your account and can be reused across projects.',
    target: '[data-onboarding="upload"]',
    placement: 'right',
    tip: 'You can also drag files straight onto the timeline.',
  },
  {
    id: 'timeline',
    title: 'Build on the timeline',
    description:
      'Drag items from your library onto the timeline, trim clips, and preview your edit in real time. The playhead shows where you are in the video.',
    target: '[data-onboarding="timeline"]',
    placement: 'top',
    tip: 'Press the play button to preview, or use the toolbar upload to add clips at the playhead.',
  },
  {
    id: 'export',
    title: 'Export your video',
    description:
      'When your timeline has at least one video or image clip, click Export to render and download an MP4.',
    target: '[data-onboarding="export"]',
    placement: 'top',
    tip: 'Export runs in your browser — no upload required.',
  },
  {
    id: 'complete',
    title: 'You are ready to edit',
    description:
      'Upload a clip, drop it on the timeline, tweak your edit, then export. You can replay this tour anytime from the help menu in the media panel.',
    placement: 'center',
  },
]
