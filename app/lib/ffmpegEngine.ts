import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

let ffmpegInstance: FFmpeg | null = null
let ffmpegLoading: Promise<FFmpeg> | null = null
let ffmpegLock = false

export async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance
  if (ffmpegLoading) return ffmpegLoading
  ffmpegLoading = (async () => {
    try {
      const ff = new FFmpeg()
      const BASE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd'
      const [coreURL, wasmURL] = await Promise.all([
        toBlobURL(`${BASE}/ffmpeg-core.js`, 'text/javascript'),
        toBlobURL(`${BASE}/ffmpeg-core.wasm`, 'application/wasm'),
      ])
      const loadPromise = ff.load({ coreURL, wasmURL })
      const timeoutPromise = new Promise((_, rej) =>
        setTimeout(() => rej(new Error('FFmpeg load timeout')), 15000)
      )
      await Promise.race([loadPromise, timeoutPromise])
      ffmpegInstance = ff
      return ff
    } catch (err) {
      ffmpegLoading = null
      ffmpegInstance = null
      throw err
    }
  })()
  return ffmpegLoading
}

export async function withFfmpegLock<T>(
  run: () => Promise<T>,
  onWaiting?: () => void
): Promise<T> {
  await acquireFfmpegLock(onWaiting)
  try {
    return await run()
  } finally {
    releaseFfmpegLock()
  }
}

export async function acquireFfmpegLock(onWaiting?: () => void): Promise<void> {
  while (ffmpegLock) {
    onWaiting?.()
    await new Promise((r) => setTimeout(r, 500))
  }
  ffmpegLock = true
}

export function releaseFfmpegLock() {
  ffmpegLock = false
}

export function isFfmpegBusy() {
  return ffmpegLock
}

export async function createScaledVideoProxy(
  url: string,
  maxEdge = 720,
  onProgress?: (msg: string) => void
): Promise<Blob> {
  return withFfmpegLock(async () => {
    onProgress?.('Loading FFmpeg...')
    const ff = await getFFmpeg()
    for (const f of ['input.mp4', 'proxy.mp4']) {
      try {
        await ff.deleteFile(f)
      } catch {}
    }
    onProgress?.('Reading source...')
    const inputData = await fetchFile(url)
    await ff.writeFile('input.mp4', inputData)
    onProgress?.('Encoding preview proxy...')
    const vf = `scale='min(${maxEdge},iw)':-2`
    await ff.exec([
      '-i',
      'input.mp4',
      '-vf',
      vf,
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '32',
      '-c:a',
      'aac',
      '-b:a',
      '64k',
      '-movflags',
      '+faststart',
      'proxy.mp4',
    ])
    const data = await ff.readFile('proxy.mp4')
    for (const f of ['input.mp4', 'proxy.mp4']) {
      try {
        await ff.deleteFile(f)
      } catch {}
    }
    return new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' })
  }, () => onProgress?.('Waiting for engine...'))
}

export function terminateFFmpeg() {
  if (ffmpegInstance) {
    try {
      ffmpegInstance.terminate()
    } catch {}
    ffmpegInstance = null
    ffmpegLoading = null
  }
}
