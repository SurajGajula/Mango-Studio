export type WebLlmChatTool = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export const WEB_LLM_NO_OP_TOOL: WebLlmChatTool = {
  type: 'function',
  function: {
    name: 'no_op',
    description:
      "Use when the user's message cannot be fulfilled by timeline editing — greetings, questions, or generation requests.",
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Short message explaining what is supported.',
        },
      },
      required: ['reason'],
    },
  },
}

export const WEB_LLM_EDIT_MANIFEST_TOOL: WebLlmChatTool = {
  type: 'function',
  function: {
    name: 'edit_manifest',
    description:
      'Edit existing timeline items. Include every field being changed in each mutation. Supports mute, opacity, row, timing (startTime, endTime, timestamp, duration), playbackSpeed, trimStart/trimEnd (audio), text style/centerOnCanvas.',
    parameters: {
      type: 'object',
      properties: {
        mutations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                description: 'One of updateImage, updateVideo, updateText, updateAudio.',
              },
              id: { type: 'string' },
              muted: { type: 'boolean' },
              opacity: { type: 'number', description: '0.0 to 1.0' },
              row: { type: 'number' },
              startTime: { type: 'number' },
              endTime: { type: 'number' },
              timestamp: { type: 'number', description: 'Video start time on timeline' },
              duration: { type: 'number', description: 'Video duration in seconds' },
              trimStart: { type: 'number' },
              trimEnd: { type: 'number' },
              playbackSpeed: { type: 'number' },
              style: { type: 'string', description: 'Text style: normal, negative, highlight' },
              centerOnCanvas: { type: 'boolean' },
            },
            required: ['type', 'id'],
          },
        },
        message: { type: 'string' },
      },
      required: ['mutations', 'message'],
    },
  },
}

export const WEB_LLM_DELETE_TIMELINE_TOOL: WebLlmChatTool = {
  type: 'function',
  function: {
    name: 'delete_timeline_items',
    description:
      'Remove timeline items by exact id from the manifest. Use type "audio" for Audios section ids, "video" for Videos section ids, "image" for Images, "text" for Texts, "effect" for Effects. Never use type video when deleting audio.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                description: 'One of image, video, text, audio, effect.',
              },
              id: { type: 'string' },
            },
            required: ['type', 'id'],
          },
        },
        message: { type: 'string' },
      },
      required: ['items', 'message'],
    },
  },
}

export const WEB_LLM_SET_TRANSITIONS_TOOL: WebLlmChatTool = {
  type: 'function',
  function: {
    name: 'set_transitions',
    description:
      'Set or remove animation/transition on timeline images or videos. Include one object per target clip. Animations: zoom-in, zoom-out, stretch-out, shake, jitter, rotate, slide-shake-left, slide-shake-right. To remove use animation "none" or transition "none". Property fields: animationDuration, transitionDuration, zoomIntensity (shake/jitter intensity), animationZoomEasing. Transitions: none, fade, wipe, morph, split, slide-in, circle, rotate, flash.',
    parameters: {
      type: 'object',
      properties: {
        transitions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', description: 'image or video' },
              id: { type: 'string' },
              animation: { type: 'string' },
              transition: { type: 'string' },
              animationDuration: { type: 'number', description: 'Animation length in seconds' },
              transitionDuration: { type: 'number', description: 'Transition length in seconds' },
              zoomIntensity: { type: 'number', description: 'Shake/jitter intensity 0.0–1.0' },
              animationZoomEasing: {
                type: 'string',
                description: 'Zoom easing: constant, fast-slow, or slow-fast',
              },
            },
            required: ['type', 'id'],
          },
        },
        message: { type: 'string' },
      },
      required: ['transitions', 'message'],
    },
  },
}

export const WEB_LLM_REPLACE_IMAGES_TOOL: WebLlmChatTool = {
  type: 'function',
  function: {
    name: 'replace_images',
    description:
      'Replace timeline images, videos, or audios with attached uploads. Requires attached files. When one file is uploaded and the user says "replace images 2-5", map every target to fileIndex 0. Match file type to target kind.',
    parameters: {
      type: 'object',
      properties: {
        replacements: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              targetId: { type: 'string', description: 'Exact timeline item id from the manifest.' },
              fileIndex: { type: 'number', description: '0-based index of the attached file.' },
            },
            required: ['targetId', 'fileIndex'],
          },
        },
        message: { type: 'string' },
      },
      required: ['replacements', 'message'],
    },
  },
}

export const WEB_LLM_ADD_SOLID_IMAGE_TOOL: WebLlmChatTool = {
  type: 'function',
  function: {
    name: 'add_solid_image',
    description:
      'Add ONE new solid-color image clip. Use for "make/add a white image the length of images 1-4": startTime = image #1 startTime, endTime = image #4 endTime. Colors: white #ffffff, black #000000, gray #808080, red #ff0000, green #00aa00, blue #0066ff. Do NOT use this to overwrite existing clips — use replace_with_solid for that.',
    parameters: {
      type: 'object',
      properties: {
        images: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              color: { type: 'string', description: 'CSS color from Shapes presets or hex.' },
              startTime: { type: 'number', description: 'Timeline start in seconds.' },
              endTime: { type: 'number', description: 'Timeline end in seconds.' },
            },
            required: ['color', 'startTime', 'endTime'],
          },
        },
        message: { type: 'string' },
      },
      required: ['images', 'message'],
    },
  },
}

export const WEB_LLM_REPLACE_WITH_SOLID_TOOL: WebLlmChatTool = {
  type: 'function',
  function: {
    name: 'replace_with_solid',
    description:
      'Replace EXISTING timeline images or videos with a solid shape color. Use for "make every other image blue", "replace images 1-4 with white", "make image 2 red". Include one replacements entry per target with exact manifest id. every other => odd #1,#3,#5... Colors: white #ffffff, black #000000, gray #808080, red #ff0000, green #00aa00, blue #0066ff.',
    parameters: {
      type: 'object',
      properties: {
        replacements: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              targetId: { type: 'string', description: 'Exact timeline image or video id.' },
              color: { type: 'string', description: 'CSS color from Shapes presets or hex.' },
            },
            required: ['targetId', 'color'],
          },
        },
        message: { type: 'string' },
      },
      required: ['replacements', 'message'],
    },
  },
}

export const WEB_LLM_ADD_TEXT_TOOL: WebLlmChatTool = {
  type: 'function',
  function: {
    name: 'add_text',
    description: 'Add text overlays to the timeline.',
    parameters: {
      type: 'object',
      properties: {
        texts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              content: { type: 'string' },
              startTime: { type: 'number' },
              endTime: { type: 'number' },
            },
            required: ['content', 'startTime', 'endTime'],
          },
        },
        message: { type: 'string' },
      },
      required: ['texts', 'message'],
    },
  },
}

export const WEB_LLM_SPLIT_TOOL: WebLlmChatTool = {
  type: 'function',
  function: {
    name: 'split_at_marks',
    description:
      'Split images, videos, texts, or audios into equal parts or at timeline positions. Expand ranges ("images 2-9"). One splits entry per item with exact manifest id. For N equal parts ("into N", "in half"=2): times = [start+span*1/N, ..., start+span*(N-1)/N] in absolute timeline seconds. Images/texts/audios use startTime/endTime; videos use timestamp and duration.',
    parameters: {
      type: 'object',
      properties: {
        splits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', description: 'image, video, text, or audio' },
              id: { type: 'string', description: 'Exact manifest id' },
              times: {
                type: 'array',
                items: { type: 'number' },
                description: 'Absolute timeline split seconds strictly inside the item.',
              },
            },
            required: ['type', 'id', 'times'],
          },
        },
        message: { type: 'string' },
      },
      required: ['splits', 'message'],
    },
  },
}

export const WEB_LLM_DUPLICATE_TOOL: WebLlmChatTool = {
  type: 'function',
  function: {
    name: 'duplicate_timeline_range',
    description:
      'Duplicate a contiguous range of images or videos by manifest #N order. Copy is placed immediately after the original block.',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', description: 'image or video' },
        firstNumber: { type: 'number' },
        lastNumber: { type: 'number' },
        message: { type: 'string' },
      },
      required: ['kind', 'firstNumber', 'lastNumber', 'message'],
    },
  },
}

export const WEB_LLM_CROP_TOOL: WebLlmChatTool = {
  type: 'function',
  function: {
    name: 'set_crop',
    description: 'Set aspect ratio crop on images or videos. cropAspect: 16:9, 4:3, 1:1, 3:4, 9:16, or none.',
    parameters: {
      type: 'object',
      properties: {
        crops: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', description: 'image or video' },
              id: { type: 'string' },
              cropAspect: { type: 'string' },
            },
            required: ['type', 'id', 'cropAspect'],
          },
        },
        message: { type: 'string' },
      },
      required: ['crops', 'message'],
    },
  },
}

export const WEB_LLM_EFFECT_TOOL: WebLlmChatTool = {
  type: 'function',
  function: {
    name: 'add_effect',
    description:
      'Add visual effects over a time range. Types: crt-dither, flashing-black-vignette, black-and-white, vivid-sharp, pixel-glitch-scan, grainy.',
    parameters: {
      type: 'object',
      properties: {
        effects: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              startTime: { type: 'number' },
              endTime: { type: 'number' },
              intensity: { type: 'number' },
            },
            required: ['type', 'startTime', 'endTime'],
          },
        },
        message: { type: 'string' },
      },
      required: ['effects', 'message'],
    },
  },
}

export const WEB_LLM_STEP_GROWTH_TOOL: WebLlmChatTool = {
  type: 'function',
  function: {
    name: 'set_step_growth',
    description: 'Make an image grow in equal steps to full frame size.',
    parameters: {
      type: 'object',
      properties: {
        grows: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              imageNumber: { type: 'number' },
              target: { type: 'string' },
              steps: { type: 'number' },
            },
          },
        },
        message: { type: 'string' },
      },
      required: ['grows', 'message'],
    },
  },
}

export const WEB_LLM_NORMALIZE_AUDIO_TOOL: WebLlmChatTool = {
  type: 'function',
  function: {
    name: 'normalize_audio_volumes',
    description: 'Match perceived loudness of target audio clips to a reference audio clip.',
    parameters: {
      type: 'object',
      properties: {
        referenceAudioNumber: { type: 'number' },
        targetAudioNumbers: { type: 'array', items: { type: 'number' } },
        message: { type: 'string' },
      },
      required: ['referenceAudioNumber', 'targetAudioNumbers', 'message'],
    },
  },
}

export const WEB_LLM_ROUTE_TEST_TOOL = WEB_LLM_EDIT_MANIFEST_TOOL

export const WEB_LLM_EDIT_EXPERIMENT_TOOLS: WebLlmChatTool[] = [
  WEB_LLM_EDIT_MANIFEST_TOOL,
  WEB_LLM_NO_OP_TOOL,
]

export const WEB_LLM_SPLIT_EXPERIMENT_TOOLS: WebLlmChatTool[] = [
  WEB_LLM_SPLIT_TOOL,
  WEB_LLM_NO_OP_TOOL,
]

export const WEB_LLM_DUPLICATE_EXPERIMENT_TOOLS: WebLlmChatTool[] = [
  WEB_LLM_DUPLICATE_TOOL,
  WEB_LLM_NO_OP_TOOL,
]

export const WEB_LLM_CROP_EXPERIMENT_TOOLS: WebLlmChatTool[] = [
  WEB_LLM_CROP_TOOL,
  WEB_LLM_NO_OP_TOOL,
]

export const WEB_LLM_EFFECT_EXPERIMENT_TOOLS: WebLlmChatTool[] = [
  WEB_LLM_EFFECT_TOOL,
  WEB_LLM_NO_OP_TOOL,
]

export const WEB_LLM_STEP_GROWTH_EXPERIMENT_TOOLS: WebLlmChatTool[] = [
  WEB_LLM_STEP_GROWTH_TOOL,
  WEB_LLM_NO_OP_TOOL,
]

export const WEB_LLM_NORMALIZE_AUDIO_EXPERIMENT_TOOLS: WebLlmChatTool[] = [
  WEB_LLM_NORMALIZE_AUDIO_TOOL,
  WEB_LLM_NO_OP_TOOL,
]

export const WEB_LLM_DELETE_EXPERIMENT_TOOLS: WebLlmChatTool[] = [
  WEB_LLM_DELETE_TIMELINE_TOOL,
  WEB_LLM_NO_OP_TOOL,
]

export const WEB_LLM_TRANSITION_EXPERIMENT_TOOLS: WebLlmChatTool[] = [
  WEB_LLM_SET_TRANSITIONS_TOOL,
  WEB_LLM_NO_OP_TOOL,
]

export const WEB_LLM_REPLACE_IMAGES_EXPERIMENT_TOOLS: WebLlmChatTool[] = [
  WEB_LLM_REPLACE_IMAGES_TOOL,
  WEB_LLM_NO_OP_TOOL,
]

export const WEB_LLM_ADD_SOLID_IMAGE_EXPERIMENT_TOOLS: WebLlmChatTool[] = [
  WEB_LLM_ADD_SOLID_IMAGE_TOOL,
  WEB_LLM_NO_OP_TOOL,
]

export const WEB_LLM_SOLID_MEDIA_EXPERIMENT_TOOLS: WebLlmChatTool[] = [
  WEB_LLM_REPLACE_WITH_SOLID_TOOL,
  WEB_LLM_ADD_SOLID_IMAGE_TOOL,
  WEB_LLM_NO_OP_TOOL,
]

export const WEB_LLM_SOLID_MEDIA_WITH_FILES_EXPERIMENT_TOOLS: WebLlmChatTool[] = [
  WEB_LLM_REPLACE_IMAGES_TOOL,
  WEB_LLM_REPLACE_WITH_SOLID_TOOL,
  WEB_LLM_ADD_SOLID_IMAGE_TOOL,
  WEB_LLM_NO_OP_TOOL,
]

export const WEB_LLM_ADD_TEXT_EXPERIMENT_TOOLS: WebLlmChatTool[] = [
  WEB_LLM_ADD_TEXT_TOOL,
  WEB_LLM_NO_OP_TOOL,
]

export const WEB_LLM_FULL_ROUTING_EXPERIMENT_TOOLS: WebLlmChatTool[] = [
  WEB_LLM_EDIT_MANIFEST_TOOL,
  WEB_LLM_DELETE_TIMELINE_TOOL,
  WEB_LLM_SET_TRANSITIONS_TOOL,
  WEB_LLM_ADD_TEXT_TOOL,
  WEB_LLM_ADD_SOLID_IMAGE_TOOL,
  WEB_LLM_REPLACE_IMAGES_TOOL,
  WEB_LLM_REPLACE_WITH_SOLID_TOOL,
  WEB_LLM_SPLIT_TOOL,
  WEB_LLM_DUPLICATE_TOOL,
  WEB_LLM_CROP_TOOL,
  WEB_LLM_EFFECT_TOOL,
  WEB_LLM_STEP_GROWTH_TOOL,
  WEB_LLM_NORMALIZE_AUDIO_TOOL,
  WEB_LLM_NO_OP_TOOL,
]

export const WEB_LLM_LOCAL_CHAT_TOOLS = WEB_LLM_FULL_ROUTING_EXPERIMENT_TOOLS

export const WEB_LLM_ROUTE_TEST_PROMPT =
  'Mute all videos on the timeline.\n\nCurrent timeline:\nVideos (2):\n  - #1 id="video-alpha" title="Intro" muted=false\n  - #2 id="video-beta" title="B-roll" muted=false'
