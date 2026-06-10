export interface GenerationReferenceImage {
  base64: string
  mimeType: string
}

type AttachedFileLike = {
  mediaType: string
  base64?: string
  blobUrl?: string
  mimeType: string
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1] ?? '')
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export async function resolveImageUrlReference(url: string): Promise<GenerationReferenceImage | null> {
  const response = await fetch(url)
  if (!response.ok) return null
  const blob = await response.blob()
  const base64 = await blobToBase64(blob)
  if (!base64) return null
  return { base64, mimeType: blob.type || 'image/png' }
}

export async function resolveAttachedImageReferences(
  files: AttachedFileLike[]
): Promise<GenerationReferenceImage[]> {
  const refs: GenerationReferenceImage[] = []
  for (const file of files) {
    if (file.mediaType !== 'image') continue
    let base64 = file.base64?.trim() ?? ''
    if (!base64 && file.blobUrl) {
      const response = await fetch(file.blobUrl)
      if (!response.ok) continue
      const blob = await response.blob()
      base64 = await blobToBase64(blob)
    }
    if (!base64) continue
    refs.push({ base64, mimeType: file.mimeType })
  }
  return refs
}

export function imageEditPrompt(
  prompt: string,
  hasSourceImage: boolean,
  extraReferenceCount: number
): string {
  let text = prompt.trim()
  if (hasSourceImage) {
    text +=
      '\n\nThe first attached image is the existing timeline image to edit. Apply the requested changes to it.'
  }
  if (extraReferenceCount > 0) {
    const noun = extraReferenceCount === 1 ? 'reference image' : 'reference images'
    text += `\n\nUse the additional attached ${noun} for style or content guidance.`
  }
  return text
}

export function imagePromptWithReferences(prompt: string, referenceCount: number): string {
  if (referenceCount <= 0) return prompt.trim()
  const noun = referenceCount === 1 ? 'reference image' : 'reference images'
  return `${prompt.trim()}\n\nUse the attached ${noun} for style, composition, and subject guidance.`
}

export function videoPromptWithReferences(prompt: string, referenceCount: number): string {
  if (referenceCount <= 0) return prompt.trim()
  const noun = referenceCount === 1 ? 'reference image' : 'reference images'
  return `${prompt.trim()}\n\nUse the attached ${noun} as style and content references for the video.`
}

export interface ResolvedAudioReference {
  base64: string
  mimeType: string
  blob: Blob
}

export function dataUrlToReferenceImage(dataUrl: string): GenerationReferenceImage | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  const mimeType = match[1]
  const base64 = match[2]
  if (!base64) return null
  return { base64, mimeType }
}

export async function resolveAttachedAudioReference(
  files: AttachedFileLike[]
): Promise<ResolvedAudioReference | null> {
  for (const file of files) {
    if (file.mediaType !== 'audio') continue
    let blob: Blob | null = null
    if (file.blobUrl) {
      const response = await fetch(file.blobUrl)
      if (!response.ok) continue
      blob = await response.blob()
    } else if (file.base64?.trim()) {
      const binary = atob(file.base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      blob = new Blob([bytes], { type: file.mimeType })
    }
    if (!blob) continue
    const base64 = await blobToBase64(blob)
    if (!base64) continue
    return { base64, mimeType: blob.type || file.mimeType, blob }
  }
  return null
}
