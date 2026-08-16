import {back, template} from "../../assets/template.js";
import {findLayerById} from "../layers.js";
import {scheduleRender} from "../render.js";

const fieldDefinitions = [
  {inputId: "left_title", targets: [[template, "left_title"], [back, "left_title"]]},
  {inputId: "xz4", targets: [[template, "RHODES ISLAND INC."]]},
  {inputId: "name1", targets: [[template, "name1"]]},
  {inputId: "arknights1", targets: [[template, "ARKNIGHTS - LT40"]]},
  {inputId: "staff", targets: [[template, "staff"]]},
  {inputId: "xz1", targets: [[template, "operator_of_rhodes_island"]]},
  {inputId: "xz2", targets: [[template, "profession"]]},
  {inputId: "xz3", targets: [[template, "@ARKNIGHTS"]]},
  {inputId: "xzb1", targets: [[back, "operator_of_rhodes_island"]]},
  {inputId: "xzb2", targets: [[back, "profession"]]},
  {inputId: "xzb3", targets: [[back, "©HYPERGRYPH"]]},
  {inputId: "xzb4", targets: [[back, "RHODES ISLAND INC."]]},
];

function layerFor(documentModel, id) {
  return findLayerById(documentModel.layers, id);
}

for (const definition of fieldDefinitions) {
  const input = document.getElementById(definition.inputId);
  input.addEventListener("input", () => {
    for (const [documentModel, layerId] of definition.targets) {
      const layer = layerFor(documentModel, layerId);
      if (layer) layer.text = input.value;
    }
    scheduleRender();
  });
}

export function syncTextControls() {
  for (const definition of fieldDefinitions) {
    const input = document.getElementById(definition.inputId);
    const [documentModel, layerId] = definition.targets[0];
    input.value = layerFor(documentModel, layerId)?.text ?? "";
  }
}

syncTextControls();
