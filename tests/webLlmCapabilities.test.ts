import { afterEach, describe, expect, it, vi } from 'vitest'

describe('webLlmCapabilities', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('reports false outside the browser', async () => {
    const { isBrowserEnvironment, isWebGpuAvailable } = await import(
      '@/app/lib/webLlm/webLlmCapabilities'
    )
    expect(isBrowserEnvironment()).toBe(false)
    await expect(isWebGpuAvailable()).resolves.toBe(false)
  })

  it('reports true when WebGPU adapter is available', async () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('navigator', {
      gpu: {
        requestAdapter: vi.fn().mockResolvedValue({}),
      },
    })

    const { isWebGpuAvailable, isBrowserEnvironment } = await import(
      '@/app/lib/webLlm/webLlmCapabilities'
    )

    expect(isBrowserEnvironment()).toBe(true)
    await expect(isWebGpuAvailable()).resolves.toBe(true)
  })
})
