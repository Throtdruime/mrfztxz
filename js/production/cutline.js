/**
 * Production cut-line geometry for the 590 x 1180 front artwork.
 *
 * The mask functions deliberately use plain typed arrays so they can run in a
 * browser, a worker, or Node without a DOM/canvas implementation.
 */

export const CUTLINE_WIDTH = 590;
export const CUTLINE_HEIGHT = 1180;
export const CUTLINE_OUTER_PATH =
  "M0 0 H590 V96 L574 112 V691 L590 707 V1165 L575 1180 H0 Z";

export const CUTLINE_HOLES = Object.freeze({
  leftCircle: Object.freeze({cx: 42, cy: 42, r: 18}),
  capsule: Object.freeze({x: 160, y: 24, width: 272, height: 36, r: 18}),
  rightCircle: Object.freeze({cx: 550, cy: 42, r: 18}),
});

function normalizeMaskDimensions(widthOrOptions, height) {
  let width = widthOrOptions;
  let mirror = false;

  if (widthOrOptions && typeof widthOrOptions === "object") {
    width = widthOrOptions.width ?? CUTLINE_WIDTH;
    height = widthOrOptions.height ?? CUTLINE_HEIGHT;
    mirror = Boolean(widthOrOptions.mirror);
  }

  width ??= CUTLINE_WIDTH;
  height ??= CUTLINE_HEIGHT;

  if (!Number.isInteger(width) || width <= 0) {
    throw new RangeError("Cut-shape mask width must be a positive integer.");
  }
  if (!Number.isInteger(height) || height <= 0) {
    throw new RangeError("Cut-shape mask height must be a positive integer.");
  }

  return {width, height, mirror};
}

function outerRightEdge(y) {
  if (y < 0 || y > CUTLINE_HEIGHT) return -Infinity;
  if (y <= 96) return 590;
  if (y <= 112) return 686 - y;
  if (y <= 691) return 574;
  if (y <= 707) return y - 117;
  if (y <= 1165) return 590;
  return 1755 - y;
}

function isInCircle(x, y, {cx, cy, r}) {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function isInCapsule(x, y) {
  const {x: left, y: top, width, height, r} = CUTLINE_HOLES.capsule;
  const right = left + width;
  const bottom = top + height;

  if (x < left || x > right || y < top || y > bottom) return false;

  const centerY = top + height / 2;
  const leftCenterX = left + r;
  const rightCenterX = right - r;

  if (x >= leftCenterX && x <= rightCenterX) return true;
  const centerX = x < leftCenterX ? leftCenterX : rightCenterX;
  const dx = x - centerX;
  const dy = y - centerY;
  return dx * dx + dy * dy <= r * r;
}

/**
 * Create a one-byte-per-pixel cut-shape alpha mask.
 *
 * Pixels inside the outer path and outside all three hanging holes are 255;
 * all other pixels are 0. Pixel centres are sampled, which keeps the result
 * deterministic and avoids depending on a canvas renderer's antialiasing.
 *
 * @param {number|{width?: number, height?: number}} [widthOrOptions=590]
 * @param {number} [height=1180]
 * @returns {Uint8ClampedArray}
 */
export function createCutShapeMask(
  widthOrOptions = CUTLINE_WIDTH,
  height = CUTLINE_HEIGHT,
) {
  const dimensions = normalizeMaskDimensions(widthOrOptions, height);
  const mask = new Uint8ClampedArray(dimensions.width * dimensions.height);

  for (let y = 0; y < dimensions.height; y += 1) {
    const sampleY = y + 0.5;
    const rightEdge = outerRightEdge(sampleY);
    const rowOffset = y * dimensions.width;

    for (let x = 0; x < dimensions.width; x += 1) {
      const sampleX = x + 0.5;
      const insideOuter = sampleX >= 0 && sampleX <= rightEdge;
      if (!insideOuter) continue;

      const inHole =
        isInCircle(sampleX, sampleY, CUTLINE_HOLES.leftCircle) ||
        isInCapsule(sampleX, sampleY) ||
        isInCircle(sampleX, sampleY, CUTLINE_HOLES.rightCircle);

      if (!inHole) mask[rowOffset + x] = 255;
    }
  }

  return dimensions.mirror
    ? mirrorMaskHorizontally(mask, dimensions.width, dimensions.height)
    : mask;
}

export function mirrorMaskHorizontally(mask, width, height) {
  if (!mask || mask.length !== width * height) {
    throw new RangeError("Mask dimensions do not match its data.");
  }
  const mirrored = new Uint8ClampedArray(mask.length);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      mirrored[row + width - 1 - x] = mask[row + x];
    }
  }
  return mirrored;
}

function escapeXmlAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function isPositiveSvgLength(value) {
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  if (typeof value !== "string") return false;
  const match = value.trim().match(/^(\d+(?:\.\d+)?)(?:px|mm|cm|in|pt)?$/i);
  return Boolean(match && Number(match[1]) > 0);
}

/**
 * Build a self-contained SVG cut line using the same canonical geometry as
 * createCutShapeMask(). Width and height control display size; the viewBox and
 * production coordinates remain 590 x 1180.
 */
export function createCutlineSvg(options = {}) {
  const {
    width = CUTLINE_WIDTH,
    height = CUTLINE_HEIGHT,
    stroke = "#ff00ff",
    strokeWidth = 1,
    mirror = false,
  } = options;

  if (!isPositiveSvgLength(width)) {
    throw new RangeError("Cut-line SVG width must be positive.");
  }
  if (!isPositiveSvgLength(height)) {
    throw new RangeError("Cut-line SVG height must be positive.");
  }
  if (!Number.isFinite(Number(strokeWidth)) || Number(strokeWidth) <= 0) {
    throw new RangeError("Cut-line SVG strokeWidth must be positive.");
  }

  const attrs = [
    'xmlns="http://www.w3.org/2000/svg"',
    `width="${escapeXmlAttribute(width)}"`,
    `height="${escapeXmlAttribute(height)}"`,
    `viewBox="0 0 ${CUTLINE_WIDTH} ${CUTLINE_HEIGHT}"`,
    'fill="none"',
    `stroke="${escapeXmlAttribute(stroke)}"`,
    `stroke-width="${escapeXmlAttribute(strokeWidth)}"`,
    'stroke-linejoin="round"',
    'vector-effect="non-scaling-stroke"',
  ].join(" ");

  return [
    `<svg ${attrs}>`,
    '  <title>CutContour</title>',
    `  <g id="CutContour" data-spot-color="CutContour"${mirror ? ` transform="translate(${CUTLINE_WIDTH} 0) scale(-1 1)"` : ""}>`,
    `    <path d="${CUTLINE_OUTER_PATH}"/>`,
    '    <circle cx="42" cy="42" r="18"/>',
    '    <rect x="160" y="24" width="272" height="36" rx="18"/>',
    '    <circle cx="550" cy="42" r="18"/>',
    "  </g>",
    "</svg>",
  ].join("\n");
}

function resolveContext(target) {
  if (target && typeof target.getContext === "function") {
    return target.getContext("2d");
  }
  return target;
}

function requireContextMethods(context) {
  const required = [
    "beginPath",
    "moveTo",
    "lineTo",
    "closePath",
    "arc",
    "stroke",
  ];
  if (!context || required.some((method) => typeof context[method] !== "function")) {
    throw new TypeError("drawCutlineCanvas requires a CanvasRenderingContext2D.");
  }
}

function traceCircle(context, cx, cy, r) {
  context.moveTo(cx + r, cy);
  context.arc(cx, cy, r, 0, Math.PI * 2);
  context.closePath();
}

function traceCapsule(context) {
  context.moveTo(178, 24);
  context.lineTo(414, 24);
  context.arc(414, 42, 18, -Math.PI / 2, Math.PI / 2);
  context.lineTo(178, 60);
  context.arc(178, 42, 18, Math.PI / 2, (Math.PI * 3) / 2);
  context.closePath();
}

/**
 * Draw the production cut line on a 2D canvas context (or a canvas element).
 * Returns the resolved context for convenient composition.
 */
export function drawCutlineCanvas(target, options = {}) {
  const context = resolveContext(target);
  requireContextMethods(context);

  const {
    stroke = "#ff00ff",
    lineWidth = 1,
    lineJoin = "round",
    lineCap = "round",
    mirror = false,
  } = options;

  if (!Number.isFinite(Number(lineWidth)) || Number(lineWidth) <= 0) {
    throw new RangeError("Cut-line canvas lineWidth must be positive.");
  }

  if (typeof context.save === "function") context.save();
  if (mirror) {
    const width = context.canvas?.width ?? CUTLINE_WIDTH;
    context.translate(width, 0);
    context.scale(-1, 1);
  }
  context.strokeStyle = stroke;
  context.lineWidth = Number(lineWidth);
  context.lineJoin = lineJoin;
  context.lineCap = lineCap;

  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(590, 0);
  context.lineTo(590, 96);
  context.lineTo(574, 112);
  context.lineTo(574, 691);
  context.lineTo(590, 707);
  context.lineTo(590, 1165);
  context.lineTo(575, 1180);
  context.lineTo(0, 1180);
  context.closePath();
  traceCircle(context, 42, 42, 18);
  traceCapsule(context);
  traceCircle(context, 550, 42, 18);
  context.stroke();

  if (typeof context.restore === "function") context.restore();
  return context;
}
