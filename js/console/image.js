import {template} from "../../assets/template.js";
import {findLayerById} from "../layers.js";
import {invalidateImageCache} from "../parser/main.js";
import {scheduleRender} from "../render.js";
import {
  editorState,
  replaceRuntimeImage,
  runtimeImageMeta,
  runtimeLayerState,
  setImageScaleAround,
} from "../state.js";

const ARTWORK_SOURCE = "assets/layers/tuPian.png";
const MAX_FILE_BYTES = 30 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 16_000_000;
const MAX_IMAGE_DIMENSION = 4096;

const imageLayer = findLayerById(template.layers, "tu_pian");
const professionGroup = findLayerById(template.layers, "group_profession_logo");
const factionGroup = findLayerById(template.layers, "faction");
const logoLayer = findLayerById(template.layers, "mrfz_logo");
const imageUpload = document.getElementById("imageUpload");
const imageUploadName = document.getElementById("imageUploadName");
const imageScale = document.getElementById("imageScale");
const imageScaleValue = document.getElementById("imageScaleValue");

function selectedChildId(group) {
  if (!group.visible) return "null";
  return group.children.find(child => child.visible)?.id ?? "null";
}

function populateSelect(select, group) {
  if (select.options.length) return;
  for (const item of group.children) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    select.appendChild(option);
  }
}

function bindLayerSelect(selectId, group) {
  const select = document.getElementById(selectId);
  populateSelect(select, group);
  select.addEventListener("change", () => {
    group.visible = select.value !== "null";
    for (const child of group.children) child.visible = child.id === select.value;
    scheduleRender();
  });
  return () => {
    select.value = selectedChildId(group);
  };
}

function bindBooleanRadios(name, getValue, setValue) {
  const radios = [...document.querySelectorAll(`input[name='${name}']`)];
  for (const radio of radios) {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      setValue(radio.value === "t");
      scheduleRender();
    });
  }
  return () => {
    const value = getValue() ? "t" : "f";
    for (const radio of radios) radio.checked = radio.value === value;
  };
}

const syncProfession = bindLayerSelect("seProfession", professionGroup);
const syncFaction = bindLayerSelect("seFaction", factionGroup);
const syncLogo = bindBooleanRadios(
  "logoVisible",
  () => logoLayer.visible,
  visible => {
    logoLayer.visible = visible;
  },
);
const syncCutline = bindBooleanRadios(
  "cutVisible",
  () => editorState.showCutline,
  visible => {
    editorState.showCutline = visible;
  },
);

function updateScaleControl() {
  const percent = Math.round((runtimeLayerState.tu_pian.scale ?? 1) * 100);
  imageScale.value = String(Math.min(500, Math.max(5, percent)));
  imageScaleValue.textContent = `${percent}%`;
}

async function decodeUploadedImage(file) {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("浏览器无法读取这张图片"));
      element.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

async function prepareUploadedImage(file) {
  if (!file.type.startsWith("image/")) throw new Error("请选择 PNG、JPEG 或 WebP 图片");
  if (file.size > MAX_FILE_BYTES) throw new Error("图片不能超过 30 MB");

  const decoded = await decodeUploadedImage(file);
  const originalWidth = decoded.width;
  const originalHeight = decoded.height;
  const downsampleScale = Math.min(
    1,
    MAX_IMAGE_DIMENSION / Math.max(originalWidth, originalHeight),
    Math.sqrt(MAX_IMAGE_PIXELS / (originalWidth * originalHeight)),
  );

  if (downsampleScale === 1) {
    decoded.close();
    return {
      blob: file,
      width: originalWidth,
      height: originalHeight,
      resized: false,
    };
  }

  const width = Math.max(1, Math.round(originalWidth * downsampleScale));
  const height = Math.max(1, Math.round(originalHeight * downsampleScale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(decoded.source, 0, 0, width, height);
  decoded.close();
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(result => result ? resolve(result) : reject(new Error("图片压缩失败")), "image/png");
  });
  return {blob, width, height, resized: true};
}

imageUpload.addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  imageUpload.disabled = true;
  imageUploadName.textContent = "正在读取图片…";
  try {
    const prepared = await prepareUploadedImage(file);
    const url = URL.createObjectURL(prepared.blob);
    const previousUrl = replaceRuntimeImage(ARTWORK_SOURCE, url, {
      width: prepared.width,
      height: prepared.height,
    });
    invalidateImageCache(previousUrl);

    const fitScale = Math.min(
      template.width / prepared.width,
      template.height / prepared.height,
    );
    runtimeLayerState.tu_pian.scale = fitScale;
    runtimeLayerState.tu_pian.x = (template.width - prepared.width * fitScale) / 2;
    runtimeLayerState.tu_pian.y = (template.height - prepared.height * fitScale) / 2;
    imageUploadName.textContent = `${file.name}${prepared.resized ? " · 已优化大图" : ""}`;
    updateScaleControl();
    scheduleRender();
  } catch (error) {
    imageUploadName.textContent = error.message;
    imageUpload.value = "";
  } finally {
    imageUpload.disabled = false;
  }
});

imageScale.addEventListener("input", () => {
  const newScale = Number(imageScale.value) / 100;
  const currentInfo = imageLayer.renderInfo;
  const center = currentInfo
    ? {x: currentInfo.x + currentInfo.width / 2, y: currentInfo.y + currentInfo.height / 2}
    : {x: template.width / 2, y: template.height / 2};
  setImageScaleAround("tu_pian", center, newScale, currentInfo, 0.05, 5);
  updateScaleControl();
  scheduleRender();
});

document.getElementById("resetImageTransform").addEventListener("click", () => {
  const metadata = runtimeImageMeta.tu_pian;
  const scale = Math.min(template.width / metadata.width, template.height / metadata.height);
  runtimeLayerState.tu_pian.scale = scale;
  runtimeLayerState.tu_pian.x = (template.width - metadata.width * scale) / 2;
  runtimeLayerState.tu_pian.y = (template.height - metadata.height * scale) / 2;
  updateScaleControl();
  scheduleRender();
});

window.addEventListener("project:image-transform", updateScaleControl);

export function syncImageControls() {
  syncProfession();
  syncFaction();
  syncLogo();
  syncCutline();
  updateScaleControl();
  imageUpload.value = "";
  imageUploadName.textContent = "点击选择透明角色图";
}

syncImageControls();
