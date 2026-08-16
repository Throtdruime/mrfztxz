/**
 * Convert a browser client coordinate into the canvas backing-store space.
 * This remains correct when CSS scales the canvas for a responsive preview.
 */
export function clientPointToCanvas(canvas, clientX, clientY) {
  if (!canvas || typeof canvas.getBoundingClientRect !== "function") {
    throw new TypeError("canvas must provide getBoundingClientRect()");
  }

  const rect = canvas.getBoundingClientRect();
  const left = Number.isFinite(rect.left) ? rect.left : (rect.x || 0);
  const top = Number.isFinite(rect.top) ? rect.top : (rect.y || 0);
  const cssWidth = Number.isFinite(rect.width) ? rect.width : 0;
  const cssHeight = Number.isFinite(rect.height) ? rect.height : 0;
  const backingWidth = Number.isFinite(canvas.width) ? canvas.width : cssWidth;
  const backingHeight = Number.isFinite(canvas.height) ? canvas.height : cssHeight;
  const scaleX = cssWidth !== 0 ? backingWidth / cssWidth : 1;
  const scaleY = cssHeight !== 0 ? backingHeight / cssHeight : 1;

  return {
    x: (clientX - left) * scaleX,
    y: (clientY - top) * scaleY,
  };
}

/**
 * Test whether a point is inside a rendered axis-aligned rectangle.
 * Edges count as hits. Negative dimensions are accepted and normalised.
 */
export function hitTest(point, renderInfo) {
  if (!point || !renderInfo) return false;

  const values = [
    point.x,
    point.y,
    renderInfo.x,
    renderInfo.y,
    renderInfo.width,
    renderInfo.height,
  ];
  if (!values.every(Number.isFinite)) return false;

  const right = renderInfo.x + renderInfo.width;
  const bottom = renderInfo.y + renderInfo.height;
  const minX = Math.min(renderInfo.x, right);
  const maxX = Math.max(renderInfo.x, right);
  const minY = Math.min(renderInfo.y, bottom);
  const maxY = Math.max(renderInfo.y, bottom);

  return point.x >= minX && point.x <= maxX &&
      point.y >= minY && point.y <= maxY;
}
