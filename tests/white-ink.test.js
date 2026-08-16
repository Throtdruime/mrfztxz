import assert from "node:assert/strict";
import test from "node:test";

import {
  createWhiteInkImageData,
  createWhiteInkMask,
  spreadWhiteInkMask,
} from "../js/production/white-ink.js";

function rgbaFromAlpha(width, height, alpha) {
  const data = new Uint8ClampedArray(width * height * 4);
  alpha.forEach((value, pixel) => {
    data[pixel * 4] = 20;
    data[pixel * 4 + 1] = 40;
    data[pixel * 4 + 2] = 60;
    data[pixel * 4 + 3] = value;
  });
  return {width, height, data};
}

test("auto white ink thresholds source alpha while retaining grayscale coverage", () => {
  const source = rgbaFromAlpha(3, 1, [0, 127, 200]);
  const result = createWhiteInkImageData(source, {
    mode: "auto",
    threshold: 128,
    cutMask: new Uint8ClampedArray([255, 255, 255]),
  });

  assert.deepEqual(Array.from(result.data), [
    255, 255, 255, 0,
    255, 255, 255, 0,
    255, 255, 255, 200,
  ]);
});

test("positive and negative spread use grayscale max/min morphology", () => {
  const peak = new Uint8ClampedArray([
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0,
    0, 0, 123, 0, 0,
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0,
  ]);
  const dilated = spreadWhiteInkMask(peak, 5, 5, 1);
  assert.deepEqual(
    Array.from(dilated.slice(6, 9)),
    [123, 123, 123],
    "max filter expands the gray value by one pixel",
  );
  assert.equal(dilated[12], 123);
  assert.equal(dilated[0], 0);

  const pit = new Uint8ClampedArray(25).fill(210);
  pit[12] = 30;
  const eroded = spreadWhiteInkMask(pit, 5, 5, -1);
  assert.deepEqual(
    Array.from(eroded.slice(6, 9)),
    [30, 30, 30],
    "min filter contracts coverage by one pixel",
  );
  assert.equal(eroded[0], 0, "erosion treats pixels beyond the canvas as transparent");
});

test("full mode is clipped by the cut mask after spreading", () => {
  const source = rgbaFromAlpha(3, 1, [0, 0, 0]);
  const mask = createWhiteInkMask(source, {
    mode: "full",
    spreadPixels: 2,
    cutMask: new Uint8ClampedArray([255, 128, 0]),
  });

  assert.deepEqual(Array.from(mask), [255, 128, 0]);
});

test("the default production cut mask removes ink from die holes", () => {
  const source = rgbaFromAlpha(
    590,
    1180,
    new Uint8ClampedArray(590 * 1180).fill(255),
  );
  const mask = createWhiteInkMask(source, {mode: "full"});

  assert.equal(mask[42 * 590 + 42], 0);
  assert.equal(mask[42 * 590 + 300], 0);
  assert.equal(mask[500 * 590 + 100], 255);
  assert.equal(mask[500 * 590 + 580], 0);
});

test("negative spread chokes full white away from holes and die edges", () => {
  const source = rgbaFromAlpha(
    590,
    1180,
    new Uint8ClampedArray(590 * 1180).fill(255),
  );
  const mask = createWhiteInkMask(source, {
    mode: "full",
    spreadPixels: -1,
  });

  assert.equal(mask[42 * 590 + 60], 0, "white retracts from a punched hole");
  assert.equal(mask[42 * 590 + 61], 255);
  assert.equal(mask[500 * 590 + 573], 0, "white retracts from the recessed die edge");
  assert.equal(mask[500 * 590 + 572], 255);
});
