import { FunctionCallingConfigMode, FunctionDeclaration, Tool, Type } from '@google/genai'

export const functionDeclarations: FunctionDeclaration[] = [
  {
    name: 'no_op',
    description: "Use this when the user's message cannot be fulfilled by editing the timeline — for example a question, a greeting, or a request that requires generating new content.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        reason: {
          type: Type.STRING,
          description: 'A short, friendly message explaining what is supported.',
        },
      },
      required: ['reason'],
    },
  },
  {
    name: 'edit_manifest',
    description: 'Edit, rearrange, resize, or synchronise existing items on the timeline. Use this when the user asks to change timing, duration, or position of existing images, videos, texts, or audio tracks — for example "make the image the same length as the audio" or "move the video to start at 5 seconds". For audio, you can also set trimStart and trimEnd to trim the audio file, or set both to 0 to restore the full original length.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        mutations: {
          type: Type.ARRAY,
          description: 'List of changes to apply to timeline items.',
          items: {
            type: Type.OBJECT,
            properties: {
              type: {
                type: Type.STRING,
                description: 'The kind of item to update. One of: updateImage, updateVideo, updateText, updateAudio.',
              },
              id: {
                type: Type.STRING,
                description: 'The id of the item to update.',
              },
              startTime: {
                type: Type.NUMBER,
                description: 'New start time in seconds (for images, texts, audios).',
              },
              endTime: {
                type: Type.NUMBER,
                description: 'New end time in seconds (for images, texts, audios).',
              },
              timestamp: {
                type: Type.NUMBER,
                description: 'New start timestamp in seconds (for videos on the main track).',
              },
              duration: {
                type: Type.NUMBER,
                description: 'New duration in seconds (for videos).',
              },
              trimStart: {
                type: Type.NUMBER,
                description: 'Seconds to hide from the beginning of the audio file (updateAudio only). Set to 0 to restore.',
              },
              trimEnd: {
                type: Type.NUMBER,
                description: 'Seconds to hide from the end of the audio file (updateAudio only). Set to 0 to restore full original length.',
              },
            },
            required: ['type', 'id'],
          },
        },
        message: {
          type: Type.STRING,
          description: 'A short confirmation message describing what was changed.',
        },
      },
      required: ['mutations', 'message'],
    },
  },
  {
    name: 'split_at_marks',
    description: "Split images or videos at the times of audio marks. Use this when the user asks to split, cut, or divide images or videos at the mark positions. For each item, include only the marks that fall within that item's time range.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        splits: {
          type: Type.ARRAY,
          description: 'List of items to split and the mark times at which to split them.',
          items: {
            type: Type.OBJECT,
            properties: {
              type: {
                type: Type.STRING,
                description: 'The type of item: "image" or "video".',
              },
              id: {
                type: Type.STRING,
                description: 'The id of the item to split.',
              },
              times: {
                type: Type.ARRAY,
                description: "The mark times (in seconds) within this item's range at which to split.",
                items: { type: Type.NUMBER },
              },
            },
            required: ['type', 'id', 'times'],
          },
        },
        message: {
          type: Type.STRING,
          description: 'A short confirmation message, e.g. "Image split at 3 mark positions."',
        },
      },
      required: ['splits', 'message'],
    },
  },
  {
    name: 'add_text',
    description: "Add one or more text overlays to the timeline. Use this when the user asks to add, insert, or place text at a specific time range — for example \"add text the length of the first image\" or \"add a subtitle from the second to the fifth image\". Compute startTime and endTime from the manifest data. The content should be taken from the user's prompt, or left as an empty string if not specified.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        texts: {
          type: Type.ARRAY,
          description: 'List of text overlays to add.',
          items: {
            type: Type.OBJECT,
            properties: {
              content: {
                type: Type.STRING,
                description: "The text content. Use the exact wording from the user's prompt, or an empty string if no content was specified.",
              },
              startTime: {
                type: Type.NUMBER,
                description: 'Start time in seconds.',
              },
              endTime: {
                type: Type.NUMBER,
                description: 'End time in seconds.',
              },
            },
            required: ['content', 'startTime', 'endTime'],
          },
        },
        message: {
          type: Type.STRING,
          description: 'A short confirmation message, e.g. "Text added from 0s to 5.2s."',
        },
      },
      required: ['texts', 'message'],
    },
  },
  {
    name: 'set_transitions',
    description: 'Set the transition (none, in, out, shake, split-horizontal, split-vertical, or jitter) on one or more images or videos. Use this when the user asks to set, apply, add, or remove transitions on timeline images or videos — for example "set zoom in on images 2 to 25", "add shake to image 1", or "remove transitions from all images". Use the image/video ids from the manifest.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        transitions: {
          type: Type.ARRAY,
          description: 'List of items to update with a transition.',
          items: {
            type: Type.OBJECT,
            properties: {
              type: {
                type: Type.STRING,
                description: 'The type of item: "image" or "video".',
              },
              id: {
                type: Type.STRING,
                description: 'The id of the image or video.',
              },
              zoom: {
                type: Type.STRING,
                description: 'The transition mode to apply: "none", "in", "out", "shake", "split-horizontal", "split-vertical", or "jitter".',
              },
              zoomIntensity: {
                type: Type.NUMBER,
                description: 'Zoom intensity as a fraction from 0.05 to 1.0. Default is 0.15 (15%). Only include if the user specifies an intensity or percentage, e.g. "50% intensity" → 0.5.',
              },
              transitionDuration: {
                type: Type.NUMBER,
                description: 'Duration of the transition in seconds (min 0.1s). Applicable for "in", "out", "split-horizontal", and "split-vertical". Defaults to 1.0s.',
              },
            },
            required: ['type', 'id', 'zoom'],
          },
        },
        message: {
          type: Type.STRING,
          description: 'A short confirmation message, e.g. "Zoom in applied to 24 images."',
        },
      },
      required: ['transitions', 'message'],
    },
  },
  {
    name: 'set_crop',
    description: 'Set the aspect ratio crop on one or more images. Use this when the user asks to change, set, or apply an aspect ratio to images — for example "make images 2-25 16:9" or "set image 1 to 1:1". The cropAspect must be one of: "16:9", "4:3", "1:1", "3:4", "9:16", or "none" (to remove the crop).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        crops: {
          type: Type.ARRAY,
          description: 'List of images to update with a crop aspect ratio.',
          items: {
            type: Type.OBJECT,
            properties: {
              id: {
                type: Type.STRING,
                description: 'The id of the image to crop.',
              },
              cropAspect: {
                type: Type.STRING,
                description: 'The target aspect ratio: "16:9", "4:3", "1:1", "3:4", "9:16", or "none" to remove the crop.',
              },
            },
            required: ['id', 'cropAspect'],
          },
        },
        message: {
          type: Type.STRING,
          description: 'A short confirmation message, e.g. "Set 24 images to 16:9."',
        },
      },
      required: ['crops', 'message'],
    },
  },
  {
    name: 'replace_images',
    description: 'Replace the source image of existing timeline images with uploaded files. Use this when the user attaches images and asks to replace, swap, or update existing images on the timeline with them. Map each target image id to the fileIndex of the uploaded file to use.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        replacements: {
          type: Type.ARRAY,
          description: 'List of replacements to perform.',
          items: {
            type: Type.OBJECT,
            properties: {
              targetId: {
                type: Type.STRING,
                description: 'The id of the existing timeline image to replace.',
              },
              fileIndex: {
                type: Type.NUMBER,
                description: 'The 0-based index of the uploaded file to use as the new source.',
              },
            },
            required: ['targetId', 'fileIndex'],
          },
        },
        message: {
          type: Type.STRING,
          description: 'A short confirmation message, e.g. "Replaced 24 images."',
        },
      },
      required: ['replacements', 'message'],
    },
  },
]

export const tools: Tool[] = [{ functionDeclarations }]

export const systemInstruction =
  'You are a timeline editing assistant for a media studio. Your only job is to call the correct function:\n' +
  '- edit_manifest: when the user asks to change timing, duration, or position of existing items. You MUST include all affected items as separate entries in the mutations array in a SINGLE call — never call edit_manifest multiple times. For audio mutations (type=updateAudio): ALWAYS use trimStart and trimEnd fields (not endTime). To restore an audio to its full original length set trimStart=0 and trimEnd=0. The active playing duration of an audio is: originalDuration - trimStart - trimEnd. ALWAYS use the exact id strings from the manifest (e.g. "audio-1234-abc") — never make up or shorten ids.\n' +
  '- split_at_marks: when the user asks to split, cut, or divide images or videos at audio mark positions (use the marks listed in the audio data)\n' +
  '- add_text: when the user asks to add text overlays to the timeline at a computed time range\n' +
  '- replace_images: when the user has attached files and asks to replace, swap, or update existing timeline images with them\n' +
  '- set_transitions: when the user asks to set, apply, add, or remove zoom transitions (none, in, out, shake, split-horizontal, split-vertical, or jitter) on images or videos; include zoomIntensity (0.05–1.0) if specified, or transitionDuration (default 1.0s) if specified\n' +
  '- set_crop: when the user asks to set or change the aspect ratio of images (e.g. "make images 2-25 16:9"); cropAspect must be one of "16:9", "4:3", "1:1", "3:4", "9:16", or "none"\n' +
  '- no_op: for anything else\n' +
  'Always call exactly one function. Compute exact numeric values from the timeline data provided.\n' +
  'When the user refers to "image 3", "video 2", etc., the number refers to the item\'s position when all items of that type are sorted by startTime — so "image 1" is the one with the earliest startTime, "image 2" is the next earliest, and so on. This ordering is reflected by the #N labels in the manifest context.'

export { FunctionCallingConfigMode }
