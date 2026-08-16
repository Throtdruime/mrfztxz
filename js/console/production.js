import {template} from "../../assets/template.js";
import {scheduleRender} from "../render.js";
import {editorState} from "../state.js";

const whiteInkMode = document.getElementById("whiteInkMode");
const whiteInkThreshold = document.getElementById("whiteInkThreshold");
const whiteInkThresholdValue = document.getElementById("whiteInkThresholdValue");
const whiteInkSpread = document.getElementById("whiteInkSpread");
const whiteInkSpreadValue = document.getElementById("whiteInkSpreadValue");
const modeDescription = document.getElementById("whiteInkModeDescription");

function formatSigned(value, suffix) {
  const number = Number(value);
  return `${number > 0 ? "+" : ""}${number}${suffix}`;
}

function syncReadouts() {
  whiteInkThresholdValue.textContent = whiteInkThreshold.value;
  const millimeters = Number(whiteInkSpread.value);
  const pixels = Math.round(millimeters * (template.ppi ?? 300) / 25.4);
  whiteInkSpreadValue.textContent = `${formatSigned(millimeters.toFixed(2), " mm")} · ${formatSigned(pixels, " px")}`;
  modeDescription.textContent = whiteInkMode.value === "full"
    ? "按完整刀模铺白，并自动扣除三个孔位。"
    : "按最终彩色图的透明度生成白墨托底。";
}

for (const control of [whiteInkMode, whiteInkThreshold, whiteInkSpread]) {
  control.addEventListener("input", () => {
    editorState.whiteInkMode = whiteInkMode.value;
    editorState.whiteInkThreshold = Number(whiteInkThreshold.value);
    editorState.whiteInkSpreadMm = Number(whiteInkSpread.value);
    syncReadouts();
    scheduleRender();
  });
}

const previewTabs = [...document.querySelectorAll("[data-preview-mode]")];
const previewPanels = [...document.querySelectorAll("[data-preview-panel]")];
for (const tab of previewTabs) {
  tab.addEventListener("click", () => {
    const mode = tab.dataset.previewMode;
    for (const item of previewTabs) {
      const active = item === tab;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-selected", active ? "true" : "false");
      item.tabIndex = active ? 0 : -1;
    }
    for (const panel of previewPanels) panel.hidden = panel.dataset.previewPanel !== mode;
  });
}

export function syncProductionControls() {
  whiteInkMode.value = editorState.whiteInkMode;
  whiteInkThreshold.value = String(editorState.whiteInkThreshold);
  whiteInkSpread.value = String(editorState.whiteInkSpreadMm);
  syncReadouts();
}

syncProductionControls();
