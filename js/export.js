import {template} from "../assets/template.js";
import {createCutlineSvg} from "./production/cutline.js";
import {downloadBlob, downloadCanvasPng} from "./production/png.js";
import {ensureRendered} from "./render.js";

const exportStatus = document.getElementById("exportStatus");
const exportButtons = [...document.querySelectorAll("[data-export]")];

function safeBaseName() {
  const raw = document.getElementById("name1").value.trim() || "arknights-pass";
  return raw
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "arknights-pass";
}

function setBusy(busy, message) {
  for (const button of exportButtons) button.disabled = busy;
  exportStatus.textContent = message;
  exportStatus.dataset.state = busy ? "working" : "ready";
}

function bindExport(buttonId, label, action, successDetail = "300 PPI") {
  document.getElementById(buttonId).addEventListener("click", async () => {
    setBusy(true, `正在准备${label}…`);
    try {
      const output = await ensureRendered();
      await action(output, safeBaseName());
      setBusy(false, `${label}已导出 · ${successDetail}`);
    } catch (error) {
      console.error(`${label}导出失败`, error);
      setBusy(false, `${label}导出失败，请重试`);
      exportStatus.dataset.state = "error";
    }
  });
}

bindExport("exportPNG1", "正面彩色图", (output, name) =>
  downloadCanvasPng(output.front, `${name}-front-color.png`, template.ppi));

bindExport("exportPNG2", "背面彩色图", (output, name) =>
  downloadCanvasPng(output.back, `${name}-back-color.png`, template.ppi));

bindExport("exportWhiteFront", "正面白墨图", (output, name) =>
  downloadCanvasPng(output.whiteFront, `${name}-front-white.png`, template.ppi));

bindExport("exportWhiteBack", "背面白墨图", (output, name) =>
  downloadCanvasPng(output.whiteBack, `${name}-back-white.png`, template.ppi));

bindExport("exportCutPngFront", "正面刀线参考图", (output, name) =>
  downloadCanvasPng(output.cutline, `${name}-front-cutline-reference.png`, template.ppi));

bindExport("exportCutPngBack", "背面刀线参考图", (output, name) =>
  downloadCanvasPng(output.mirroredCutline, `${name}-back-cutline-reference.png`, template.ppi));

function createPhysicalCutlineSvg(mirror = false) {
  const widthMillimeters = (template.width / template.ppi) * 25.4;
  const heightMillimeters = (template.height / template.ppi) * 25.4;
  return createCutlineSvg({
    width: `${widthMillimeters.toFixed(3)}mm`,
    height: `${heightMillimeters.toFixed(3)}mm`,
    stroke: "#ff00ff",
    strokeWidth: 1,
    mirror,
  });
}

bindExport("exportCutSvgFront", "正面矢量刀线", async (_output, name) => {
  const svg = createPhysicalCutlineSvg(false);
  downloadBlob(new Blob([svg], {type: "image/svg+xml;charset=utf-8"}), `${name}-front-cutline.svg`);
}, "49.95 × 99.91 mm");

bindExport("exportCutSvgBack", "背面矢量刀线", async (_output, name) => {
  const svg = createPhysicalCutlineSvg(true);
  downloadBlob(new Blob([svg], {type: "image/svg+xml;charset=utf-8"}), `${name}-back-cutline.svg`);
}, "49.95 × 99.91 mm");
