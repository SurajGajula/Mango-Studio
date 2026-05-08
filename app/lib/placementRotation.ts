export function runWithPlacementRotation(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rotationDeg: number | undefined,
  draw: (originX: number, originY: number) => void,
  flipHorizontal?: boolean,
  flipVertical?: boolean
): void {
  const deg = rotationDeg ?? 0
  const sx = flipHorizontal ? -1 : 1
  const sy = flipVertical ? -1 : 1
  if (deg === 0 && sx === 1 && sy === 1) {
    draw(x, y)
    return
  }
  ctx.save()
  ctx.translate(x + w / 2, y + h / 2)
  if (deg !== 0) ctx.rotate((deg * Math.PI) / 180)
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy)
  draw(-w / 2, -h / 2)
  ctx.restore()
}
