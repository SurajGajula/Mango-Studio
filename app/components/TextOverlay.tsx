'use client'

import { useMemo, memo } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { wrapTextToLines } from '@/app/lib/textUtils'
import { TextClass } from '@/app/models/TextClass'
import styles from './PreviewArea.module.css'

interface TextOverlayProps {
  text: TextClass
  xScale: number
  yScale: number
  offsetX: number
  offsetY: number
  editingTextId: string | null
  setEditingTextId: (id: string | null) => void
  editingContent: string
  setEditingContent: (content: string) => void
  editingContentRef: React.MutableRefObject<string>
  handleTextMouseDown: (textId: string, e: React.MouseEvent) => void
  handleTextResizeStart: (textId: string, side: 'left' | 'right', e: React.MouseEvent) => void
  getMeasureCtx: () => CanvasRenderingContext2D
  playbackTime: number
  textRefs: React.MutableRefObject<Map<string, HTMLDivElement | null>>
}

function TextOverlayComponent({
  text,
  xScale,
  yScale,
  offsetX,
  offsetY,
  editingTextId,
  setEditingTextId,
  editingContent,
  setEditingContent,
  editingContentRef,
  handleTextMouseDown,
  handleTextResizeStart,
  getMeasureCtx,
  playbackTime,
  textRefs,
}: TextOverlayProps) {
  const updateText = useManifestStore((state) => state.updateText)
  const pushHistory = useManifestStore((state) => state.pushHistory)
  const selectedTextId = useSelectionStore((state) => state.selectedTextId)

  const isSelected = selectedTextId === text.id
  const isEditing = editingTextId === text.id

  const displayContent = useMemo(() => {
    if (isEditing) return null
    let content = text.content || 'Text'
    
    if (text.animation === 'keyboard') {
      const words = content.split(/\s+/)
      const duration = text.endTime - text.startTime
      if (duration > 0 && words.length > 0) {
        const wordDuration = duration / words.length
        const elapsed = playbackTime - text.startTime
        const visibleCount = Math.max(1, Math.min(words.length, Math.floor(elapsed / wordDuration) + 1))
        content = words.slice(0, visibleCount).join(' ')
      }
    }
    return content
  }, [text.content, text.animation, text.startTime, text.endTime, playbackTime, isEditing])

  const lines = useMemo(() => {
    if (isEditing || !displayContent) return []
    const mCtx = getMeasureCtx()
    mCtx.font = `${text.fontWeight} ${text.fontSize * xScale}px ${text.fontFamily}`
    return wrapTextToLines(mCtx, displayContent, text.width * xScale)
  }, [displayContent, text.fontWeight, text.fontSize, xScale, text.fontFamily, text.width, getMeasureCtx, isEditing])

  return (
    <div
      ref={(el) => { textRefs.current.set(text.id, el) }}
      className={`${styles.textOverlay} ${isSelected ? styles.textOverlaySelected : ''}`}
      style={{
        left: offsetX + text.x * xScale,
        top: offsetY + text.y * yScale,
        width: text.width * xScale,
        fontSize: text.fontSize * xScale,
        color: text.style === 'negative' ? '#ffffff' : text.color,
        fontWeight: text.fontWeight,
        textAlign: text.textAlign as React.CSSProperties['textAlign'],
        fontFamily: text.fontFamily,
        opacity: text.opacity,
        mixBlendMode: text.style === 'negative' ? 'difference' : 'normal',
        backgroundColor: text.style === 'negative' ? '#000000' : 'transparent',
        textShadow: text.style === 'negative' ? 'none' : 'none',
        border: text.style === 'negative' && !isSelected ? 'none' : undefined,
      }}
      onMouseDown={(e) => handleTextMouseDown(text.id, e)}
      onDoubleClick={(e) => { e.stopPropagation(); editingContentRef.current = text.content; setEditingContent(text.content); setEditingTextId(text.id) }}
    >
      {isSelected && !isEditing && (
        <>
          <div
            className={`${styles.textResizeHandle} ${styles.textResizeHandleLeft}`}
            onMouseDown={(e) => handleTextResizeStart(text.id, 'left', e)}
          />
          <div
            className={`${styles.textResizeHandle} ${styles.textResizeHandleRight}`}
            onMouseDown={(e) => handleTextResizeStart(text.id, 'right', e)}
          />
        </>
      )}
      {isEditing ? (
        <textarea
          value={editingContent}
          className={styles.textEditArea}
          style={{
            textShadow: text.style === 'negative' ? 'none' : undefined,
          }}
          onChange={(e) => { editingContentRef.current = e.target.value; setEditingContent(e.target.value) }}
          ref={(el) => {
            if (el) {
              setTimeout(() => {
                el.focus()
                const len = el.value.length
                el.setSelectionRange(len, len)
              }, 0)
            }
          }}
          onBlur={() => {
            updateText(text.id, { content: editingContentRef.current })
            pushHistory()
            setEditingTextId(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setEditingTextId(null) }
            e.stopPropagation()
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : lines.join('\n')}
    </div>
  )
}

export default memo(TextOverlayComponent, (prev, next) => {
  // Only re-render if playbackTime actually changes the visible content for keyboard animation
  if (prev.text.animation === 'keyboard') {
    const words = prev.text.content.split(/\s+/)
    const duration = prev.text.endTime - prev.text.startTime
    const wordDuration = duration / words.length
    
    const prevElapsed = prev.playbackTime - prev.text.startTime
    const nextElapsed = next.playbackTime - next.text.startTime
    
    const prevVisible = Math.max(1, Math.min(words.length, Math.floor(prevElapsed / wordDuration) + 1))
    const nextVisible = Math.max(1, Math.min(words.length, Math.floor(nextElapsed / wordDuration) + 1))
    
    if (prevVisible !== nextVisible) return false
  }
  
  // If not keyboard animation or no change in visible words, check other props
  return (
    prev.text === next.text &&
    prev.xScale === next.xScale &&
    prev.yScale === next.yScale &&
    prev.offsetX === next.offsetX &&
    prev.offsetY === next.offsetY &&
    prev.editingTextId === next.editingTextId &&
    prev.editingContent === next.editingContent &&
    // We intentionally ignore playbackTime if it doesn't affect visible content
    true 
  )
})
