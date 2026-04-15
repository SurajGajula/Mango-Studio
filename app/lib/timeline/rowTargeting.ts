export type TimelineDragItemType = 'video' | 'image' | 'text' | 'audio' | 'effect'

export function getMaxOverlayRow(itemsByType: {
  videos: Array<{ row: number }>
  images: Array<{ row: number }>
  texts: Array<{ row: number }>
  audios: Array<{ row: number }>
  effects: Array<{ row: number }>
}): number {
  let maxOverlayRow = 0
  const bump = (r: number) => {
    if (r > maxOverlayRow) maxOverlayRow = r
  }
  itemsByType.videos.forEach((v) => {
    if (v.row > 0) bump(v.row)
  })
  itemsByType.images.forEach((img) => {
    if (img.row > 0) bump(img.row)
  })
  itemsByType.texts.forEach((t) => {
    if (t.row > 0) bump(t.row)
  })
  itemsByType.audios.forEach((a) => {
    if (a.row > 0) bump(a.row)
  })
  itemsByType.effects.forEach((e) => {
    if (e.row > 0) bump(e.row)
  })
  return maxOverlayRow
}

export function resolveTargetRow(
  rowElements: HTMLElement[],
  clientY: number,
  itemType: TimelineDragItemType,
  initialRow: number,
  maxOverlayRow: number
): { targetRow: number; isInsertion: boolean } {
  const overlayVisualItem =
    itemType === 'image' ||
    itemType === 'video' ||
    itemType === 'text' ||
    itemType === 'effect'
  const canUseTopOverlayAudioLane = itemType === 'audio' && initialRow >= 0

  let targetRow = initialRow
  let isInsertion = false
  let foundRow = false
  const y = clientY

  const firstRow = rowElements[0]
  if (firstRow) {
    const firstRowRect = firstRow.getBoundingClientRect()
    if (y < firstRowRect.top) {
      const firstRowIndexAttr = firstRow.getAttribute('data-row-index')
      if (firstRowIndexAttr) {
        const firstIdx = parseInt(firstRowIndexAttr)
        if (firstIdx !== -1) {
          targetRow = firstIdx + 1
          isInsertion = true
          foundRow = true
        } else if (itemType === 'audio' && initialRow === 0) {
          targetRow = 0
          foundRow = true
        } else if (overlayVisualItem || canUseTopOverlayAudioLane) {
          targetRow = maxOverlayRow + 1
          foundRow = true
        }
      }
    }
  }

  if (!foundRow) {
    for (let i = 0; i < rowElements.length; i++) {
      const row = rowElements[i]
      const rowRect = row.getBoundingClientRect()
      const rowIndexAttr = row.getAttribute('data-row-index')
      const rowIndex = rowIndexAttr ? parseInt(rowIndexAttr) : -1

      if (y >= rowRect.top && y <= rowRect.bottom) {
        if (rowIndex === -1 && itemType === 'audio') {
          targetRow = 0
          foundRow = true
          break
        }
        if (rowIndex === -1 && overlayVisualItem) {
          targetRow = maxOverlayRow + 1
          foundRow = true
          break
        }
        if (rowIndex !== -1) {
          targetRow = rowIndex
          foundRow = true
          break
        }
      }

      if (i < rowElements.length - 1) {
        const nextRow = rowElements[i + 1]
        const nextRowRect = nextRow.getBoundingClientRect()
        if (y > rowRect.bottom && y < nextRowRect.top) {
          const nextRowIndexAttr = nextRow.getAttribute('data-row-index')
          if (nextRowIndexAttr) {
            const nextIdx = parseInt(nextRowIndexAttr)
            if (nextIdx !== -1) {
              targetRow = nextIdx + 1
              isInsertion = true
              foundRow = true
              break
            }
          }
        }
      }
    }
  }

  if (!foundRow) {
    const firstUnified = rowElements.find((el) => {
      const a = el.getAttribute('data-row-index')
      return a !== null && parseInt(a, 10) > 0
    })
    if ((overlayVisualItem || canUseTopOverlayAudioLane) && firstUnified) {
      const ur = firstUnified.getBoundingClientRect()
      if (y < ur.top) {
        targetRow = maxOverlayRow + 1
      }
    }
  }

  return { targetRow, isInsertion }
}
