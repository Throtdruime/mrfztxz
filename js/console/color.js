import {back, template} from "../../assets/template.js";
import {findLayerById} from "../layers.js";
import {scheduleRender} from "../render.js";

function getLayer(documentModel, id) {
  return findLayerById(documentModel.layers, id);
}

function bindVisibilityRadios(name, getVisible, setVisible) {
  const radios = [...document.querySelectorAll(`input[name='${name}']`)];
  for (const radio of radios) {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      setVisible(radio.value === "t");
      scheduleRender();
    });
  }
  return () => {
    const selected = getVisible() ? "t" : "f";
    for (const radio of radios) radio.checked = radio.value === selected;
  };
}

const gradientLayer = getLayer(template, "jian_bian");
const frontPanel = getLayer(template, "dang_ban");
const backPanel = getLayer(back, "dang_ban");
const backShadow = getLayer(back, "tu_pian_back");

const syncGradientVisibility = bindVisibilityRadios(
  "jianBianVisible",
  () => gradientLayer.visible,
  visible => {
    gradientLayer.visible = visible;
  },
);

const syncPanelVisibility = bindVisibilityRadios(
  "dangBanVisible",
  () => frontPanel.visible,
  visible => {
    frontPanel.visible = visible;
    backPanel.visible = visible;
  },
);

const gradientColor = document.getElementById("jian_bian");
gradientColor.addEventListener("input", event => {
  gradientLayer.color = event.target.value;
  scheduleRender();
});

const panelColor = document.getElementById("dang_ban");
panelColor.addEventListener("input", event => {
  frontPanel.color = event.target.value;
  backPanel.color = event.target.value;
  scheduleRender();
});

const shadowColor = document.getElementById("bei_ying");
shadowColor.addEventListener("input", event => {
  backShadow.color = event.target.value;
  scheduleRender();
});

export function syncColorControls() {
  gradientColor.value = gradientLayer.color;
  panelColor.value = frontPanel.color;
  shadowColor.value = backShadow.color;
  syncGradientVisibility();
  syncPanelVisibility();
}

syncColorControls();
