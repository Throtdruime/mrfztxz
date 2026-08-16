import {syncControls} from "./console/main.js";
import {invalidateImageCache} from "./parser/main.js";
import {forceRender, scheduleRender} from "./render.js";
import {resetProjectState, runtimeImageMap} from "./state.js";

const refreshButton = document.getElementById("shuaXin");
const resetButton = document.getElementById("chongZhi");

refreshButton.addEventListener("click", async () => {
  refreshButton.disabled = true;
  try {
    await forceRender();
  } finally {
    refreshButton.disabled = false;
  }
});

resetButton.addEventListener("click", () => {
  if (!window.confirm("确定恢复默认内容、颜色和人物位置吗？")) return;
  const runtimeUrls = Object.values(runtimeImageMap);
  resetProjectState();
  for (const url of runtimeUrls) invalidateImageCache(url);
  syncControls();
  scheduleRender();
});
