import {template as frontTemplate} from "../../assets/template.js";
import {findLayerById} from "../layers.js";
import {
  runtimeImageMap,
  runtimeImageMeta,
  runtimeLayerState,
} from "../state.js";
import {fontList} from "./fontList.js";

const imagePromises = new Map();
const tintedImageCache = new Map();
const fontPromises = new Map();

function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function getImage(src) {
  if (!src) return Promise.reject(new Error("图片地址为空"));
  if (!imagePromises.has(src)) {
    const promise = new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`图片加载失败：${src}`));
      image.src = src;
    }).catch(error => {
      imagePromises.delete(src);
      throw error;
    });
    imagePromises.set(src, promise);
  }
  return imagePromises.get(src);
}

export function invalidateImageCache(src) {
  if (!src) return;
  imagePromises.delete(src);
  for (const key of tintedImageCache.keys()) {
    if (key.startsWith(`${src}\n`)) tintedImageCache.delete(key);
  }
}

async function loadFont(family, style) {
  const fontInfo = fontList[family];
  const fontPath = fontInfo?.[style];
  if (!fontPath) throw new Error(`字体缺失：${family} ${style}`);

  const fontKey = `${family}-${style}`;
  if (!fontPromises.has(fontKey)) {
    const promise = (async () => {
      const font = new FontFace(fontKey, `url(${fontPath})`);
      await font.load();
      document.fonts.add(font);
      return fontKey;
    })().catch(error => {
      fontPromises.delete(fontKey);
      throw error;
    });
    fontPromises.set(fontKey, promise);
  }
  return fontPromises.get(fontKey);
}

function shouldSkipLayer(layer, options) {
  if (!layer?.visible) return true;
  if (options.excludeLayerIds.has(layer.id)) return true;
  return Boolean(layer.role && options.excludeRoles.has(layer.role));
}

function warn(options, message, error) {
  options.onWarning?.(message, error);
  console.warn(message, error ?? "");
}

async function renderLayers(layers, context, options, parentOpacity = 1) {
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index];
    if (shouldSkipLayer(layer, options)) continue;
    const opacity = parentOpacity * ((layer.opacity ?? 100) / 100);

    if (layer.type === "group") {
      await renderLayers(layer.children ?? [], context, options, opacity);
      continue;
    }
    if (layer.type === "text") continue;

    try {
      if (layer.type === "image") {
        if (layer.id === "tu_pian") await drawEditableImage(layer, context, opacity);
        else await drawImage(layer, context, opacity);
      } else if (layer.type === "image_back") {
        await drawImageBack(layer, context, opacity);
      } else if (layer.type === "color") {
        drawColor(layer, context, opacity);
      }
    } catch (error) {
      warn(options, `图层“${layer.name ?? layer.id}”渲染失败，已跳过。`, error);
    }
  }

  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index];
    if (shouldSkipLayer(layer, options) || layer.type !== "text") continue;
    const opacity = parentOpacity * ((layer.opacity ?? 100) / 100);
    try {
      await drawText(layer, context, opacity, options);
    } catch (error) {
      warn(options, `文字“${layer.name ?? layer.id}”渲染失败，已使用后备字体。`, error);
      drawTextWithFont(layer, context, opacity, options, "sans-serif");
    }
  }
}

async function drawText(layer, context, opacity, options) {
  if (typeof layer.text !== "string") return;
  const fontKey = await loadFont(layer.font.family, layer.font.style);
  drawTextWithFont(layer, context, opacity, options, fontKey);
}

function drawTextWithFont(layer, context, opacity, options, fontKey) {
  const fontSize = convertFontSize(layer.font.size, options.ppi) || 20;
  const horizontalScale = (layer.font.hScale || 100) / 100;
  const tracking = ((layer.font.tracking || 0) / 1000) * fontSize;
  const followedLayer = layer.layout.follow
    ? findLayerById(options.document.layers, layer.layout.follow.target)
    : null;

  let x = layer.layout.left ?? 0;
  let y = layer.layout.top ?? 0;
  if (followedLayer?.renderInfo) {
    x = followedLayer.renderInfo.x + followedLayer.renderInfo.width
      + (layer.layout.follow.offsetX || 0);
    y = followedLayer.renderInfo.y + followedLayer.renderInfo.height - fontSize;
  }

  context.save();
  context.font = `${fontSize}px "${fontKey}"`;
  context.translate(x, y);
  context.rotate(degToRad(layer.layout.rotate || 0));
  context.scale(horizontalScale, 1);
  if (layer.layout.flip === "horizontal") {
    context.translate(0, fontSize);
    context.scale(1, -1);
  }
  context.fillStyle = layer.font.color || "#ffffff";
  context.textBaseline = "top";
  context.globalAlpha = opacity;

  let offsetX = 0;
  for (const character of layer.text) {
    context.fillText(character, offsetX, 0);
    offsetX += context.measureText(character).width + tracking;
  }
  context.restore();

  layer.renderInfo = {
    x,
    y,
    width: offsetX * horizontalScale,
    height: fontSize,
  };
}

async function drawImage(layer, context, opacity) {
  const source = runtimeImageMap[layer.src] || layer.src;
  const image = await getImage(source);
  const x = layer.layout?.left ?? 0;
  const y = layer.layout?.top ?? 0;
  const width = layer.width ?? image.naturalWidth;
  const height = layer.height ?? image.naturalHeight;

  context.save();
  context.globalAlpha = opacity;
  context.drawImage(image, x, y, width, height);
  context.restore();
  layer.renderInfo = {x, y, width, height};
}

async function drawEditableImage(layer, context, opacity) {
  const state = runtimeLayerState[layer.id] || {};
  const source = runtimeImageMap[layer.src] || layer.src;
  const image = await getImage(source);
  const scale = state.scale ?? 1;
  const x = state.x ?? layer.layout?.left ?? 0;
  const y = state.y ?? layer.layout?.top ?? 0;
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;

  runtimeImageMeta[layer.id] = {
    width: image.naturalWidth,
    height: image.naturalHeight,
  };
  context.save();
  context.globalAlpha = opacity;
  context.drawImage(image, x, y, width, height);
  context.restore();
  layer.renderInfo = {x, y, width, height};
}

async function getTintedMirror(source, color) {
  const cacheKey = `${source}\n${color}`;
  if (tintedImageCache.has(cacheKey)) {
    const cached = tintedImageCache.get(cacheKey);
    tintedImageCache.delete(cacheKey);
    tintedImageCache.set(cacheKey, cached);
    return cached;
  }
  const image = await getImage(source);
  const canvas = createCanvas(image.naturalWidth, image.naturalHeight);
  const context = canvas.getContext("2d");
  context.translate(canvas.width, 0);
  context.scale(-1, 1);
  context.drawImage(image, 0, 0);
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalCompositeOperation = "source-in";
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  tintedImageCache.set(cacheKey, canvas);
  while (tintedImageCache.size > 6) {
    tintedImageCache.delete(tintedImageCache.keys().next().value);
  }
  return canvas;
}

async function drawImageBack(layer, context, opacity) {
  const front = findLayerById(frontTemplate.layers, layer.follow ?? "tu_pian");
  if (!front) return;

  const source = runtimeImageMap[layer.src] || layer.src;
  const image = await getImage(source);
  const state = runtimeLayerState[front.id] || {};
  const scale = state.scale ?? 1;
  const frontX = state.x ?? front.layout?.left ?? 0;
  const frontY = state.y ?? front.layout?.top ?? 0;
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  const x = context.canvas.width - frontX - width;
  const y = frontY;
  const tintedMirror = await getTintedMirror(source, layer.color ?? "#000000");

  context.save();
  context.globalAlpha = opacity;
  context.drawImage(tintedMirror, x, y, width, height);
  context.restore();
  layer.renderInfo = {x, y, width, height};
}

function drawColor(layer, context, opacity) {
  const left = layer.layout?.left ?? 0;
  const top = layer.layout?.top ?? 0;
  context.save();
  context.globalAlpha = opacity;

  if (layer.gradient?.direction === "rb-to-lt") {
    const gradient = context.createLinearGradient(
      left + layer.width,
      top + layer.height,
      left,
      top,
    );
    const fromAlpha = layer.gradient.fromAlpha ?? 0.8;
    const middle = layer.gradient.toAlphaAt ?? 0.5;
    gradient.addColorStop(0, hexToRgba(layer.color, fromAlpha));
    gradient.addColorStop(middle, hexToRgba(layer.color, 0));
    gradient.addColorStop(1, hexToRgba(layer.color, 0));
    context.fillStyle = gradient;
  } else {
    context.fillStyle = layer.color || "#000000";
  }
  context.fillRect(left, top, layer.width, layer.height);
  context.restore();
  layer.renderInfo = {x: left, y: top, width: layer.width, height: layer.height};
}

function convertFontSize(points, ppi = 300) {
  return (points * ppi) / 72;
}

function degToRad(degrees) {
  return (degrees * Math.PI) / 180;
}

function hexToRgba(hex, alpha = 1) {
  const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#000000";
  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export async function renderTemplateToCanvas(documentModel, canvas, options = {}) {
  if (!documentModel || !canvas) throw new Error("缺少模板或目标画布");
  if (canvas.width !== documentModel.width) canvas.width = documentModel.width;
  if (canvas.height !== documentModel.height) canvas.height = documentModel.height;

  const context = canvas.getContext("2d", {willReadFrequently: false});
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const normalizedOptions = {
    ...options,
    document: documentModel,
    ppi: documentModel.ppi ?? 300,
    excludeLayerIds: new Set(options.excludeLayerIds ?? []),
    excludeRoles: new Set(options.excludeRoles ?? []),
  };
  await renderLayers(documentModel.layers, context, normalizedOptions);
  return canvas;
}

export function readTemplate(documentModel, target, options = {}) {
  const canvas = typeof target === "string"
    ? document.getElementById(target === "ctx01" ? "canvas01" : "canvas02")
    : target?.canvas ?? target;
  return renderTemplateToCanvas(documentModel, canvas, options);
}
