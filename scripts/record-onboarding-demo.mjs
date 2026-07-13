#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { mkdir, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ONBOARDING_STEP_IDS = ['welcome', 'upload', 'timeline', 'export', 'complete']

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const artifactsDir = path.resolve(rootDir, 'artifacts', 'onboarding-demo')
const videoDir = path.join(artifactsDir, 'raw')
const outputPath = path.join(artifactsDir, 'onboarding-tour-demo.mp4')
const previewUrl = process.env.ONBOARDING_PREVIEW_URL ?? 'http://127.0.0.1:3000/dev/onboarding-preview'
const port = Number(process.env.PORT ?? 3000)

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForServer(url, timeoutMs = 120_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Server still booting.
    }
    await sleep(1000)
  }
  throw new Error(`Timed out waiting for ${url}`)
}

function startDevServer() {
  return spawn('npm', ['run', 'dev', '--', '--port', String(port), '--hostname', '127.0.0.1'], {
    cwd: rootDir,
    stdio: 'ignore',
    env: { ...process.env, PORT: String(port) },
  })
}

async function convertToMp4(sourcePath, destinationPath) {
  await new Promise((resolve, reject) => {
    const ffmpeg = spawn(
      'ffmpeg',
      ['-y', '-i', sourcePath, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'fast', destinationPath],
      { stdio: 'inherit' }
    )
    ffmpeg.on('exit', (code) => {
      if (code === 0) resolve(undefined)
      else reject(new Error(`ffmpeg exited with code ${code}`))
    })
  })
}

async function waitForStep(page, stepId, holdMs) {
  await page.locator(`[data-onboarding-step="${stepId}"]`).waitFor({ state: 'visible' })
  await sleep(holdMs)
}

async function clickNext(page) {
  await page.locator('[data-onboarding-step] button').filter({ hasText: 'Next' }).click()
}

async function main() {
  await mkdir(videoDir, { recursive: true })

  const devServer = startDevServer()
  let browser

  try {
    await waitForServer(previewUrl)

    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      recordVideo: {
        dir: videoDir,
        size: { width: 1440, height: 900 },
      },
    })
    const page = await context.newPage()
    await page.goto(previewUrl, { waitUntil: 'networkidle' })

    for (const stepId of ONBOARDING_STEP_IDS) {
      const holdMs = stepId === 'complete' ? 4000 : 2500
      await waitForStep(page, stepId, holdMs)
      if (stepId !== 'complete') {
        await clickNext(page)
      }
    }

    await page.locator('[data-onboarding-step="complete"] button').filter({ hasText: 'Start editing' }).click()
    await sleep(2000)

    await page.close()
    await sleep(500)
    await context.close()
    await sleep(500)

    const files = await readdir(videoDir)
    const webmFile = files.find((file) => file.endsWith('.webm'))
    if (!webmFile) {
      throw new Error('Playwright did not produce a video file')
    }

    const webmPath = path.join(videoDir, webmFile)
    await convertToMp4(webmPath, outputPath)
    console.log(`Recorded onboarding demo: ${outputPath}`)
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined)
    }
    devServer.kill('SIGTERM')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
