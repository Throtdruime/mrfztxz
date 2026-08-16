import "./js/console/main.js";
import "./js/editor.js";
import "./js/export.js";
import {scheduleRender} from "./js/render.js";
import "./js/update.js";

document.getElementById("lianXi").addEventListener("click", () => {
  window.alert("- 作者 QQ 3412735994 -\n- 交流群 1056969651 -");
});

document.getElementById("github").addEventListener("click", () => {
  window.open("https://github.com/epYuriX/mrfztxz", "_blank", "noopener,noreferrer");
});

scheduleRender();
