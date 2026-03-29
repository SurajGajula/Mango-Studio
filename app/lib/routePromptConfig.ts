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
    description: 'Edit, rearrange, resize, or synchronise existing items on the timeline. Use this when the user asks to change timing, duration, position, playback speed, or mute status of existing images, videos, texts, or audio tracks — for example "make the image the same length as the audio", "move the video to start at 5 seconds", "slow down the video to 0.5x speed", or "mute all videos". For audio, you can also set trimStart and trimEnd to trim the audio file, or set both to 0 to restore the full original length.',
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
              playbackSpeed: {
                type: Type.NUMBER,
                description: 'Playback speed as a multiplier (e.g. 0.5 for half speed, 2.0 for double speed). Only for videos and audios.',
              },
              speedStart: {
                type: Type.NUMBER,
                description: 'Initial playback speed for a speed ramp (e.g. 0.5). If specified, you should also include speedEnd.',
              },
              speedEnd: {
                type: Type.NUMBER,
                description: 'Final playback speed for a speed ramp (e.g. 0.1). If specified, you should also include speedStart.',
              },
              speedEasing: {
                type: Type.STRING,
                description: 'Easing for the speed ramp: "linear" or "ease". Default is "linear".',
              },
              muted: {
                type: Type.BOOLEAN,
                description: 'Whether the video should be muted. Only for videos.',
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
    name: 'delete_timeline_items',
    description:
      'Remove one or more items from the timeline by id. Use when the user asks to delete, remove, or clear specific images, videos, text overlays, or audio clips — for example "delete images 19 through 31" (resolve to ids from the manifest #N order). Include every item to remove in one call. Main-track removals shift later clips earlier automatically.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        items: {
          type: Type.ARRAY,
          description: 'Each entry removes one timeline item.',
          items: {
            type: Type.OBJECT,
            properties: {
              type: {
                type: Type.STRING,
                description: 'One of: image, video, text, audio.',
              },
              id: {
                type: Type.STRING,
                description: 'Exact id from the manifest for that item.',
              },
            },
            required: ['type', 'id'],
          },
        },
        message: {
          type: Type.STRING,
          description: 'Short confirmation, e.g. "Removed images #19–#31."',
        },
      },
      required: ['items', 'message'],
    },
  },
  {
    name: 'duplicate_timeline_range',
    description:
      'Duplicate a contiguous run of images or videos by their 1-based order when sorted by start time (images) or timestamp (videos), matching the #N labels in the manifest. The duplicate block is placed immediately after the end of the original block: each copy keeps the same duration and relative spacing, shifted so the first copy starts where the original block ended (e.g. images #2–#18 spanning 4s–20s reappear from 20s–36s). Following main-track content shifts right by the length of the block. Use kind "image" or "video" accordingly.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        kind: {
          type: Type.STRING,
          description: 'Either "image" or "video".',
        },
        firstNumber: {
          type: Type.NUMBER,
          description: 'First item number in the range (inclusive), 1-based, same as manifest #N.',
        },
        lastNumber: {
          type: Type.NUMBER,
          description: 'Last item number in the range (inclusive), 1-based.',
        },
        message: {
          type: Type.STRING,
          description: 'Short confirmation, e.g. "Duplicated images #2–#18 after 20s."',
        },
      },
      required: ['kind', 'firstNumber', 'lastNumber', 'message'],
    },
  },
  {
    name: 'split_at_marks',
    description: "Split images or videos into multiple segments. Use this when the user asks to split, cut, or divide items at specific positions, or into equal parts like halves or fourths. For equal parts, compute the split times yourself based on the item's startTime and endTime. For splitting at audio marks, include only the marks that fall within that item's time range.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        splits: {
          type: Type.ARRAY,
          description: 'List of items to split and the times at which to split them.',
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
                description: "The times (in seconds) at which to split the item. For halves, this is the midpoint. For fourths, these are the 25%, 50%, and 75% points.",
                items: { type: Type.NUMBER },
              },
            },
            required: ['type', 'id', 'times'],
          },
        },
        message: {
          type: Type.STRING,
          description: 'A short confirmation message, e.g. "Image split into 4 equal parts."',
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
    description: 'Set the animation (none, pulse, shake, or jitter) or transition (none, split, fade, slide-in, circle, rotate, or flash) on one or more images or videos. Use this when the user asks to set, apply, add, or remove animations or transitions on timeline images or videos — for example "set pulse on images 2 to 25", "add shake to image 1", "add split transition", "add fade transition", "add slide in from left", "add circle transition", "add rotate transition", "add white flash transition", "add black flash transition", or "remove animations from all images". For consolidated transitions like flash, slide-in, and split, you should also set the corresponding parameters (transitionColor, transitionDirection, transitionAxis) if specified. Use the image/video ids from the manifest.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        transitions: {
          type: Type.ARRAY,
          description: 'List of items to update with an animation or transition.',
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
              animation: {
                type: Type.STRING,
                description: 'The animation mode to apply: "none", "pulse", "shake", or "jitter".',
              },
              transition: {
                type: Type.STRING,
                description: 'The transition mode to apply: "none", "split", "fade", "slide-in", "circle", "rotate", or "flash".',
              },
              zoomIntensity: {
                type: Type.NUMBER,
                description: 'Zoom intensity as a fraction from 0.05 to 1.0. Default is 0.15 (15%). Only include if the user specifies an intensity or percentage, e.g. "50% intensity" → 0.5.',
              },
              transitionDuration: {
                type: Type.NUMBER,
                description: 'Duration of the transition in seconds (min 0.1s). Defaults to 1.0s.',
              },
              animationDuration: {
                type: Type.NUMBER,
                description: 'Duration of the animation (Pulse) in seconds (min 0.1s). Defaults to 1.0s.',
              },
              transitionColor: {
                type: Type.STRING,
                description: 'The color for flash transitions, e.g. "#FFFFFF" or "white".',
              },
              transitionDirection: {
                type: Type.STRING,
                description: 'The direction for slide-in transitions: "left", "right", "top", or "bottom".',
              },
              transitionAxis: {
                type: Type.STRING,
                description: 'The axis for split transitions: "horizontal" or "vertical".',
              },
            },
            required: ['type', 'id'],
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
    description: 'Set the aspect ratio crop on one or more images or videos. Use this when the user asks to change, set, or apply an aspect ratio to images or videos — for example "make images 2-25 16:9" or "set video 1 to 1:1". The cropAspect must be one of: "16:9", "4:3", "1:1", "3:4", "9:16", or "none" (to remove the crop). Note: If the user asks to set a crop that already seems to be set in the manifest, you should still call this to ensure the crop coordinates are correctly re-calculated.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        crops: {
          type: Type.ARRAY,
          description: 'List of items to update with a crop aspect ratio.',
          items: {
            type: Type.OBJECT,
            properties: {
              type: {
                type: Type.STRING,
                description: 'The type of item: "image" or "video".',
              },
              id: {
                type: Type.STRING,
                description: 'The id of the image or video to crop.',
              },
              cropAspect: {
                type: Type.STRING,
                description: 'The target aspect ratio: "16:9", "4:3", "1:1", "3:4", "9:16", or "none" to remove the crop.',
              },
            },
            required: ['type', 'id', 'cropAspect'],
          },
        },
        message: {
          type: Type.STRING,
          description: 'A short confirmation message, e.g. "Set 24 items to 16:9."',
        },
      },
      required: ['crops', 'message'],
    },
  },
  {
    name: 'replace_images',
    description: 'Replace existing timeline images or videos with uploaded files. Use this when the user attaches images and asks to replace, swap, or update existing images or videos on the timeline with them. Map each target id to the fileIndex of the uploaded file to use.',
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
                description: 'The id of the existing timeline image or video to replace.',
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
          description: 'A short confirmation message, e.g. "Replaced 24 items."',
        },
      },
      required: ['replacements', 'message'],
    },
  },
  {
    name: 'add_effect',
    description: 'Add one or more visual effects (e.g. "crt-dither", "flashing-black-vignette", or "black-and-white") to the timeline. Use this when the user asks to add, apply, or insert an effect over a specific time range — for example "add a crt dither from image 12 to 22" or "apply flashing vignette to the first 5 seconds". Compute startTime and endTime from the manifest data.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        effects: {
          type: Type.ARRAY,
          description: 'List of effect items to add.',
          items: {
            type: Type.OBJECT,
            properties: {
              type: {
                type: Type.STRING,
                description: 'The type of effect: "crt-dither", "flashing-black-vignette", or "black-and-white".',
              },
              startTime: {
                type: Type.NUMBER,
                description: 'Start time in seconds.',
              },
              endTime: {
                type: Type.NUMBER,
                description: 'End time in seconds.',
              },
              intensity: {
                type: Type.NUMBER,
                description: 'The intensity of the effect (0.0 to 1.0). For "flashing-black-vignette" and "black-and-white" (0 = none / full color, 1 = full effect). Default is 0.5.',
              },
            },
            required: ['type', 'startTime', 'endTime'],
          },
        },
        message: {
          type: Type.STRING,
          description: 'A short confirmation message, e.g. "CRT Dither added from 10s to 15s."',
        },
      },
      required: ['effects', 'message'],
    },
  },
]

export const tools: Tool[] = [{ functionDeclarations }]

export const systemInstruction =
  'You are a timeline editing assistant for a media studio. Your only job is to call the correct function:\n' +
    '- delete_timeline_items: when the user asks to delete, remove, or clear one or more timeline items. Map phrases like "images 19–31" to the manifest #N order (sorted by start time for images, by timestamp for videos) and include one { type, id } per item in the items array in a SINGLE call.\n' +
    '- duplicate_timeline_range: when the user asks to duplicate, repeat, or copy a range of images or videos so the copy plays immediately after the original block ends. Use kind "image" or "video" and firstNumber/lastNumber inclusive (same #N as the manifest).\n' +
    '- edit_manifest: when the user asks to change timing, duration, position, playback speed, or mute status of existing items. You MUST include all affected items as separate entries in the mutations array in a SINGLE call — never call edit_manifest multiple times. For audio mutations (type=updateAudio): ALWAYS use trimStart and trimEnd fields (not endTime). To restore an audio to its full original length set trimStart=0 and trimEnd=0. The active playing duration of an audio is: originalDuration - trimStart - trimEnd. Use playbackSpeed for constant video and audio playback speed changes (e.g. 0.5 for half speed). For speed ramps (e.g. "0.5x start to 0.1x end"), use both speedStart and speedEnd (and optionally speedEasing: "linear" or "ease"). If speedStart/speedEnd are used, they will override any constant playbackSpeed. Use muted for video mute status (true to mute, false to unmute). ALWAYS use the exact id strings from the manifest (e.g. "audio-1234-abc") — never make up or shorten ids.\n' +
  '- split_at_marks: when the user asks to split, cut, or divide images or videos at specific positions, or into equal parts (like halves or fourths). You must compute the absolute timeline split times yourself from the item\'s timing data (halves = 1 split at midpoint, fourths = 3 splits at 25%/50%/75%). Also use this for splitting at audio marks (use the marks listed in the audio data)\n' +
  '- add_text: when the user asks to add text overlays to the timeline at a computed time range\n' +
  '- add_effect: when the user asks to add visual effects (like "crt-dither", "flashing-black-vignette", or "black-and-white") over a specific time range; include intensity (0.0–1.0) if specified for flashing-black-vignette or black-and-white\n' +
    '- replace_images: when the user has attached files and asks to replace, swap, or update existing timeline images or videos with them\n' +
  '- set_transitions: when the user asks to set, apply, add, or remove animations (none, pulse, shake, or jitter) or transitions (none, split, fade, slide-in, circle, rotate, or flash) on images or videos; include zoomIntensity (0.05–1.0) if specified, transitionDuration if specified, transitionColor if specified (for flash), transitionDirection if specified (for slide-in), or transitionAxis if specified (for split)\n' +
  '- set_crop: when the user asks to set or change the aspect ratio of images or videos (e.g. "make images 2-25 16:9"); cropAspect must be one of "16:9", "4:3", "1:1", "3:4", "9:16", or "none"\n' +
  '- no_op: for anything else\n' +
  'Always call exactly one function. Compute exact numeric values from the timeline data provided.\n' +
  'When the user refers to "image 3", "video 2", etc., the number refers to the item\'s position when all items of that type are sorted by startTime — so "image 1" is the one with the earliest startTime, "image 2" is the next earliest, and so on. This ordering is reflected by the #N labels in the manifest context.'

export { FunctionCallingConfigMode }
