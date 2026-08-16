import assert from "node:assert/strict";
import test from "node:test";

import {
  CUTLINE_OUTER_PATH,
  createCutShapeMask,
  createCutlineSvg,
  drawCutlineCanvas,
} from "../js/production/cutline.js";

const at = (mask, x, y, width = 590) => mask[y * width + x];

test("createCutShapeMask follows the outer die and removes all hanging holes", () => {
  const mask = createCutShapeMask();

  assert.equal(mask.length, 590 * 1180);
  assert.equal(at(mask, 10, 10), 255);
  assert.equal(at(mask, 42, 42), 0, "left circle is punched out");
  assert.equal(at(mask, 300, 42), 0, "capsule is punched out");
  assert.equal(at(mask, 550, 42), 0, "right circle is punched out");
  assert.equal(at(mask, 573, 500), 255);
  assert.equal(at(mask, 574, 500), 0, "vertical inset stops at x=574");
  assert.equal(at(mask, 580, 104), 255, "upper diagonal includes its inner side");
  assert.equal(at(mask, 585, 104), 0, "upper diagonal excludes its outer side");
  assert.equal(at(mask, 580, 1175), 0, "lower diagonal excludes its outer side");
});

test("createCutShapeMask mirrors the asymmetric back-side production die", () => {
  const mask = createCutShapeMask({mirror: true});

  assert.equal(at(mask, 15, 500), 0, "the recessed edge moves to the left");
  assert.equal(at(mask, 16, 500), 255);
  assert.equal(at(mask, 589, 500), 255);
  assert.equal(at(mask, 547, 42), 0, "the left hanging hole moves to the right");
});

test("createCutlineSvg serializes the canonical path and hole geometry", () => {
  const svg = createCutlineSvg({stroke: "CutContour", strokeWidth: 0.5});

  assert.match(svg, new RegExp(CUTLINE_OUTER_PATH.replaceAll(" ", "\\s")));
  assert.match(svg, /<circle cx="42" cy="42" r="18"\/>/);
  assert.match(
    svg,
    /<rect x="160" y="24" width="272" height="36" rx="18"\/>/,
  );
  assert.match(svg, /<circle cx="550" cy="42" r="18"\/>/);
  assert.match(svg, /stroke="CutContour"/);
  assert.match(svg, /stroke-width="0.5"/);
  assert.match(svg, /id="CutContour"/);

  const physical = createCutlineSvg({width: "49.953mm", height: "99.907mm"});
  assert.match(physical, /width="49.953mm"/);
  assert.match(physical, /height="99.907mm"/);

  const mirrored = createCutlineSvg({mirror: true});
  assert.match(mirrored, /transform="translate\(590 0\) scale\(-1 1\)"/);
});

test("drawCutlineCanvas traces and strokes the complete cut line", () => {
  const calls = [];
  const context = {
    save: () => calls.push(["save"]),
    restore: () => calls.push(["restore"]),
    beginPath: () => calls.push(["beginPath"]),
    moveTo: (...args) => calls.push(["moveTo", ...args]),
    lineTo: (...args) => calls.push(["lineTo", ...args]),
    closePath: () => calls.push(["closePath"]),
    arc: (...args) => calls.push(["arc", ...args]),
    stroke: () => calls.push(["stroke"]),
  };

  assert.equal(drawCutlineCanvas(context, {lineWidth: 2}), context);
  assert.deepEqual(calls[0], ["save"]);
  assert.ok(
    calls.some((call) =>
      call[0] === "lineTo" && call[1] === 574 && call[2] === 112
    ),
  );
  assert.equal(calls.filter(([name]) => name === "arc").length, 4);
  assert.equal(calls.filter(([name]) => name === "stroke").length, 1);
  assert.deepEqual(calls.at(-1), ["restore"]);
  assert.equal(context.lineWidth, 2);
});

test("drawCutlineCanvas can mirror the back-side preview", () => {
  const calls = [];
  const context = {
    canvas: {width: 590},
    save: () => calls.push(["save"]),
    restore: () => calls.push(["restore"]),
    translate: (...args) => calls.push(["translate", ...args]),
    scale: (...args) => calls.push(["scale", ...args]),
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    arc() {},
    stroke() {},
  };

  drawCutlineCanvas(context, {mirror: true});
  assert.deepEqual(calls.slice(0, 3), [
    ["save"],
    ["translate", 590, 0],
    ["scale", -1, 1],
  ]);
  assert.deepEqual(calls.at(-1), ["restore"]);
});
