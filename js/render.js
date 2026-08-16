import {back, template} from "../assets/template.js";
import {createCutShapeMask, drawCutlineCanvas} from "./production/cutline.js";
import {createWhiteInkImageData} from "./production/white-ink.js";
import {renderTemplateToCanvas} from "./parser/main.js";
import {editorState} from "./state.js";

const visibleCanvases = {
  front: document.getElementById("canvas01"),
  back: document.getElementById("canvas02"),
  whiteFront: document.getElementById("canvasWhiteFront"),
  whiteBack: document.getElementById("canvasWhiteBack"),
  cutline: document.getElementById("canvasCutline"),
};
const renderStatus = document.getElementById("renderStatus");
const productionCutMasks = {
  front: createCutShapeMask(template.width, template.height),
  back: createCutShapeMask({width: template.width, height: template.height, mirror: true}),
};

let desiredRevision = 0;
let committedRevision = -1;
let failedRevision = -1;
let scheduledFrame = null;
let renderRunner = null;
let latestOutput = null;
let cachedCutlines = null;

function createCanvas(width = template.width, height = template.height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function getCutlineCanvases() {
  if (cachedCutlines) return cachedCutlines;
  const canonical = createCanvas(template.width, template.height);
  const mirrored = createCanvas(template.width, template.height);
  drawCutlineCanvas(canonical, {stroke: "#ff00ff"});
  drawCutlineCanvas(mirrored, {stroke: "#ff00ff", mirror: true});
  cachedCutlines = {canonical, mirrored};
  return cachedCutlines;
}

function setStatus(text, state = "idle") {
  if (!renderStatus) return;
  renderStatus.textContent = text;
  renderStatus.dataset.state = state;
  renderStatus.setAttribute("aria-busy", state === "working" ? "true" : "false");
}

function copyCanvas(source, target) {
  if (!source || !target) return;
  if (target.width !== source.width) target.width = source.width;
  if (target.height !== source.height) target.height = source.height;
  const context = target.getContext("2d");
  context.clearRect(0, 0, target.width, target.height);
  context.drawImage(source, 0, 0);
}

function putImageData(target, result) {
  if (target.width !== result.width) target.width = result.width;
  if (target.height !== result.height) target.height = result.height;
  const context = target.getContext("2d");
  context.clearRect(0, 0, target.width, target.height);
  context.putImageData(new ImageData(result.data, result.width, result.height), 0, 0);
}

function spreadMillimetersToPixels(value, ppi = template.ppi ?? 300) {
  return Math.round((Number(value) || 0) * ppi / 25.4);
}

function createWhiteInkCanvas(sourceCanvas, cutMask) {
  const context = sourceCanvas.getContext("2d", {willReadFrequently: true});
  const artwork = context.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const imageData = createWhiteInkImageData(artwork, {
    mode: editorState.whiteInkMode,
    threshold: editorState.whiteInkThreshold,
    spreadPixels: spreadMillimetersToPixels(editorState.whiteInkSpreadMm),
    cutMask,
  });
  const canvas = createCanvas(sourceCanvas.width, sourceCanvas.height);
  putImageData(canvas, imageData);
  return canvas;
}

async function buildOutput(revision) {
  const warnings = [];
  const onWarning = message => warnings.push(message);
  const front = createCanvas(template.width, template.height);
  const backCanvas = createCanvas(back.width, back.height);

  await Promise.all([
    renderTemplateToCanvas(template, front, {
      excludeRoles: ["cutline", "guide", "technical"],
      onWarning,
    }),
    renderTemplateToCanvas(back, backCanvas, {
      excludeRoles: ["cutline", "guide", "technical"],
      onWarning,
    }),
  ]);

  const {canonical: cutline, mirrored: mirroredCutline} = getCutlineCanvases();

  const whiteFront = createWhiteInkCanvas(front, productionCutMasks.front);
  const whiteBack = createWhiteInkCanvas(backCanvas, productionCutMasks.back);
  return {
    revision,
    warnings,
    front,
    back: backCanvas,
    whiteFront,
    whiteBack,
    cutline,
    mirroredCutline,
  };
}

function commitOutput(output) {
  copyCanvas(output.front, visibleCanvases.front);
  copyCanvas(output.back, visibleCanvases.back);

  if (editorState.showCutline) {
    visibleCanvases.front.getContext("2d").drawImage(output.cutline, 0, 0);
    visibleCanvases.back.getContext("2d").drawImage(output.mirroredCutline, 0, 0);
  }

  copyCanvas(output.whiteFront, visibleCanvases.whiteFront);
  copyCanvas(output.whiteBack, visibleCanvases.whiteBack);
  copyCanvas(output.cutline, visibleCanvases.cutline);
  latestOutput = output;
}

async function runRenderLoop() {
  while (committedRevision !== desiredRevision) {
    const revision = desiredRevision;
    setStatus("正在渲染…", "working");
    try {
      const output = await buildOutput(revision);
      if (revision !== desiredRevision) continue;
      commitOutput(output);
      committedRevision = revision;
      failedRevision = -1;
      setStatus(output.warnings.length ? "已同步 · 有资源缺失" : "已同步", output.warnings.length ? "warning" : "ready");
    } catch (error) {
      console.error("渲染失败", error);
      failedRevision = revision;
      setStatus("渲染失败，请重试", "error");
      break;
    }
  }
}

function startRenderRunner() {
  if (!renderRunner) {
    renderRunner = runRenderLoop().finally(() => {
      renderRunner = null;
      if (committedRevision !== desiredRevision && failedRevision !== desiredRevision) {
        startRenderRunner();
      }
    });
  }
  return renderRunner;
}

export function scheduleRender() {
  desiredRevision += 1;
  setStatus("等待更新…", "pending");
  if (scheduledFrame === null) {
    scheduledFrame = requestAnimationFrame(() => {
      scheduledFrame = null;
      startRenderRunner();
    });
  }
  return desiredRevision;
}

export async function ensureRendered() {
  if (scheduledFrame !== null) {
    cancelAnimationFrame(scheduledFrame);
    scheduledFrame = null;
  }
  await startRenderRunner();
  if (failedRevision === desiredRevision) {
    throw new Error("最新画面渲染失败");
  }
  if (committedRevision !== desiredRevision) return ensureRendered();
  return latestOutput;
}

export async function forceRender() {
  desiredRevision += 1;
  failedRevision = -1;
  setStatus("正在重新渲染…", "working");
  return ensureRendered();
}

export function getLatestOutput() {
  return latestOutput;
}

export const renderMetrics = {
  get desiredRevision() {
    return desiredRevision;
  },
  get committedRevision() {
    return committedRevision;
  },
};
