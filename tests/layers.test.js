import test from "node:test";
import assert from "node:assert/strict";

import {findAllLayersById, findLayerById} from "../js/layers.js";

test("findLayerById searches nested layer trees depth first", () => {
  const nested = {id: "target", type: "image"};
  const template = {
    layers: [
      {id: "first"},
      {id: "group", type: "group", children: [{id: "inner"}, nested]},
    ],
  };

  assert.equal(findLayerById(template, "target"), nested);
  assert.equal(findLayerById(template.layers, "missing"), null);
});

test("findAllLayersById returns duplicate ids in stable traversal order", () => {
  const first = {id: "shared"};
  const second = {id: "shared"};
  const third = {id: "shared"};
  const layers = [
    first,
    {id: "group", children: [second, {id: "deeper", children: [third]}]},
  ];

  assert.deepEqual(findAllLayersById(layers, "shared"), [first, second, third]);
  assert.deepEqual(findAllLayersById(null, "shared"), []);
});

test("layer traversal safely ignores cyclic child references", () => {
  const group = {id: "group", children: []};
  group.children.push(group);

  assert.equal(findLayerById([group], "group"), group);
  assert.deepEqual(findAllLayersById([group], "missing"), []);
});
