'use client'

import { useMemo, memo, useRef, useLayoutEffect, Fragment } from 'react'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { getKeyboardVisibleWordCount, wrapTextToLines } from '@/app/lib/textUtils'
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
  const selectText = useSelectionStore((state) => state.selectText)
  const setContextMenu = useSelectionStore((state) => state.setContextMenu)

  const isSelected = selectedTextId === text.id
  const isEditing = editingTextId === text.id
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

  const baseContent = text.content || 'Text'

  const keyboardVisibleCount = useMemo(() => {
    if (isEditing || text.animation !== 'keyboard') return null
    const words = baseContent.split(/\s+/).filter((w) => w.length > 0)
    if (words.length === 0) return null
    return getKeyboardVisibleWordCount(baseContent, text.startTime, text.endTime, playbackTime)
  }, [isEditing, text.animation, baseContent, text.startTime, text.endTime, playbackTime])

  const lines = useMemo(() => {
    if (isEditing) return []
    const mCtx = getMeasureCtx()
    mCtx.font = `${text.fontWeight} ${text.fontSize * xScale}px ${text.fontFamily}`
    return wrapTextToLines(mCtx, baseContent, text.width * xScale)
  }, [baseContent, text.fontWeight, text.fontSize, xScale, text.fontFamily, text.width, getMeasureCtx, isEditing])

  const keyboardNodes = useMemo(() => {
    if (keyboardVisibleCount === null) return null
    let nextWordIndex = 0
    return lines.map((line, li) => {
      const parts = line.split(' ')
      const partWordIndex = parts.map((w) => (w === '' ? null : nextWordIndex++))
      const row: React.ReactNode[] = []
      for (let p = 0; p < parts.length; p++) {
        const w = parts[p]
        if (p > 0) {
          let j = p
          while (j < parts.length && parts[j] === '') j++
          const spVis =
            j < parts.length &&
            partWordIndex[j] !== null &&
            partWordIndex[j]! < keyboardVisibleCount
          row.push(
            <span key={`${li}-sp-${p}`} style={{ visibility: spVis ? 'visible' : 'hidden' }}>
              {' '}
            </span>
          )
        }
        if (w !== '' && partWordIndex[p] !== null) {
          const idx = partWordIndex[p]!
          row.push(
            <span key={`${li}-w-${p}`} style={{ visibility: idx < keyboardVisibleCount ? 'visible' : 'hidden' }}>
              {w}
            </span>
          )
        }
      }
      return (
        <Fragment key={li}>
          {li > 0 ? '\n' : null}
          {row}
        </Fragment>
      )
    })
  }, [lines, keyboardVisibleCount])

  const shakeTransform = useMemo(() => {
    if (text.animation !== 'shake' || isEditing) return undefined
    const duration = Math.max(0.001, text.endTime - text.startTime)
    const localTime = Math.max(0, playbackTime - text.startTime)
    const normalized = Math.min(1, localTime / duration)
    const envelope = 0.6 + 0.4 * Math.sin(normalized * Math.PI)
    const angle = localTime * 2 * Math.PI
    const shiftX = Math.sin(angle * 2.0) * 0.06 * text.fontSize * xScale * envelope
    const shiftY = Math.cos(angle * 2.3) * 0.04 * text.fontSize * yScale * envelope
    const rotate = Math.sin(angle * 1.6) * 0.9 * envelope
    return `translate(${shiftX}px, ${shiftY}px) rotate(${rotate}deg)`
  }, [text.animation, text.startTime, text.endTime, text.fontSize, playbackTime, xScale, yScale, isEditing])

  return (
    <div
      ref={(el) => { textRefs.current.set(text.id, el) }}
      className={`${styles.textOverlay} ${isSelected ? styles.textOverlaySelected : ''}`}
      style={{
        left: offsetX + text.x * xScale,
        top: offsetY + text.y * yScale,
        width: text.width * xScale,
        fontSize: text.fontSize * xScale,
        color: text.style === 'highlight' ? '#ffff00' : (text.style === 'negative' ? '#ffffff' : text.color),
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
      ) : keyboardNodes ?? lines.join('\n')}
    </div>
  )
}

export default memo(TextOverlayComponent, (prev, next) => {
  if (prev.text.animation === 'keyboard') {
    const prevC = prev.text.content || 'Text'
    const nextC = next.text.content || 'Text'
    const prevV = getKeyboardVisibleWordCount(prevC, prev.text.startTime, prev.text.endTime, prev.playbackTime)
    const nextV = getKeyboardVisibleWordCount(nextC, next.text.startTime, next.text.endTime, next.playbackTime)
    if (prevV !== nextV) return false
  }
  if (prev.text.animation === 'shake' || next.text.animation === 'shake') {
    if (prev.playbackTime !== next.playbackTime) return false
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
