import {back, template} from "../assets/template.js";

const DEFAULT_IMAGE_STATE = {
  tu_pian: {
    x: null,
    y: null,
    scale: 1,
  },
};

const DEFAULT_IMAGE_META = {
  tu_pian: {
    width: 590,
    height: 1180,
  },
};

const DEFAULT_EDITOR_STATE = {
  showCutline: true,
  whiteInkMode: "auto",
  whiteInkThreshold: 1,
  whiteInkSpreadMm: 0,
};

function deepClone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

// Capture pristine project data once. resetProjectState restores these copies
// instead of re-importing the module or reloading the whole page.
const initialTemplate = deepClone(template);
const initialBack = deepClone(back);

export const runtimeImageMap = {};
export const runtimeLayerState = deepClone(DEFAULT_IMAGE_STATE);
export const runtimeImageMeta = deepClone(DEFAULT_IMAGE_META);
export const editorState = deepClone(DEFAULT_EDITOR_STATE);

function isObject(value) {
  return value !== null && typeof value === "object";
}

/** Restore an object graph while retaining existing object/array references. */
function restoreInPlace(target, source) {
  if (Array.isArray(target) && Array.isArray(source)) {
    target.length = source.length;
    for (let index = 0; index < source.length; index += 1) {
      const sourceValue = source[index];
      const targetValue = target[index];
      const sameContainerKind =
          Array.isArray(sourceValue) === Array.isArray(targetValue) &&
          isObject(sourceValue) && isObject(targetValue);
      if (sameContainerKind) restoreInPlace(targetValue, sourceValue);
      else target[index] = deepClone(sourceValue);
    }
    return target;
  }

  for (const key of Object.keys(target)) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) delete target[key];
  }
  for (const [key, sourceValue] of Object.entries(source)) {
    const targetValue = target[key];
    const sameContainerKind =
        Array.isArray(sourceValue) === Array.isArray(targetValue) &&
        isObject(sourceValue) && isObject(targetValue);
    if (sameContainerKind) restoreInPlace(targetValue, sourceValue);
    else target[key] = deepClone(sourceValue);
  }
  return target;
}

function isBlobUrl(value) {
  return typeof value === "string" && value.startsWith("blob:");
}

function revokeBlobUrl(value) {
  if (!isBlobUrl(value) || typeof globalThis.URL?.revokeObjectURL !== "function") {
    return;
  }
  globalThis.URL.revokeObjectURL(value);
}

function updateImageMeta(metadata, height, layerId) {
  let nextMeta = metadata;
  let targetLayerId = layerId || "tu_pian";

  // A numeric third argument is shorthand for (width, height, layerId).
  if (Number.isFinite(metadata)) {
    nextMeta = {width: metadata, height};
  } else if (isObject(metadata) && typeof metadata.layerId === "string") {
    targetLayerId = metadata.layerId;
  }

  if (!isObject(nextMeta)) return;
  runtimeImageMeta[targetLayerId] ||= {};
  if (Number.isFinite(nextMeta.width) && nextMeta.width >= 0) {
    runtimeImageMeta[targetLayerId].width = nextMeta.width;
  }
  if (Number.isFinite(nextMeta.height) && nextMeta.height >= 0) {
    runtimeImageMeta[targetLayerId].height = nextMeta.height;
  }
}

/**
 * Replace a runtime image and release an obsolete blob URL.
 *
 * `metadata` may be `{width, height, layerId}` or a numeric width followed by
 * height and layer id. The previous URL is returned for cache invalidation.
 */
export function replaceRuntimeImage(
    originalSrc,
    newSrc,
    metadata,
    height,
    layerId = "tu_pian",
) {
  if (typeof originalSrc !== "string" || originalSrc.length === 0) {
    throw new TypeError("originalSrc must be a non-empty string");
  }

  const previousUrl = runtimeImageMap[originalSrc];
  if (previousUrl !== newSrc) revokeBlobUrl(previousUrl);

  if (newSrc === null || newSrc === undefined || newSrc === "") {
    delete runtimeImageMap[originalSrc];
  } else {
    runtimeImageMap[originalSrc] = newSrc;
  }
  updateImageMeta(metadata, height, layerId);
  return previousUrl;
}

/** Reset one editable image's transform without replacing its state object. */
export function resetImageTransform(layerId = "tu_pian") {
  runtimeLayerState[layerId] ||= {};
  restoreInPlace(runtimeLayerState[layerId], {x: null, y: null, scale: 1});
  return runtimeLayerState[layerId];
}

function scaleLimits(minimum, maximum) {
  if (isObject(minimum)) {
    maximum = minimum.maxScale;
    minimum = minimum.minScale;
  }
  let minScale = Number.isFinite(minimum) ? minimum : 0.05;
  let maxScale = Number.isFinite(maximum) ? maximum : 5;
  if (minScale > maxScale) [minScale, maxScale] = [maxScale, minScale];
  return {minScale, maxScale};
}

/**
 * Scale an image around a point in canvas coordinates.
 *
 * Canonical form:
 *   setImageScaleAround(layerId, point, scale, renderInfo, min?, max?)
 * The layer id may be omitted to target `tu_pian`.
 */
export function setImageScaleAround(
    layerIdOrPoint,
    pointOrScale,
    scaleOrRenderInfo,
    renderInfoOrMinimum,
    minimumOrMaximum,
    maybeMaximum,
) {
  const hasLayerId = typeof layerIdOrPoint === "string";
  const layerId = hasLayerId ? layerIdOrPoint : "tu_pian";
  const point = hasLayerId ? pointOrScale : layerIdOrPoint;
  const requestedScale = hasLayerId ? scaleOrRenderInfo : pointOrScale;
  const renderInfo = hasLayerId ? renderInfoOrMinimum : scaleOrRenderInfo;
  const minimum = hasLayerId ? minimumOrMaximum : renderInfoOrMinimum;
  const maximum = hasLayerId ? maybeMaximum : minimumOrMaximum;

  if (!Number.isFinite(requestedScale)) {
    throw new TypeError("scale must be a finite number");
  }

  const {minScale, maxScale} = scaleLimits(minimum, maximum);
  const newScale = Math.min(maxScale, Math.max(minScale, requestedScale));
  runtimeLayerState[layerId] ||= {x: null, y: null, scale: 1};
  const state = runtimeLayerState[layerId];
  const oldScale = Number.isFinite(state.scale) && state.scale !== 0
    ? state.scale
    : 1;

  if (Number.isFinite(point?.x) && Number.isFinite(point?.y)) {
    const originX = Number.isFinite(state.x)
      ? state.x
      : (Number.isFinite(renderInfo?.x) ? renderInfo.x : 0);
    const originY = Number.isFinite(state.y)
      ? state.y
      : (Number.isFinite(renderInfo?.y) ? renderInfo.y : 0);
    const ratio = newScale / oldScale;
    state.x = point.x - (point.x - originX) * ratio;
    state.y = point.y - (point.y - originY) * ratio;
  }
  state.scale = newScale;
  return state;
}

/** Restore templates and every exported runtime state object in place. */
export function resetProjectState() {
  const revoked = new Set();
  for (const value of Object.values(runtimeImageMap)) {
    if (isBlobUrl(value) && !revoked.has(value)) {
      revokeBlobUrl(value);
      revoked.add(value);
    }
  }

  restoreInPlace(template, initialTemplate);
  restoreInPlace(back, initialBack);
  restoreInPlace(runtimeImageMap, {});
  restoreInPlace(runtimeLayerState, DEFAULT_IMAGE_STATE);
  restoreInPlace(runtimeImageMeta, DEFAULT_IMAGE_META);
  restoreInPlace(editorState, DEFAULT_EDITOR_STATE);

  return {
    template,
    back,
    runtimeImageMap,
    runtimeLayerState,
    runtimeImageMeta,
    editorState,
  };
}
