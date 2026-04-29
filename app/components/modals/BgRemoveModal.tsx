'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { removeBackground } from '@imgly/background-removal'
import styles from './BgRemoveModal.module.css'

type BrushMode = 'erase' | 'restore'

type Props = {
  open: boolean
  imageUrl: string
  imageName: string
  onClose: () => void
  onApply: (blob: Blob) => Promise<void> | void
}

async function imageDataFromBlob(blob: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas context unavailable')
  ctx.drawImage(bitmap, 0, 0)
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
  bitmap.close()
  return data
}

export default function BgRemoveModal({ open, imageUrl, imageName, onClose, onApply }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [mode, setMode] = useState<BrushMode>('erase')
  const [brushSize, setBrushSize] = useState(28)
  const [softness, setSoftness] = useState(0.65)
  const [strength, setStrength] = useState(0.55)
  const [dropShadowEnabled, setDropShadowEnabled] = useState(false)
  const [shadowBlur, setShadowBlur] = useState(18)
  const [shadowOffsetX, setShadowOffsetX] = useState(0)
  const [shadowOffsetY, setShadowOffsetY] = useState(8)
  const [shadowOpacity, setShadowOpacity] = useState(0.5)
  const [loading, setLoading] = useState(false)
  const [autoRemoving, setAutoRemoving] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [undoCount, setUndoCount] = useState(0)
  const [redoCount, setRedoCount] = useState(0)
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null)
  const originalImageDataRef = useRef<ImageData | null>(null)
  const maskRef = useRef<Uint8ClampedArray | null>(null)
  const outputBufferRef = useRef<Uint8ClampedArray | null>(null)
  const compositedCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const undoStackRef = useRef<Uint8ClampedArray[]>([])
  const redoStackRef = useRef<Uint8ClampedArray[]>([])
  const drawingRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const sourceBlobRef = useRef<Blob | null>(null)
  const [cursorPreview, setCursorPreview] = useState<{ x: number; y: number; radius: number } | null>(null)

  const renderComposite = useCallback(() => {
    const canvas = canvasRef.current
    const original = originalImageDataRef.current
    const mask = maskRef.current
    if (!canvas || !original || !mask) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    if (canvas.width !== original.width || canvas.height !== original.height) {
      canvas.width = original.width
      canvas.height = original.height
    }
    if (!outputBufferRef.current || outputBufferRef.current.length !== original.data.length) {
      outputBufferRef.current = new Uint8ClampedArray(original.data.length)
    }
    if (!compositedCanvasRef.current) {
      compositedCanvasRef.current = document.createElement('canvas')
    }
    const compositedCanvas = compositedCanvasRef.current
    compositedCanvas.width = original.width
    compositedCanvas.height = original.height
    const compositedCtx = compositedCanvas.getContext('2d')
    if (!compositedCtx) return
    const out = outputBufferRef.current
    const src = original.data
    for (let i = 0, p = 0; i < src.length; i += 4, p += 1) {
      out[i] = src[i]
      out[i + 1] = src[i + 1]
      out[i + 2] = src[i + 2]
      out[i + 3] = mask[p]
    }
    compositedCtx.putImageData(new ImageData(new Uint8ClampedArray(out), original.width, original.height), 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (dropShadowEnabled) {
      ctx.shadowColor = `rgba(0, 0, 0, ${shadowOpacity})`
      ctx.shadowBlur = shadowBlur
      ctx.shadowOffsetX = shadowOffsetX
      ctx.shadowOffsetY = shadowOffsetY
      ctx.drawImage(compositedCanvas, 0, 0)
      ctx.shadowColor = 'rgba(0, 0, 0, 0)'
      ctx.shadowBlur = 0
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 0
    }
    ctx.drawImage(compositedCanvas, 0, 0)
  }, [dropShadowEnabled, shadowBlur, shadowOffsetX, shadowOffsetY, shadowOpacity])

  const scheduleRender = useCallback(() => {
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      renderComposite()
    })
  }, [renderComposite])

  const resetHistory = useCallback(() => {
    undoStackRef.current = []
    redoStackRef.current = []
    setUndoCount(0)
    setRedoCount(0)
  }, [])

  const pushUndoSnapshot = useCallback(() => {
    const mask = maskRef.current
    if (!mask) return
    undoStackRef.current.push(mask.slice())
    if (undoStackRef.current.length > 15) undoStackRef.current.shift()
    redoStackRef.current = []
    setUndoCount(undoStackRef.current.length)
    setRedoCount(0)
  }, [])

  const applyBrushAt = useCallback(
    (canvasX: number, canvasY: number) => {
      const original = originalImageDataRef.current
      const mask = maskRef.current
      if (!original || !mask) return
      const width = original.width
      const height = original.height
      const radius = Math.max(1, brushSize / 2)
      const hardRadius = radius * Math.max(0, 1 - softness)
      const minX = Math.max(0, Math.floor(canvasX - radius))
      const maxX = Math.min(width - 1, Math.ceil(canvasX + radius))
      const minY = Math.max(0, Math.floor(canvasY - radius))
      const maxY = Math.min(height - 1, Math.ceil(canvasY + radius))
      const maxDelta = strength * 255
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const dx = x - canvasX
          const dy = y - canvasY
          const distance = Math.sqrt(dx * dx + dy * dy)
          if (distance > radius) continue
          const falloff =
            distance <= hardRadius || radius <= hardRadius
              ? 1
              : 1 - (distance - hardRadius) / Math.max(1e-6, radius - hardRadius)
          const delta = maxDelta * falloff
          const index = y * width + x
          if (mode === 'restore') mask[index] = Math.min(255, mask[index] + delta)
          else mask[index] = Math.max(0, mask[index] - delta)
        }
      }
      scheduleRender()
    },
    [brushSize, mode, scheduleRender, softness, strength]
  )

  const canvasPointFromEvent = useCallback((event: PointerEvent | ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    const displayScale = Math.min(rect.width / canvas.width, rect.height / canvas.height)
    const drawnWidth = canvas.width * displayScale
    const drawnHeight = canvas.height * displayScale
    const offsetX = rect.left + (rect.width - drawnWidth) / 2
    const offsetY = rect.top + (rect.height - drawnHeight) / 2
    const localX = event.clientX - offsetX
    const localY = event.clientY - offsetY
    if (localX < 0 || localY < 0 || localX > drawnWidth || localY > drawnHeight) return null
    const x = (localX / drawnWidth) * canvas.width
    const y = (localY / drawnHeight) * canvas.height
    const radius = (brushSize / 2 / canvas.width) * drawnWidth
    return { x, y, uiX: event.clientX - rect.left, uiY: event.clientY - rect.top, uiRadius: radius }
  }, [brushSize])

  const canvasImagePointFromEvent = useCallback((event: PointerEvent | ReactPointerEvent<HTMLCanvasElement>) => {
    const point = canvasPointFromEvent(event)
    if (!point) return null
    return { x: point.x, y: point.y }
  }, [canvasPointFromEvent])

  const undo = useCallback(() => {
    const mask = maskRef.current
    const prev = undoStackRef.current.pop()
    if (!mask || !prev) return
    redoStackRef.current.push(mask.slice())
    maskRef.current = prev
    setUndoCount(undoStackRef.current.length)
    setRedoCount(redoStackRef.current.length)
    scheduleRender()
  }, [scheduleRender])

  const redo = useCallback(() => {
    const mask = maskRef.current
    const next = redoStackRef.current.pop()
    if (!mask || !next) return
    undoStackRef.current.push(mask.slice())
    maskRef.current = next
    setUndoCount(undoStackRef.current.length)
    setRedoCount(redoStackRef.current.length)
    scheduleRender()
  }, [scheduleRender])

  const loadFromImageAlpha = useCallback(async () => {
    setLoading(true)
    setError(null)
    resetHistory()
    try {
      const sourceResponse = await fetch(imageUrl)
      if (!sourceResponse.ok) throw new Error('Failed to fetch image')
      const sourceBlob = await sourceResponse.blob()
      sourceBlobRef.current = sourceBlob
      const originalData = await imageDataFromBlob(sourceBlob)
      const nextMask = new Uint8ClampedArray(originalData.width * originalData.height)
      for (let i = 0, p = 0; i < originalData.data.length; i += 4, p += 1) {
        nextMask[p] = originalData.data[i + 3]
      }
      originalImageDataRef.current = originalData
      maskRef.current = nextMask
      setImageSize({ width: originalData.width, height: originalData.height })
      scheduleRender()
    } catch (err: any) {
      setError(err?.message ?? 'Failed to remove background')
    } finally {
      setLoading(false)
    }
  }, [imageUrl, resetHistory, scheduleRender])

  const runAutoRemove = useCallback(async () => {
    const sourceBlob = sourceBlobRef.current
    if (!sourceBlob) return
    setAutoRemoving(true)
    setError(null)
    pushUndoSnapshot()
    try {
      const sourceType = sourceBlob.type || 'image/png'
      const sourceFile = new File([sourceBlob], imageName || 'image.png', { type: sourceType })
      const removedBlob = await removeBackground(sourceFile)
      const removedData = await imageDataFromBlob(removedBlob)
      const original = originalImageDataRef.current
      if (!original) throw new Error('Image not loaded')
      if (removedData.width !== original.width || removedData.height !== original.height) {
        throw new Error('Background model output size mismatch')
      }
      const nextMask = new Uint8ClampedArray(original.width * original.height)
      for (let i = 0, p = 0; i < removedData.data.length; i += 4, p += 1) {
        nextMask[p] = removedData.data[i + 3]
      }
      maskRef.current = nextMask
      redoStackRef.current = []
      setRedoCount(0)
      setUndoCount(undoStackRef.current.length)
      scheduleRender()
    } catch (err: any) {
      setError(err?.message ?? 'Auto background removal failed')
    } finally {
      setAutoRemoving(false)
    }
  }, [imageName, pushUndoSnapshot, scheduleRender])

  useEffect(() => {
    if (!open) return
    void loadFromImageAlpha()
  }, [loadFromImageAlpha, open])

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [])

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (loading || applying) return
      event.preventDefault()
      pushUndoSnapshot()
      drawingRef.current = true
      const point = canvasImagePointFromEvent(event)
      if (!point) return
      applyBrushAt(point.x, point.y)
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [applyBrushAt, applying, canvasImagePointFromEvent, loading, pushUndoSnapshot]
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const point = canvasPointFromEvent(event)
      if (!point) {
        setCursorPreview(null)
        return
      }
      setCursorPreview({ x: point.uiX, y: point.uiY, radius: point.uiRadius })
      if (!drawingRef.current) return
      event.preventDefault()
      applyBrushAt(point.x, point.y)
    },
    [applyBrushAt, canvasPointFromEvent]
  )

  const handlePointerUp = useCallback(() => {
    drawingRef.current = false
    setUndoCount(undoStackRef.current.length)
    setRedoCount(redoStackRef.current.length)
  }, [])

  const handlePointerEnter = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const point = canvasPointFromEvent(event)
      if (!point) return
      setCursorPreview({ x: point.uiX, y: point.uiY, radius: point.uiRadius })
    },
    [canvasPointFromEvent]
  )

  const handlePointerLeave = useCallback(() => {
    drawingRef.current = false
    setCursorPreview(null)
  }, [])

  const canApply = useMemo(
    () => Boolean(maskRef.current && originalImageDataRef.current && !loading && !autoRemoving && !applying && !error),
    [applying, autoRemoving, error, loading]
  )

  const handleApply = useCallback(async () => {
    if (!canApply) return
    const original = originalImageDataRef.current
    const mask = maskRef.current
    if (!original || !mask) return
    setApplying(true)
    setError(null)
    try {
      const outCanvas = document.createElement('canvas')
      outCanvas.width = original.width
      outCanvas.height = original.height
      const outCtx = outCanvas.getContext('2d')
      if (!outCtx) throw new Error('Canvas context unavailable')
      const pixels = new Uint8ClampedArray(original.data.length)
      for (let i = 0, p = 0; i < original.data.length; i += 4, p += 1) {
        pixels[i] = original.data[i]
        pixels[i + 1] = original.data[i + 1]
        pixels[i + 2] = original.data[i + 2]
        pixels[i + 3] = mask[p]
      }
      const maskedCanvas = document.createElement('canvas')
      maskedCanvas.width = original.width
      maskedCanvas.height = original.height
      const maskedCtx = maskedCanvas.getContext('2d')
      if (!maskedCtx) throw new Error('Canvas context unavailable')
      maskedCtx.putImageData(new ImageData(new Uint8ClampedArray(pixels), original.width, original.height), 0, 0)
      if (dropShadowEnabled) {
        outCtx.shadowColor = `rgba(0, 0, 0, ${shadowOpacity})`
        outCtx.shadowBlur = shadowBlur
        outCtx.shadowOffsetX = shadowOffsetX
        outCtx.shadowOffsetY = shadowOffsetY
        outCtx.drawImage(maskedCanvas, 0, 0)
        outCtx.shadowColor = 'rgba(0, 0, 0, 0)'
        outCtx.shadowBlur = 0
        outCtx.shadowOffsetX = 0
        outCtx.shadowOffsetY = 0
      }
      outCtx.drawImage(maskedCanvas, 0, 0)
      const blob = await new Promise<Blob>((resolve, reject) => {
        outCanvas.toBlob((result) => {
          if (!result) reject(new Error('Failed to encode PNG'))
          else resolve(result)
        }, 'image/png')
      })
      await onApply(blob)
      onClose()
    } catch (err: any) {
      setError(err?.message ?? 'Failed to apply background removal')
    } finally {
      setApplying(false)
    }
  }, [canApply, dropShadowEnabled, onApply, onClose, shadowBlur, shadowOffsetX, shadowOffsetY, shadowOpacity])

  if (!open) return null

  return (
    <div className={styles.overlay} onClick={(event) => event.target === event.currentTarget && onClose()} role="presentation">
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="bg-remove-title">
        <div className={styles.header}>
          <div>
            <h2 id="bg-remove-title">Remove background</h2>
            <p>Brush to restore or erase areas, then apply to replace the selected image.</p>
          </div>
        </div>
        <div className={styles.body}>
          <div className={styles.canvasWrap}>
            <canvas
              ref={canvasRef}
              className={styles.canvas}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onPointerEnter={handlePointerEnter}
              onPointerLeave={handlePointerLeave}
            />
            {cursorPreview ? (
              <div
                className={`${styles.cursorOutline} ${mode === 'restore' ? styles.cursorRestore : styles.cursorErase}`}
                style={{
                  left: `${cursorPreview.x}px`,
                  top: `${cursorPreview.y}px`,
                  width: `${cursorPreview.radius * 2}px`,
                  height: `${cursorPreview.radius * 2}px`,
                }}
              />
            ) : null}
            {loading ? <div className={styles.overlayMessage}>Loading image…</div> : null}
            {autoRemoving ? <div className={styles.overlayMessage}>Running auto remove…</div> : null}
          </div>
          <div className={styles.controls}>
            <div className={styles.modeRow}>
              <button
                type="button"
                className={`${styles.modeButton} ${mode === 'erase' ? styles.modeActive : ''}`}
                onClick={() => setMode('erase')}
              >
                Erase
              </button>
              <button
                type="button"
                className={`${styles.modeButton} ${mode === 'restore' ? styles.modeActive : ''}`}
                onClick={() => setMode('restore')}
              >
                Restore
              </button>
            </div>
            <label className={styles.control}>
              <span>Brush size</span>
              <input type="range" min="4" max="200" step="1" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} />
            </label>
            <label className={styles.control}>
              <span>Softness</span>
              <input type="range" min="0" max="1" step="0.01" value={softness} onChange={(event) => setSoftness(Number(event.target.value))} />
            </label>
            <label className={styles.control}>
              <span>Strength</span>
              <input type="range" min="0.05" max="1" step="0.01" value={strength} onChange={(event) => setStrength(Number(event.target.value))} />
            </label>
            <div className={styles.shadowHeader}>
              <label className={styles.shadowToggleLabel}>
                <input
                  type="checkbox"
                  checked={dropShadowEnabled}
                  onChange={(event) => setDropShadowEnabled(event.target.checked)}
                />
                <span>Drop shadow</span>
              </label>
            </div>
            {dropShadowEnabled ? (
              <div className={styles.shadowControls}>
                <label className={styles.control}>
                  <span>Blur</span>
                  <input type="range" min="0" max="64" step="1" value={shadowBlur} onChange={(event) => setShadowBlur(Number(event.target.value))} />
                </label>
                <label className={styles.control}>
                  <span>Offset X</span>
                  <input type="range" min="-64" max="64" step="1" value={shadowOffsetX} onChange={(event) => setShadowOffsetX(Number(event.target.value))} />
                </label>
                <label className={styles.control}>
                  <span>Offset Y</span>
                  <input type="range" min="-64" max="64" step="1" value={shadowOffsetY} onChange={(event) => setShadowOffsetY(Number(event.target.value))} />
                </label>
                <label className={styles.control}>
                  <span>Opacity</span>
                  <input type="range" min="0" max="1" step="0.01" value={shadowOpacity} onChange={(event) => setShadowOpacity(Number(event.target.value))} />
                </label>
              </div>
            ) : null}
            <div className={styles.historyRow}>
              <button type="button" className={styles.secondaryBtn} onClick={undo} disabled={undoCount === 0 || loading || applying}>
                Undo
              </button>
              <button type="button" className={styles.secondaryBtn} onClick={redo} disabled={redoCount === 0 || loading || applying}>
                Redo
              </button>
              <button type="button" className={styles.secondaryBtn} onClick={() => void loadFromImageAlpha()} disabled={loading || autoRemoving || applying}>
                Reset
              </button>
            </div>
            <button type="button" className={styles.autoButton} onClick={() => void runAutoRemove()} disabled={loading || autoRemoving || applying}>
              {autoRemoving ? 'Auto removing…' : 'Auto remove background'}
            </button>
            {imageSize ? <p className={styles.meta}>{imageSize.width} × {imageSize.height}</p> : null}
            {error ? <p className={styles.error}>{error}</p> : null}
          </div>
        </div>
        <div className={styles.footer}>
          <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={applying}>
            Cancel
          </button>
          <button type="button" className={styles.confirmBtn} onClick={() => void handleApply()} disabled={!canApply}>
            {applying ? 'Applying…' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  )
}
