let previewVideoElements: Map<string, HTMLVideoElement> = new Map()

export function setPreviewVideoPool(map: Map<string, HTMLVideoElement>) {
  previewVideoElements = map
}

export function getPreviewVideoElement(id: string): HTMLVideoElement | undefined {
  return previewVideoElements.get(id)
}
