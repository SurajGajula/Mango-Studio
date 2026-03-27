'use client'

import { useManifestStore } from '@/app/stores/manifestStore'
import { useEffect, useRef } from 'react'

interface CropEditorProps {
  cropEditId: string
  xScale: number
  yScale: number
  offsetX: number
  offsetY: number
  contentRect: { width: number; height: number }
  playbackTime: number
  cropPanState: any
  handleCropPanStart: (e: React.PointerEvent) => void
  exitCropEdit: () => void
}

export default function CropEditor({
  cropEditId,
  xScale,
  yScale,
  offsetX,
  offsetY,
  contentRect,
  playbackTime,
  cropPanState,
  handleCropPanStart,
  exitCropEdit,
}: CropEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mediaRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null)
  const images = useManifestStore((state) => state.images)
  const videos = useManifestStore((state) => state.videos)

  const img = images.find((i) => i.id === cropEditId)
  const vid = videos.find((v) => v.id === cropEditId)
  const item = img || vid

  useEffect(() => {
    if (!item?.url) return
    const isImage = (item as any).startTime !== undefined
    const el = isImage ? new Image() : document.createElement('video')
    el.src = item.url
    mediaRef.current = el
    
    if (el instanceof HTMLVideoElement) {
      el.muted = true
      el.playsInline = true
    }

    return () => {
      mediaRef.current = null
      if (el instanceof HTMLVideoElement) {
        el.pause()
        el.src = ''
        el.load()
      }
    }
  }, [item?.url, (item as any).startTime !== undefined])

  useEffect(() => {
    if (!item || !canvasRef.current || !mediaRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const mediaEl = mediaRef.current
    if (!ctx || !mediaEl) return

    let active = true

    const render = () => {
      if (!active || !mediaRef.current) return
      const mNw = mediaEl instanceof HTMLImageElement ? mediaEl.naturalWidth : (mediaEl as HTMLVideoElement).videoWidth
      const mNh = mediaEl instanceof HTMLImageElement ? mediaEl.naturalHeight : (mediaEl as HTMLVideoElement).videoHeight
      
      if (mNw === 0 || mNh === 0) return

      const itemW = item.width
      const itemH = item.height
      const itemX = item.x
      const itemY = item.y

      const destX = itemX * xScale + offsetX
      const destY = itemY * yScale + offsetY
      const destW = itemW * xScale
      const destH = itemH * yScale

      const cs = item.cropSw ?? 1
      const ct = item.cropSh ?? 1
      const sx = item.cropSx ?? 0
      const sy = item.cropSy ?? 0
      const fullImgW = destW / cs
      const fullImgH = destH / ct
      const fullImgLeft = destX - sx * fullImgW
      const fullImgTop = destY - sy * fullImgH

      canvas.width = contentRect.width
      canvas.height = contentRect.height
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const imgOnCanvasX = fullImgLeft - offsetX
      const imgOnCanvasY = fullImgTop - offsetY

      const drawSubImage = (opacity: number, clipBox?: {x:number, y:number, w:number, h:number}) => {
        ctx.save()
        if (clipBox) {
          ctx.beginPath()
          ctx.rect(clipBox.x, clipBox.y, clipBox.w, clipBox.h)
          ctx.clip()
        }
        ctx.globalAlpha = opacity

        // Only draw the intersection of the image and the viewport
        const ix = Math.max(0, imgOnCanvasX)
        const iy = Math.max(0, imgOnCanvasY)
        const iw = Math.min(canvas.width, imgOnCanvasX + fullImgW) - ix
        const ih = Math.min(canvas.height, imgOnCanvasY + fullImgH) - iy

        if (iw > 0 && ih > 0) {
          const isx = (ix - imgOnCanvasX) * (mNw / fullImgW)
          const isy = (iy - imgOnCanvasY) * (mNh / fullImgH)
          const isw = iw * (mNw / fullImgW)
          const ish = ih * (mNh / fullImgH)
          ctx.drawImage(mediaEl, isx, isy, isw, ish, ix, iy, iw, ih)
        }
        ctx.restore()
      }

      // 1. Draw dimmed full image
      drawSubImage(0.45)
      
      // 2. Draw highlighted crop box
      const cropBoxLeft = destX - offsetX
      const cropBoxTop = destY - offsetY
      drawSubImage(1.0, { x: cropBoxLeft, y: cropBoxTop, w: destW, h: destH })

      // 3. Draw border
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'
      ctx.lineWidth = 1.5
      ctx.strokeRect(cropBoxLeft, cropBoxTop, destW, destH)
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'
      ctx.lineWidth = 1
      ctx.strokeRect(cropBoxLeft - 1, cropBoxTop - 1, destW + 2, destH + 2)
    }

    if (mediaEl instanceof HTMLImageElement) {
      if (mediaEl.complete) render()
      else mediaEl.onload = render
    } else {
      const vid = mediaEl as HTMLVideoElement
      const onMetadata = () => {
        const itemStartTime = (item as any).startTime ?? (item as any).timestamp
        const trimStart = (item as any).trimStart ?? 0
        vid.currentTime = playbackTime - itemStartTime + trimStart
        vid.onseeked = render
      }
      if (vid.readyState >= 1) onMetadata()
      else vid.onloadedmetadata = onMetadata
    }

    return () => { active = false }
  }, [item, xScale, yScale, offsetX, offsetY, contentRect, playbackTime])

  if (!item) return null

  const clipLeft = offsetX
  const clipTop = offsetY
  const clipW = contentRect.width
  const clipH = contentRect.height

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          left: clipLeft,
          top: clipTop,
          width: clipW,
          height: clipH,
          pointerEvents: 'none',
          zIndex: 10
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: clipLeft,
          top: clipTop,
          width: clipW,
          height: clipH,
          cursor: cropPanState ? 'grabbing' : 'grab',
          zIndex: 60,
          userSelect: 'none',
          pointerEvents: 'auto',
          touchAction: 'none'
        }}
        onPointerDown={handleCropPanStart}
        onDoubleClick={exitCropEdit}
      />
    </>
  )
}
