export function runWithPlacementRotation(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rotationDeg: number | undefined,
  draw: (originX: number, originY: number) => void
): void {
  const deg = rotationDeg ?? 0
  if (deg === 0) {
    draw(x, y)
    return
  }
  ctx.save()
  ctx.translate(x + w / 2, y + h / 2)
  ctx.rotate((deg * Math.PI) / 180)
  draw(-w / 2, -h / 2)
  ctx.restore()
}
