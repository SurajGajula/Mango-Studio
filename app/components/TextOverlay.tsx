'use client'

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

export default function TextOverlay({
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

  return (
    <div
      key={text.id}
      ref={(el) => { textRefs.current.set(text.id, el) }}
      className={`${styles.textOverlay} ${isSelected ? styles.textOverlaySelected : ''}`}
      style={{
        left: offsetX + text.x * xScale,
        top: offsetY + text.y * yScale,
        width: text.width * xScale,
        fontSize: text.fontSize * xScale,
        color: text.color,
        fontWeight: text.fontWeight,
        textAlign: text.textAlign as React.CSSProperties['textAlign'],
        fontFamily: text.fontFamily,
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
      ) : (() => {
        const mCtx = getMeasureCtx()
        mCtx.font = `${text.fontWeight} ${text.fontSize * xScale}px ${text.fontFamily}`
        let content = text.content || 'Text'
        
        if (text.animation === 'keyboard' && !isEditing) {
          const words = content.split(/\s+/)
          const duration = text.endTime - text.startTime
          if (duration > 0 && words.length > 0) {
            const wordDuration = duration / words.length
            const elapsed = playbackTime - text.startTime
            const visibleCount = Math.min(words.length, Math.floor(elapsed / wordDuration) + 1)
            content = words.slice(0, visibleCount).join(' ')
          }
        }

        const lines = wrapTextToLines(mCtx, content, text.width * xScale)
        return lines.join('\n')
      })()}
    </div>
  )
}
