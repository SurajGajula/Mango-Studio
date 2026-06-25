'use client'

import { memo, useRef, useLayoutEffect, useEffect, useMemo, useState } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { TextClass } from '@/app/models/TextClass'
import { resolveCanvasFont, TEXT_LINE_HEIGHT } from '@/app/lib/drawTextOverlay'
import { measurePreviewTextDomHeight, measurePreviewTextLogicalHeight } from '@/app/lib/measurePreviewTextDom'
import { getVisibleWordCount } from '@/app/lib/textUtils'
import styles from './PreviewArea.module.css'

interface TextOverlayProps {
  text: TextClass
  isVisible: boolean
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
  isVisible,
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
  const [measuredHeightPx, setMeasuredHeightPx] = useState<number | null>(null)
  const editTextColor =
    text.style === 'highlight' || text.style === 'negative' ? '#ffffff' : text.color
  const visibleContent = useMemo(() => {
    if (isEditing) return editingContent
    if (text.animation !== 'keyboard' && text.animation !== 'speech') return text.content
    const words = text.content.split(/\s+/).filter((w) => w.length > 0)
    if (words.length === 0) return text.content
    const visibleWordCount = getVisibleWordCount(
      text.content,
      text.startTime,
      text.endTime,
      playbackTime,
      text.animation,
      text.wordTimings
    )
    if (visibleWordCount === null || visibleWordCount <= 0) return ''
    return words.slice(0, visibleWordCount).join(' ')
  }, [isEditing, editingContent, text, playbackTime])
  const displayContent = isEditing ? editingContent : visibleContent
  const fallbackHeightPx = useMemo(() => {
    if (xScale <= 0) return text.height * yScale
    return measurePreviewTextDomHeight(displayContent, text, xScale)
  }, [displayContent, text, xScale, text.height, yScale])
  const resolvedOverlayHeightPx = measuredHeightPx ?? fallbackHeightPx
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
  const lastSyncedLogicalHeightRef = useRef(text.height)

  useLayoutEffect(() => {
    lastSyncedLogicalHeightRef.current = text.height
  }, [text.height])

  useLayoutEffect(() => {
    if (isEditing) {
      const el = textareaRef.current
      if (!el) return
      el.style.height = '0px'
      const nextHeight = el.scrollHeight
      el.style.height = `${nextHeight}px`
      setMeasuredHeightPx(nextHeight)
      if (editFocusInitializedForId.current === text.id) return
      editFocusInitializedForId.current = text.id
      el.focus()
      const len = el.value.length
      el.setSelectionRange(len, len)
      return
    }

    editFocusInitializedForId.current = null
    const overlay = textRefs.current.get(text.id)
    if (!overlay) return

    const previousHeight = overlay.style.height
    overlay.style.height = 'auto'
    const nextHeight = overlay.scrollHeight
    overlay.style.height = previousHeight
    if (nextHeight <= 0) return

    setMeasuredHeightPx(nextHeight)

    if (yScale <= 0) return
    const logicalHeight = nextHeight / yScale
    if (Math.abs(logicalHeight - lastSyncedLogicalHeightRef.current) <= 0.5) return
    lastSyncedLogicalHeightRef.current = logicalHeight
    updateText(text.id, { height: logicalHeight })
  }, [
    isEditing,
    text.id,
    displayContent,
    editingContent,
    text.width,
    text.fontSize,
    text.fontWeight,
    text.fontFamily,
    text.textAlign,
    xScale,
    yScale,
    textRefs,
    updateText,
  ])

  useEffect(() => {
    if (!isEditing) return
    setEditingContent(text.content)
    editingContentRef.current = text.content
  }, [isEditing, text.id, text.content, setEditingContent, editingContentRef])

  return (
    <div
      ref={(el) => { textRefs.current.set(text.id, el) }}
      className={`${styles.textOverlay} ${isSelected ? styles.textOverlaySelected : ''}`}
      style={{
        left: offsetX + text.x * xScale,
        top: offsetY + text.y * yScale,
        width: text.width * xScale,
        height: resolvedOverlayHeightPx,
        visibility: isVisible ? 'visible' : 'hidden',
        pointerEvents: isVisible ? 'auto' : 'none',
        fontSize: text.fontSize * xScale,
        lineHeight: TEXT_LINE_HEIGHT,
        color: editTextColor,
        fontWeight: text.fontWeight,
        textAlign: text.textAlign as React.CSSProperties['textAlign'],
        fontFamily: resolveCanvasFont(text.fontFamily),
        opacity: text.opacity,
        transform: shakeTransform,
        transformOrigin: 'center',
        mixBlendMode: text.style === 'negative' ? 'difference' : 'normal',
        backgroundColor:
          text.style === 'highlight' ? '#000000' : 'transparent',
        textShadow: text.style === 'normal' ? undefined : 'none',
        boxSizing: 'border-box',
        overflow: 'visible',
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
      onDoubleClick={(e) => {
        e.stopPropagation()
        pushHistory()
        editingContentRef.current = text.content
        setEditingContent(text.content)
        setEditingTextId(text.id)
      }}
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
          data-text-edit=""
          value={editingContent}
          className={styles.textEditArea}
          style={{
            fontFamily: resolveCanvasFont(text.fontFamily),
            fontWeight: text.fontWeight,
            fontSize: 'inherit',
            lineHeight: TEXT_LINE_HEIGHT,
            height: resolvedOverlayHeightPx,
            caretColor: editTextColor,
            textShadow: text.style === 'negative' || text.style === 'highlight' ? 'none' : undefined,
          }}
          onChange={(e) => { editingContentRef.current = e.target.value; setEditingContent(e.target.value) }}
          ref={textareaRef}
          onBlur={() => {
            const textarea = textareaRef.current
            const logicalHeight = textarea && yScale > 0
              ? textarea.scrollHeight / yScale
              : measurePreviewTextLogicalHeight(editingContentRef.current, text, yScale)
            updateText(text.id, {
              content: editingContentRef.current,
              height: logicalHeight,
            })
            pushHistory()
            setEditingTextId(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setEditingTextId(null) }
            e.stopPropagation()
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        displayContent
      )}
    </div>
  )
}

export default memo(TextOverlayComponent, (prev, next) => {
  return (
    prev.text === next.text &&
    prev.isVisible === next.isVisible &&
    prev.xScale === next.xScale &&
    prev.yScale === next.yScale &&
    prev.offsetX === next.offsetX &&
    prev.offsetY === next.offsetY &&
    prev.editingTextId === next.editingTextId &&
    prev.editingContent === next.editingContent &&
    prev.playbackTime === next.playbackTime
  )
})
