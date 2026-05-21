'use client'

import { memo, useRef, useLayoutEffect } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { TextClass } from '@/app/models/TextClass'
import { getKeyboardVisibleContent } from '@/app/lib/textUtils'
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
  playbackTime,
  textRefs,
}: TextOverlayProps) {
  const updateText = useManifestStore((state) => state.updateText)
  const pushHistory = useManifestStore((state) => state.pushHistory)
  const selectedTextId = useSelectionStore((state) => state.selectedTextId)
  const selectText = useSelectionStore((state) => state.selectText)
  const setContextMenu = useSelectionStore((state) => state.setContextMenu)

  const isSelected = selectedTextId === text.id
  const isEditing = editingTextId === text.id
  const rawContent = text.content || 'Text'
  const displayContent =
    text.animation === 'keyboard' && !isEditing
      ? getKeyboardVisibleContent(rawContent, text.startTime, text.endTime, playbackTime)
      : rawContent
  const shakeTransform =
    text.animation === 'shake' && !isEditing
      ? (() => {
          const duration = Math.max(0.001, text.endTime - text.startTime)
          const localTime = Math.max(0, playbackTime - text.startTime)
          const normalized = Math.min(1, localTime / duration)
          const envelope = 0.6 + 0.4 * Math.sin(normalized * Math.PI)
          const angle = localTime * 2 * Math.PI
          const shiftX = Math.sin(angle * 2.0) * 0.06 * text.fontSize * xScale * envelope
          const shiftY = Math.cos(angle * 2.3) * 0.04 * text.fontSize * yScale * envelope
          const rotate = Math.sin(angle * 1.6) * 0.9 * envelope
          return `translate(${shiftX}px, ${shiftY}px) rotate(${rotate}deg)`
        })()
      : undefined
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const editFocusInitializedForId = useRef<string | null>(null)

  useLayoutEffect(() => {
    if (!isEditing) {
      editFocusInitializedForId.current = null
      return
    }
    const el = textareaRef.current
    if (!el || editFocusInitializedForId.current === text.id) return
    editFocusInitializedForId.current = text.id
    el.focus()
    const len = el.value.length
    el.setSelectionRange(len, len)
  }, [isEditing, text.id])

  return (
    <div
      ref={(el) => { textRefs.current.set(text.id, el) }}
      className={`${styles.textOverlay} ${isSelected ? styles.textOverlaySelected : ''}`}
      style={{
        left: offsetX + text.x * xScale,
        top: offsetY + text.y * yScale,
        width: text.width * xScale,
        fontSize: text.fontSize * xScale,
        color: text.style === 'highlight' ? '#ffffff' : (text.style === 'negative' ? '#ffffff' : text.color),
        fontWeight: text.fontWeight,
        textAlign: text.textAlign as React.CSSProperties['textAlign'],
        fontFamily: text.fontFamily,
        opacity: text.opacity,
        transform: shakeTransform,
        transformOrigin: 'center',
        mixBlendMode: text.style === 'negative' ? 'difference' : 'normal',
        backgroundColor: (text.style === 'negative' || text.style === 'highlight') ? '#000000' : 'transparent',
        textShadow: (text.style === 'negative' || text.style === 'highlight') ? 'none' : undefined,
        border: (text.style === 'negative' || text.style === 'highlight') && !isSelected ? 'none' : undefined,
      }}
      onMouseDown={(e) => handleTextMouseDown(text.id, e)}
      onContextMenu={(e) => {
        if (isEditing) return
        e.preventDefault()
        e.stopPropagation()
        selectText(text.id)
        setContextMenu({
          isOpen: true,
          x: e.clientX,
          y: e.clientY,
          itemId: text.id,
          itemType: 'text',
        })
      }}
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
            textShadow: (text.style === 'negative' || text.style === 'highlight') ? 'none' : undefined,
          }}
          onChange={(e) => { editingContentRef.current = e.target.value; setEditingContent(e.target.value) }}
          ref={textareaRef}
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
      ) : displayContent}
    </div>
  )
}

export default memo(TextOverlayComponent, (prev, next) => {
  return (
    prev.text === next.text &&
    prev.xScale === next.xScale &&
    prev.yScale === next.yScale &&
    prev.offsetX === next.offsetX &&
    prev.offsetY === next.offsetY &&
    prev.editingTextId === next.editingTextId &&
    prev.editingContent === next.editingContent &&
    prev.playbackTime === next.playbackTime
  )
})
