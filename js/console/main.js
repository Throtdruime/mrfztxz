import {syncColorControls} from "./color.js";
import {syncImageControls} from "./image.js";
import {syncProductionControls} from "./production.js";
import {syncTextControls} from "./text.js";

export function syncControls() {
  syncTextControls();
  syncColorControls();
  syncImageControls();
  syncProductionControls();
}
