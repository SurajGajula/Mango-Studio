export async function isWebGpuAvailable(): Promise<boolean> {
  if (typeof navigator === 'undefined') {
    return false
  }

  const gpu = (navigator as Navigator & {
    gpu?: { requestAdapter: () => Promise<unknown | null> }
  }).gpu
  if (!gpu) {
    return false
  }

  try {
    const adapter = await gpu.requestAdapter()
    return adapter !== null
  } catch {
    return false
  }
}

export function isBrowserEnvironment(): boolean {
  return typeof window !== 'undefined'
}
