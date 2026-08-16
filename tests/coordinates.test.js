import test from "node:test";
import assert from "node:assert/strict";

import {clientPointToCanvas, hitTest} from "../js/coordinates.js";

test("clientPointToCanvas accounts for canvas CSS scaling", () => {
  const canvas = {
    width: 590,
    height: 1180,
    getBoundingClientRect() {
      return {left: 10, top: 20, width: 295, height: 590};
    },
  };

  assert.deepEqual(clientPointToCanvas(canvas, 157.5, 315), {x: 295, y: 590});
});

test("clientPointToCanvas uses a neutral scale for a collapsed preview", () => {
  const canvas = {
    width: 590,
    height: 1180,
    getBoundingClientRect: () => ({left: 5, top: 7, width: 0, height: 0}),
  };

  assert.deepEqual(clientPointToCanvas(canvas, 8, 11), {x: 3, y: 4});
});

test("hitTest includes rectangle edges and rejects points outside", () => {
  const bounds = {x: 10, y: 20, width: 30, height: 40};

  assert.equal(hitTest({x: 10, y: 20}, bounds), true);
  assert.equal(hitTest({x: 40, y: 60}, bounds), true);
  assert.equal(hitTest({x: 40.01, y: 60}, bounds), false);
  assert.equal(hitTest({x: 20, y: 19.99}, bounds), false);
});

test("hitTest normalises negative dimensions and invalid data", () => {
  assert.equal(hitTest({x: 5, y: 5}, {x: 10, y: 10, width: -10, height: -10}), true);
  assert.equal(hitTest({x: Number.NaN, y: 5}, {x: 0, y: 0, width: 10, height: 10}), false);
  assert.equal(hitTest(null, {x: 0, y: 0, width: 10, height: 10}), false);
});
