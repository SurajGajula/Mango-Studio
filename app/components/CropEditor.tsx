'use client'

import { useManifestStore } from '@/app/stores/manifestStore'
import { ImageClass } from '@/app/models/ImageClass'
import styles from './PreviewArea.module.css'

interface CropEditorProps {
  cropEditId: string
  xScale: number
  yScale: number
  offsetX: number
  offsetY: number
  contentRect: { width: number; height: number }
  playbackTime: number
  cropPanState: any
  handleCropPanStart: (e: React.MouseEvent) => void
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
  const images = useManifestStore((state) => state.images)
  const videos = useManifestStore((state) => state.videos)

  const img = images.find((i) => i.id === cropEditId)
  const vid = videos.find((v) => v.id === cropEditId)
  const item = img || vid
  if (!item) return null

  let destX = item.x * xScale + offsetX
  let destY = item.y * yScale + offsetY
  let destW = item.width * xScale
  let destH = item.height * yScale

  const fullImgW = destW / item.cropSw
  const fullImgH = destH / item.cropSh
  const fullImgLeft = destX - item.cropSx * fullImgW
  const fullImgTop = destY - item.cropSy * fullImgH

  const clipLeft = offsetX
  const clipTop = offsetY
  const clipW = contentRect.width
  const clipH = contentRect.height

  const cropBoxLeft = destX - clipLeft
  const cropBoxTop = destY - clipTop

  return (
    <>
      <div style={{ position: 'absolute', left: clipLeft, top: clipTop, width: clipW, height: clipH, overflow: 'hidden', pointerEvents: 'none', zIndex: 10 }}>
        {item instanceof ImageClass ? (
          <img
            src={item.url}
            style={{ position: 'absolute', left: fullImgLeft - clipLeft, top: fullImgTop - clipTop, width: fullImgW, height: fullImgH, userSelect: 'none' }}
            draggable={false}
          />
        ) : (
          <video
            src={item.url}
            style={{ position: 'absolute', left: fullImgLeft - clipLeft, top: fullImgTop - clipTop, width: fullImgW, height: fullImgH, userSelect: 'none' }}
            muted
            onLoadedMetadata={(e) => {
              const v = e.target as HTMLVideoElement
              v.currentTime = playbackTime - item.timestamp + (item.trimStart ?? 0)
            }}
          />
        )}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: cropBoxTop, background: 'rgba(0,0,0,0.55)' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: cropBoxTop + destH, bottom: 0, background: 'rgba(0,0,0,0.55)' }} />
        <div style={{ position: 'absolute', top: cropBoxTop, left: 0, width: cropBoxLeft, height: destH, background: 'rgba(0,0,0,0.55)' }} />
        <div style={{ position: 'absolute', top: cropBoxTop, left: cropBoxLeft + destW, right: 0, height: destH, background: 'rgba(0,0,0,0.55)' }} />
      </div>
      <div style={{ position: 'absolute', left: destX, top: destY, width: destW, height: destH, border: '1.5px solid rgba(255,255,255,0.85)', outline: '1px solid rgba(0,0,0,0.4)', pointerEvents: 'none', zIndex: 11 }} />
      <div
        style={{ position: 'absolute', left: clipLeft, top: clipTop, width: clipW, height: clipH, cursor: cropPanState ? 'grabbing' : 'grab', zIndex: 60 }}
        onMouseDown={handleCropPanStart}
        onDoubleClick={exitCropEdit}
      />
    </>
  )
}
