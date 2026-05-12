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
    description: 'Edit, rearrange, resize, or synchronise existing items on the timeline. Use this when the user asks to change timing, duration, position, row/layer, playback speed, mute status, or text typography/style of existing images, videos, texts, or audio tracks — for example "make the image the same length as the audio", "move the video to start at 5 seconds", "move images 11-29 to row 0", "slow down the video to 0.5x speed", "mute all videos", "make all text negative style", or "change text font to Playfair". For audio, you can also set trimStart and trimEnd to trim the audio file, or set both to 0 to restore the full original length.',
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
              row: {
                type: Type.NUMBER,
                description: 'Target row/layer index on the timeline. Use 0 for the main visual row. Audio rows are typically 1+.',
              },
              fontFamily: {
                type: Type.STRING,
                description: 'Text font family to use on text overlays, e.g. "Inter, sans-serif" or "\\\"Playfair Display\\\", Georgia, serif". Only for updateText.',
              },
              fontWeight: {
                type: Type.STRING,
                description: 'Text font weight value for text overlays, e.g. "300" or "600". Only for updateText.',
              },
              animation: {
                type: Type.STRING,
                description: 'Text animation mode for text overlays: "none", "keyboard", or "shake". Only for updateText.',
              },
              style: {
                type: Type.STRING,
                description: 'Text style mode for text overlays: "normal", "negative", or "highlight". Only for updateText.',
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
      'Remove one or more items from the timeline by id. Use when the user asks to delete, remove, or clear specific images, videos, text overlays, audio clips, or effects — for example "delete images 19 through 31" (resolve to ids from the manifest #N order). Include every item to remove in one call.',
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
                description: 'One of: image, video, text, audio, effect.',
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
    description: "Split images or videos into multiple segments. Use this when the user asks to split, cut, or divide items at specific positions, or into equal parts like halves or fourths. For equal parts, compute the split times yourself based on the item's startTime and endTime. For splitting at audio marks, use splitAtMarksTimelineSeconds from the manifest (not marksSourceFileSeconds). Include only split times that fall strictly between the target item's startTime and endTime.",
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
                description:
                  "Absolute timeline times in seconds (same coordinate system as image startTime/endTime and video timestamp). For halves, this is the midpoint. For fourths, these are the 25%, 50%, and 75% points. For audio marks, use splitAtMarksTimelineSeconds from the manifest.",
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
    name: 'set_step_growth',
    description:
      'Create stepped size growth for an image clip by splitting it into equal parts and making each part progressively larger, ending at the maximum centered size that fits the canvas. Use this when the user asks for commands like "make image #3 grow in 4 steps", "grow selected image to full frame in 4 steps", or "make this image grow in 4 steps".',
    parameters: {
      type: Type.OBJECT,
      properties: {
        grows: {
          type: Type.ARRAY,
          description: 'List of image growth instructions.',
          items: {
            type: Type.OBJECT,
            properties: {
              id: {
                type: Type.STRING,
                description: 'The image id to apply stepped growth to.',
              },
              imageNumber: {
                type: Type.NUMBER,
                description: 'Optional global 1-based image number (#N in manifest order, across all rows).',
              },
              target: {
                type: Type.STRING,
                description: 'Target selector: "image_id", "image_number", or "selected".',
              },
              steps: {
                type: Type.NUMBER,
                description: 'Number of equal growth steps. Use 4 unless user explicitly asks for another value.',
              },
            },
          },
        },
        message: {
          type: Type.STRING,
          description: 'A short confirmation message describing the applied step growth.',
        },
      },
      required: ['grows', 'message'],
    },
  },
  {
    name: 'set_transitions',
    description: 'Set the animation (none, zoom-in, zoom-out, shake, jitter, slide-shake-left, or slide-shake-right) or transition (none, split, fade, morph, slide-in, wipe, circle, rotate, or flash) on one or more images or videos. For zoom-in and zoom-out, use animationDuration for how long the zoom runs and animationZoomEasing "constant" (linear), "fast-slow" (ease-out), or "slow-fast" (ease-in). For slide-shake-left and slide-shake-right, use animationDuration for the slide-in portion; the item then shakes at fixed 10% intensity for the rest of its duration. Use this when the user asks to set, apply, add, or remove animations or transitions on timeline images or videos — for example "zoom in images 2 to 25", "zoom out with slow then fast easing", "add shake to image 1", "add slide shake from left", "add slide shake from right", "add split transition", "add fade transition", "add morph or motion blur transition", "add slide in from left", "add wipe transition from right", "add circle transition", "add rotate transition", "add white flash transition", "add black flash transition", "add negative flash transition", or "remove animations from all images". Image numbers/ranges use global image numbering from the manifest (#N across all rows). For consolidated transitions like flash, slide-in, wipe, circle, and split, you should also set the corresponding parameters (transitionColor, transitionFlashMode, transitionDirection, transitionAxis, transitionSlideEasing for slide-in speed curve, transitionWipeEasing for wipe speed curve, transitionCircleEasing for circle expand speed) if specified. Use the image/video ids from the manifest.',
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
                description: 'The animation mode: "none", "zoom-in", "zoom-out", "shake", "jitter", "slide-shake-left", or "slide-shake-right". Legacy combined names like "zoom-in-fast-slow" or "pulse" are accepted and normalized.',
              },
              transition: {
                type: Type.STRING,
                description: 'The transition mode to apply: "none", "split", "fade", "morph" (WebGL: two textures, per-pixel mix, noise + luma-flow distortion; animation none only, otherwise crossfade), "slide-in", "wipe", "circle", "rotate", or "flash".',
              },
              zoomIntensity: {
                type: Type.NUMBER,
                description: 'Effect intensity as a fraction from 0.05 to 1.0 for shake/jitter animations. Only include if the user specifies an intensity or percentage, e.g. "50% intensity" → 0.5.',
              },
              zoomDistanceIntensity: {
                type: Type.NUMBER,
                description: 'Zoom distance multiplier for zoom-in/zoom-out from 0.25 to 2.5. 1.0 is the default distance, values below 1.0 soften zoom travel and values above 1.0 increase zoom travel.',
              },
              transitionDuration: {
                type: Type.NUMBER,
                description: 'Duration of the transition in seconds (min 0.1s). Defaults to 1.0s.',
              },
              animationDuration: {
                type: Type.NUMBER,
                description: 'Duration in seconds for one zoom-in or zoom-out animation, or for the slide-in portion of slide-shake-left/slide-shake-right (min 0.1s). Defaults to 1.0s.',
              },
              animationZoomEasing: {
                type: Type.STRING,
                description: 'For zoom-in and zoom-out only: "constant" (linear), "fast-slow" (ease-out, default), or "slow-fast" (ease-in).',
              },
              transitionColor: {
                type: Type.STRING,
                description: 'The color for flash transitions, e.g. "#FFFFFF" or "white".',
              },
              transitionFlashMode: {
                type: Type.STRING,
                description: 'The flash behavior for flash transitions: "solid" for a color flash, or "negative" to flash inverted colors from the preceding item.',
              },
              transitionDirection: {
                type: Type.STRING,
                description: 'The direction for slide-in transitions: "left", "right", "top", or "bottom".',
              },
              transitionAxis: {
                type: Type.STRING,
                description: 'The axis for split transitions: "horizontal" or "vertical".',
              },
              transitionSlideEasing: {
                type: Type.STRING,
                description: 'Slide-in speed curve: "smooth" (default), "ease-in" (slow then fast), "ease-out" (fast then slow), or "linear" (constant speed).',
              },
              transitionCircleEasing: {
                type: Type.STRING,
                description: 'Circle transition expand speed: "smooth" (default), "ease-in" (slow then fast), "ease-out" (fast then slow), or "linear".',
              },
              transitionWipeEasing: {
                type: Type.STRING,
                description: 'Wipe transition speed: "linear", "ease-in" (slow then fast), or "ease-out" (fast then slow).',
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
    description: 'Replace existing timeline items (images, videos, or audios) with uploaded files ONLY when the user has attached one or more files. Match the uploaded file type to the target item type: use uploaded images to replace images/videos, uploaded videos to replace videos/images, and uploaded audios to replace audios. Map each target id to the fileIndex of the uploaded file. When a single file is uploaded and the user says "replace audios 2-5" or "replace images 3-10", map ALL target items to that same fileIndex (0). Do NOT use this for solid/flat colors — use replace_with_solid instead.',
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
                description: 'The id of the existing timeline image, video, or audio to replace.',
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
    name: 'replace_with_solid',
    description:
      'Replace existing timeline images or videos with a flat solid color (no file upload). Use when the user asks for white/black/colored frames, blank screens, solid backgrounds, or "replace video N with white" / "make clips X–Y a white image". Include one entry per target clip with the same targetId from the manifest. Color must be a CSS color the browser understands: named colors (white, black, red, …) or hex (#ffffff, #000000).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        replacements: {
          type: Type.ARRAY,
          description: 'One object per image or video to replace.',
          items: {
            type: Type.OBJECT,
            properties: {
              targetId: {
                type: Type.STRING,
                description: 'Exact id of the timeline image or video to replace.',
              },
              color: {
                type: Type.STRING,
                description: 'CSS color, e.g. white, #ffffff, black, #000000.',
              },
            },
            required: ['targetId', 'color'],
          },
        },
        message: {
          type: Type.STRING,
          description: 'Short confirmation, e.g. "Replaced videos 3–16 with white."',
        },
      },
      required: ['replacements', 'message'],
    },
  },
  {
    name: 'add_effect',
    description: 'Add one or more visual effects (e.g. "crt-dither", "flashing-black-vignette" / vignette, "black-and-white", "vivid-sharp", or "pixel-glitch-scan") to the timeline. Use this when the user asks to add, apply, or insert an effect over a specific time range — for example "add a crt dither from image 12 to 22" or "apply vignette to the first 5 seconds". Compute startTime and endTime from the manifest data.',
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
                description: 'The type of effect: "crt-dither", "flashing-black-vignette" (vignette), "black-and-white", "vivid-sharp", or "pixel-glitch-scan".',
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
                description:
                  'The intensity of the effect (0.0 to 1.0). For "flashing-black-vignette" (vignette): vignette edge strength. For "black-and-white": Rec.709 grayscale then extra darkening only for luma below mid-gray (L < 0.5); light areas unchanged; 0 = off, 1 = strongest). For "vivid-sharp", intensity controls sharpening only (0 = vivid color only, 1 = maximum sharpness). For "pixel-glitch-scan", intensity controls macro block size (0 = finer blocks, 1 = larger blocks). Default is 0.5.',
              },
              contrast: {
                type: Type.NUMBER,
                description: 'Optional; reserved for future use. Prefer intensity for all effect types.',
              },
              flashSpeed: {
                type: Type.NUMBER,
                description:
                  'For "flashing-black-vignette" (vignette) only: pulsing flash amount 0.0–1.0. 0 = solid vignette (no pulse, full edge strength); 1 = strongest pulse. Omit for default 1.',
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
    '- delete_timeline_items: when the user asks to delete, remove, or clear one or more timeline items (images, videos, texts, audios, or effects). Map phrases like "images 19–31" to the manifest #N order (sorted by start time for images, by timestamp for videos) and include one { type, id } per item in the items array in a SINGLE call.\n' +
    '- duplicate_timeline_range: when the user asks to duplicate, repeat, or copy a range of images or videos so the copy plays immediately after the original block ends. Use kind "image" or "video" and firstNumber/lastNumber inclusive (same #N as the manifest).\n' +
    '- edit_manifest: when the user asks to change timing, duration, position, row/layer, playback speed, mute status, or text typography/style of existing items. You MUST include all affected items as separate entries in the mutations array in a SINGLE call — never call edit_manifest multiple times. For audio mutations (type=updateAudio): ALWAYS use trimStart and trimEnd fields (not endTime). To restore an audio to its full original length set trimStart=0 and trimEnd=0. The active playing duration of an audio is: originalDuration - trimStart - trimEnd. Use playbackSpeed for constant video and audio playback speed changes (e.g. 0.5 for half speed). For speed ramps (e.g. "0.5x start to 0.1x end"), use both speedStart and speedEnd (and optionally speedEasing: "linear" or "ease"). If speedStart/speedEnd are used, they will override any constant playbackSpeed. Use muted for video mute status (true to mute, false to unmute). Use row to move items between timeline rows (e.g. row 0 main visual row). For text mutations (type=updateText), use fontFamily, fontWeight, animation ("none" or "keyboard"), and style ("normal", "negative", or "highlight") as needed. ALWAYS use the exact id strings from the manifest (e.g. "audio-1234-abc") — never make up or shorten ids.\n' +
  '- split_at_marks: when the user asks to split, cut, or divide images or videos at specific positions, or into equal parts (like halves or fourths). You must compute the absolute timeline split times yourself from the item\'s timing data (halves = 1 split at midpoint, fourths = 3 splits at 25%/50%/75%). For splitting at audio marks, use splitAtMarksTimelineSeconds from each audio line — do not use marksSourceFileSeconds (those are source-file seconds, not timeline positions).\n' +
  '- add_text: when the user asks to add text overlays to the timeline at a computed time range\n' +
  '- add_effect: when the user asks to add visual effects (like "crt-dither", "flashing-black-vignette" / vignette, "black-and-white", "vivid-sharp", or "pixel-glitch-scan") over a specific time range; include intensity (0.0–1.0) if specified; for vignette optionally flashSpeed (0.0 = solid edge, 1.0 = full pulse)\n' +
    '- set_step_growth: when the user asks to make an image grow in equal steps (e.g. "make image #3 grow in 4 steps", "grow selected image to full frame in 4 steps", or "make this image grow in 4 steps"). If the user says "this image", "selected image", or "current image", use target="selected". Use id when available; otherwise use global imageNumber (#N from manifest across all rows). Set steps to the requested count (default 4).\n' +
    '- replace_with_solid: when the user asks to replace timeline images or videos with a solid/flat color (white, black, hex, named CSS colors) without uploading a file — e.g. "replace videos 3–16 with white", "blank frames", "solid red background clip"\n' +
    '- replace_images: ONLY when the user has attached files (images, videos, or audios) AND asks to replace timeline items with those uploads. Match the file type from the attached files list to the target item type. When one file is uploaded and the user says "replace audios 2-5", map all target audio ids to fileIndex 0. Audio numbering uses global #N by startTime, same as images/videos.\n' +
  '- set_transitions: when the user asks to set, apply, add, or remove animations (none, zoom-in, zoom-out, shake, jitter, slide-shake-left, or slide-shake-right) or transitions (none, split, fade, morph, slide-in, wipe, circle, rotate, or flash) on images or videos; include zoomIntensity (0.05–1.0) only for shake/jitter when specified, include zoomDistanceIntensity (0.25–2.5) when the user specifies lowering/raising zoom distance for zoom-in or zoom-out, include animationDuration for zoom animations or the slide-in portion of slide-shake-left/slide-shake-right, include animationZoomEasing ("constant", "fast-slow", or "slow-fast") for zoom animations, transitionDuration if specified, transitionColor if specified (for solid flash), transitionFlashMode if specified (solid or negative for flash), transitionDirection if specified (for slide-in or wipe), transitionAxis if specified (for split), transitionSlideEasing if specified (for slide-in), transitionWipeEasing if specified (for wipe), or transitionCircleEasing if specified (for circle). For image numbers/ranges, use global image numbering from the manifest (#N across all rows).\n' +
  '- set_crop: when the user asks to set or change the aspect ratio of images or videos (e.g. "make images 2-25 16:9"); cropAspect must be one of "16:9", "4:3", "1:1", "3:4", "9:16", or "none"\n' +
  '- no_op: for anything else\n' +
  'Always call exactly one function. Compute exact numeric values from the timeline data provided.\n' +
  'For images, numbering is global: "image 1", "image 2", etc. always refer to the global manifest #N order by startTime across all rows. The same global numbering applies to videos (by timestamp), texts (by startTime), and audios (by startTime). If the user says "this image", "selected image", or "current image", target the selected item instead of requiring a number.'

export { FunctionCallingConfigMode }
