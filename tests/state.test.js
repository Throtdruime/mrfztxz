import assert from "node:assert/strict";
import test from "node:test";

import {template} from "../assets/template.js";
import {findLayerById} from "../js/layers.js";
import {
  editorState,
  replaceRuntimeImage,
  resetProjectState,
  runtimeImageMap,
  runtimeImageMeta,
  runtimeLayerState,
  setImageScaleAround,
} from "../js/state.js";

test("project reset restores data while retaining shared layer references", () => {
  const title = findLayerById(template.layers, "left_title");
  const originalText = title.text;
  title.text = "CHANGED";
  editorState.whiteInkMode = "full";
  runtimeLayerState.tu_pian.x = 123;
  replaceRuntimeImage("source.png", "data:image/png;base64,test", {width: 10, height: 20});

  resetProjectState();

  assert.equal(findLayerById(template.layers, "left_title"), title);
  assert.equal(title.text, originalText);
  assert.equal(editorState.whiteInkMode, "auto");
  assert.deepEqual(runtimeLayerState.tu_pian, {x: null, y: null, scale: 1});
  assert.deepEqual(runtimeImageMap, {});
  assert.deepEqual(runtimeImageMeta.tu_pian, {width: 590, height: 1180});
});

test("anchored scaling keeps the selected canvas point stationary", () => {
  runtimeLayerState.tu_pian.x = 10;
  runtimeLayerState.tu_pian.y = 20;
  runtimeLayerState.tu_pian.scale = 1;

  setImageScaleAround(
    "tu_pian",
    {x: 110, y: 220},
    2,
    {x: 10, y: 20, width: 590, height: 1180},
  );

  assert.deepEqual(runtimeLayerState.tu_pian, {x: -90, y: -180, scale: 2});

  setImageScaleAround(
    "tu_pian",
    {x: 110, y: 220},
    3,
    {x: 10, y: 20, width: 590, height: 1180},
  );
  assert.deepEqual(
    runtimeLayerState.tu_pian,
    {x: -190, y: -380, scale: 3},
    "rapid scaling uses the latest state rather than a stale rendered frame",
  );
  resetProjectState();
});
