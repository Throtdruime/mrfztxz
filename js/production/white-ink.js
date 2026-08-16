import {createCutShapeMask} from "./cutline.js";

function normalizeSource(imageData) {
  if (!imageData || !Number.isInteger(imageData.width) || imageData.width <= 0)
    throw new TypeError("White-ink source must have a positive integer width.");
  if (!Number.isInteger(imageData.height) || imageData.height <= 0)
    throw new TypeError("White-ink source must have a positive integer height.");
  if (!imageData.data || typeof imageData.data.length !== "number")
    throw new TypeError("White-ink source must contain RGBA data.");
  const requiredLength = imageData.width * imageData.height * 4;
  if (imageData.data.length < requiredLength)
    throw new RangeError(
        `White-ink source needs ${requiredLength} RGBA values; received ${imageData.data.length}.`,
    );
  return imageData;
}

function normalizeOptions(options) {
  const normalized = options ?? {};
  const mode = normalized.mode ?? "auto";
  if (mode !== "auto" && mode !== "full")
    throw new RangeError('White-ink mode must be either "auto" or "full".');
  const threshold = Number(normalized.threshold ?? 1);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 255)
    throw new RangeError("White-ink threshold must be between 0 and 255.");
  const spreadPixels = Number(normalized.spreadPixels ?? 0);
  if (!Number.isFinite(spreadPixels))
    throw new TypeError("White-ink spreadPixels must be a finite number.");
  return {
    ...normalized,
    mode,
    threshold: Math.round(threshold),
    spreadPixels: Math.trunc(spreadPixels),
  };
}

function extractAlpha(source, mode, threshold) {
  const pixelCount = source.width * source.height;
  const alpha = new Uint8ClampedArray(pixelCount);
  if (mode === "full") {
    alpha.fill(255);
    return alpha;
  }
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const sourceAlpha = source.data[pixel * 4 + 3];
    alpha[pixel] = sourceAlpha >= threshold ? sourceAlpha : 0;
  }
  return alpha;
}

function horizontalExtrema(source, width, height, radius, findMaximum) {
  const output = new Uint8ClampedArray(source.length);
  const deque = new Int32Array(width);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;
    let head = 0;
    let tail = 0;
    let next = 0;
    for (let x = 0; x < width; x += 1) {
      const right = Math.min(width - 1, x + radius);
      while (next <= right) {
        const nextValue = source[rowOffset + next];
        while (tail > head) {
          const lastValue = source[rowOffset + deque[tail - 1]];
          const shouldRemove = findMaximum
              ? lastValue <= nextValue
              : lastValue >= nextValue;
          if (!shouldRemove) break;
          tail -= 1;
        }
        deque[tail] = next;
        tail += 1;
        next += 1;
      }
      const left = Math.max(0, x - radius);
      while (tail > head && deque[head] < left) head += 1;
      output[rowOffset + x] = source[rowOffset + deque[head]];
    }
  }
  return output;
}

function verticalExtrema(source, width, height, radius, findMaximum) {
  const output = new Uint8ClampedArray(source.length);
  const deque = new Int32Array(height);
  for (let x = 0; x < width; x += 1) {
    let head = 0;
    let tail = 0;
    let next = 0;
    for (let y = 0; y < height; y += 1) {
      const bottom = Math.min(height - 1, y + radius);
      while (next <= bottom) {
        const nextValue = source[next * width + x];
        while (tail > head) {
          const lastValue = source[deque[tail - 1] * width + x];
          const shouldRemove = findMaximum
              ? lastValue <= nextValue
              : lastValue >= nextValue;
          if (!shouldRemove) break;
          tail -= 1;
        }
        deque[tail] = next;
        tail += 1;
        next += 1;
      }
      const top = Math.max(0, y - radius);
      while (tail > head && deque[head] < top) head += 1;
      output[y * width + x] = source[deque[head] * width + x];
    }
  }

  return output;
}

export function spreadWhiteInkMask(mask, width, height, spreadPixels = 0) {
  if (!mask || mask.length !== width * height) {
    throw new RangeError("White-ink mask dimensions do not match its data.");
  }
  const spread = Math.trunc(Number(spreadPixels));
  if (!Number.isFinite(spread)) {
    throw new TypeError("White-ink spreadPixels must be a finite number.");
  }
  if (spread === 0) return new Uint8ClampedArray(mask);

  const radius = Math.abs(spread);
  const findMaximum = spread > 0;
  const horizontal = horizontalExtrema(
      mask,
      width,
      height,
      radius,
      findMaximum,
  );
  const output = verticalExtrema(
      horizontal,
      width,
      height,
      radius,
      findMaximum,
  );
  if (!findMaximum) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (x < radius || x >= width - radius || y < radius || y >= height - radius) {
          output[y * width + x] = 0;
        }
      }
    }
  }
  return output;
}

function normalizeCutMask(cutMask, width, height) {
  if (cutMask === undefined) return createCutShapeMask(width, height);

  const maskData = cutMask?.data ?? cutMask;
  if (!maskData || typeof maskData.length !== "number") {
    throw new TypeError("White-ink cutMask must contain alpha values.");
  }

  if (
      cutMask?.width !== undefined &&
      (cutMask.width !== width || cutMask.height !== height)
  ) {
    throw new RangeError("White-ink cutMask dimensions must match the source.");
  }

  const pixelCount = width * height;
  if (maskData.length === pixelCount) {
    return maskData;
  }
  if (maskData.length === pixelCount * 4) {
    const alpha = new Uint8ClampedArray(pixelCount);
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      alpha[pixel] = maskData[pixel * 4 + 3];
    }
    return alpha;
  }

  throw new RangeError("White-ink cutMask length must match the source size.");
}

function intersectMasks(alpha, cutMask) {
  const output = new Uint8ClampedArray(alpha.length);
  for (let pixel = 0; pixel < alpha.length; pixel += 1) {
    const cutAlpha = Math.max(0, Math.min(255, Number(cutMask[pixel]) || 0));
    output[pixel] = Math.round((alpha[pixel] * cutAlpha) / 255);
  }
  return output;
}

export function createWhiteInkMask(imageData, options = {}) {
  const source = normalizeSource(imageData);
  const normalized = normalizeOptions(options);
  const cutMask = normalizeCutMask(
      normalized.cutMask,
      source.width,
      source.height,
  );
  let initial = extractAlpha(source, normalized.mode, normalized.threshold);
  if (normalized.spreadPixels < 0) {
    initial = intersectMasks(initial, cutMask);
  }
  const spread = spreadWhiteInkMask(
      initial,
      source.width,
      source.height,
      normalized.spreadPixels,
  );
  return intersectMasks(spread, cutMask);
}

export function createWhiteInkImageData(imageData, options = {}) {
  const source = normalizeSource(imageData);
  const alpha = createWhiteInkMask(source, options);
  const output = new Uint8ClampedArray(source.width * source.height * 4);

  for (let pixel = 0; pixel < alpha.length; pixel += 1) {
    const offset = pixel * 4;
    output[offset] = 255;
    output[offset + 1] = 255;
    output[offset + 2] = 255;
    output[offset + 3] = alpha[pixel];
  }
  return {width: source.width, height: source.height, data: output};
}

export const createWhiteInk = createWhiteInkImageData;
