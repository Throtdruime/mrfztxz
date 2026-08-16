import {template} from "../assets/template.js";
import {clientPointToCanvas, hitTest} from "./coordinates.js";
import {findLayerById} from "./layers.js";
import {scheduleRender} from "./render.js";
import {runtimeLayerState, setImageScaleAround} from "./state.js";

const canvas = document.getElementById("canvas01");
const imageLayer = findLayerById(template.layers, "tu_pian");
let dragState = null;

function notifyTransformChanged() {
  window.dispatchEvent(new CustomEvent("project:image-transform"));
}

canvas.addEventListener("pointerdown", event => {
  if (event.button !== 0 || !imageLayer?.renderInfo) return;
  const point = clientPointToCanvas(canvas, event.clientX, event.clientY);
  if (!hitTest(point, imageLayer.renderInfo)) return;

  dragState = {
    pointerId: event.pointerId,
    offsetX: point.x - imageLayer.renderInfo.x,
    offsetY: point.y - imageLayer.renderInfo.y,
  };
  canvas.setPointerCapture(event.pointerId);
  canvas.classList.add("is-dragging");
  event.preventDefault();
});

canvas.addEventListener("pointermove", event => {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  const point = clientPointToCanvas(canvas, event.clientX, event.clientY);
  runtimeLayerState.tu_pian.x = point.x - dragState.offsetX;
  runtimeLayerState.tu_pian.y = point.y - dragState.offsetY;
  scheduleRender();
});

function stopDragging(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  dragState = null;
  canvas.classList.remove("is-dragging");
}

canvas.addEventListener("pointerup", stopDragging);
canvas.addEventListener("pointercancel", stopDragging);

canvas.addEventListener("wheel", event => {
  if (!imageLayer?.renderInfo) return;
  event.preventDefault();
  const point = clientPointToCanvas(canvas, event.clientX, event.clientY);
  const oldScale = runtimeLayerState.tu_pian.scale ?? 1;
  const factor = event.deltaY > 0 ? 0.94 : 1.06;
  setImageScaleAround(
    "tu_pian",
    point,
    oldScale * factor,
    imageLayer.renderInfo,
    0.05,
    5,
  );
  notifyTransformChanged();
  scheduleRender();
}, {passive: false});

canvas.addEventListener("keydown", event => {
  const state = runtimeLayerState.tu_pian;
  const movement = event.shiftKey ? 10 : 2;
  const deltas = {
    ArrowLeft: [-movement, 0],
    ArrowRight: [movement, 0],
    ArrowUp: [0, -movement],
    ArrowDown: [0, movement],
  };
  if (deltas[event.key]) {
    const [x, y] = deltas[event.key];
    state.x = (state.x ?? imageLayer.renderInfo?.x ?? 0) + x;
    state.y = (state.y ?? imageLayer.renderInfo?.y ?? 0) + y;
    event.preventDefault();
    scheduleRender();
    return;
  }

  if (["+", "=", "-", "_"].includes(event.key) && imageLayer?.renderInfo) {
    const center = {
      x: imageLayer.renderInfo.x + imageLayer.renderInfo.width / 2,
      y: imageLayer.renderInfo.y + imageLayer.renderInfo.height / 2,
    };
    const factor = ["+", "="].includes(event.key) ? 1.05 : 0.95;
    setImageScaleAround("tu_pian", center, (state.scale ?? 1) * factor, imageLayer.renderInfo, 0.05, 5);
    notifyTransformChanged();
    event.preventDefault();
    scheduleRender();
  }
});
