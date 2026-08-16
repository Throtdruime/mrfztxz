import assert from "node:assert/strict";
import test from "node:test";

import {back, template} from "../assets/template.js";
import {findLayerById} from "../js/layers.js";

test("front, back, white ink and cutline share one production coordinate system", () => {
  assert.deepEqual(
    {width: template.width, height: template.height, ppi: template.ppi},
    {width: 590, height: 1180, ppi: 300},
  );
  assert.equal(back.width, template.width);
  assert.equal(back.height, template.height);
  assert.equal(back.ppi, template.ppi);

  const cutline = findLayerById(template.layers, "cutting_line");
  assert.equal(cutline.role, "cutline");
  assert.equal(cutline.src, "assets/layers/front/cutline.svg");
});
