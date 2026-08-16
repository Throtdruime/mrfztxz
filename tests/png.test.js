import assert from "node:assert/strict";
import test from "node:test";

import {
  canvasToPngBlob,
  downloadBlob,
  downloadCanvasPng,
  parsePngPhys,
  setPngDpi,
} from "../js/production/png.js";

const PNG_SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);

function crc32(bytes) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1
        ? (0xedb88320 ^ (crc >>> 1))
        : (crc >>> 1);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint32(bytes, offset, value) {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function readUint32(bytes, offset) {
  return (
    (bytes[offset] * 0x1000000)
    + (bytes[offset + 1] << 16)
    + (bytes[offset + 2] << 8)
    + bytes[offset + 3]
  ) >>> 0;
}

function makeChunk(type, data = new Uint8Array()) {
  const chunk = new Uint8Array(data.byteLength + 12);
  writeUint32(chunk, 0, data.byteLength);
  for (let index = 0; index < type.length; index += 1) {
    chunk[index + 4] = type.charCodeAt(index);
  }
  chunk.set(data, 8);
  writeUint32(chunk, chunk.byteLength - 4, crc32(chunk.subarray(4, -4)));
  return chunk;
}

function makePhysChunk(x, y = x, unit = 1) {
  const data = new Uint8Array(9);
  writeUint32(data, 0, x);
  writeUint32(data, 4, y);
  data[8] = unit;
  return makeChunk("pHYs", data);
}

function concat(...parts) {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function makePng(...extraChunks) {
  const ihdrData = new Uint8Array(13);
  writeUint32(ihdrData, 0, 1);
  writeUint32(ihdrData, 4, 1);
  ihdrData[8] = 8;
  ihdrData[9] = 6;

  return concat(
    PNG_SIGNATURE,
    makeChunk("IHDR", ihdrData),
    ...extraChunks,
    makeChunk("IDAT", Uint8Array.of(0)),
    makeChunk("IEND"),
  );
}

function listChunks(bytes) {
  const chunks = [];
  let offset = PNG_SIGNATURE.byteLength;

  while (offset < bytes.byteLength) {
    const length = readUint32(bytes, offset);
    const endOffset = offset + length + 12;
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    chunks.push({
      bytes: bytes.subarray(offset, endOffset),
      crc: readUint32(bytes, endOffset - 4),
      data: bytes.subarray(offset + 8, endOffset - 4),
      type,
    });
    offset = endOffset;
  }

  return chunks;
}

test("canvasToPngBlob requests PNG encoding", async () => {
  const expected = new Blob([makePng()], { type: "image/png" });
  let requestedType;
  const canvas = {
    toBlob(callback, type) {
      requestedType = type;
      callback(expected);
    },
  };

  assert.equal(await canvasToPngBlob(canvas), expected);
  assert.equal(requestedType, "image/png");
});

test("canvasToPngBlob rejects a null encoder result", async () => {
  await assert.rejects(
    canvasToPngBlob({ toBlob: (callback) => callback(null) }),
    /could not be encoded/i,
  );
});

test("setPngDpi adds a valid 300 DPI pHYs chunk after IHDR", async () => {
  const output = await setPngDpi(new Blob([makePng()], { type: "image/png" }));
  const bytes = new Uint8Array(await output.arrayBuffer());
  const chunks = listChunks(bytes);
  const metadata = parsePngPhys(bytes);

  assert.equal(output.type, "image/png");
  assert.deepEqual(chunks.map(({ type }) => type), ["IHDR", "pHYs", "IDAT", "IEND"]);
  assert.deepEqual(metadata, {
    pixelsPerMeterX: 11811,
    pixelsPerMeterY: 11811,
    unitSpecifier: 1,
    dpiX: 299.9994,
    dpiY: 299.9994,
    count: 1,
  });

  const phys = chunks[1];
  assert.equal(phys.crc, crc32(phys.bytes.subarray(4, -4)));
});

test("setPngDpi removes every old pHYs chunk and preserves other chunks", async () => {
  const text = makeChunk("tEXt", Uint8Array.of(65, 0, 66));
  const input = makePng(makePhysChunk(72), text, makePhysChunk(6000, 7000, 0));
  const output = await setPngDpi(new Blob([input]), 600);
  const bytes = new Uint8Array(await output.arrayBuffer());
  const chunks = listChunks(bytes);
  const metadata = parsePngPhys(bytes);

  assert.deepEqual(chunks.map(({ type }) => type), ["IHDR", "pHYs", "tEXt", "IDAT", "IEND"]);
  assert.equal(metadata?.count, 1);
  assert.equal(metadata?.pixelsPerMeterX, 23622);
  assert.deepEqual(chunks.find(({ type }) => type === "tEXt")?.bytes, text);
});

test("parsePngPhys returns null when metadata is absent", () => {
  assert.equal(parsePngPhys(makePng()), null);
});

test("setPngDpi validates DPI and PNG input", async () => {
  await assert.rejects(setPngDpi(new Blob([makePng()]), 0), /greater than zero/i);
  await assert.rejects(setPngDpi(new Blob([Uint8Array.of(1, 2, 3)])), /too short|signature/i);
});

test("downloadBlob clicks a temporary anchor and safely revokes its URL", async () => {
  const originalDocument = globalThis.document;
  const originalUrl = globalThis.URL;
  const events = [];
  const anchor = {
    style: {},
    click() {
      events.push("click");
    },
    remove() {
      events.push("remove");
    },
  };

  globalThis.document = {
    body: {
      appendChild(node) {
        assert.equal(node, anchor);
        events.push("append");
      },
    },
    createElement(tag) {
      assert.equal(tag, "a");
      return anchor;
    },
  };
  globalThis.URL = {
    createObjectURL(blob) {
      assert.ok(blob instanceof Blob);
      events.push("create");
      return "blob:test";
    },
    revokeObjectURL(url) {
      assert.equal(url, "blob:test");
      events.push("revoke");
    },
  };

  try {
    downloadBlob(new Blob(["png"]), "print.png");
    assert.equal(anchor.href, "blob:test");
    assert.equal(anchor.download, "print.png");
    assert.deepEqual(events, ["create", "append", "click", "remove"]);
    await new Promise(resolve => setTimeout(resolve, 1100));
    assert.deepEqual(events, ["create", "append", "click", "remove", "revoke"]);
  } finally {
    globalThis.document = originalDocument;
    globalThis.URL = originalUrl;
  }
});

test("downloadCanvasPng downloads and returns the DPI-tagged Blob", async () => {
  const originalDocument = globalThis.document;
  const originalUrl = globalThis.URL;
  let clicked = false;
  const source = new Blob([makePng()], { type: "image/png" });

  globalThis.document = {
    body: { appendChild() {} },
    createElement() {
      return {
        style: {},
        click() {
          clicked = true;
        },
        remove() {},
      };
    },
  };
  globalThis.URL = {
    createObjectURL: () => "blob:canvas",
    revokeObjectURL() {},
  };

  try {
    const output = await downloadCanvasPng(
      { toBlob: (callback) => callback(source) },
      "canvas.png",
      150,
    );
    const metadata = parsePngPhys(new Uint8Array(await output.arrayBuffer()));
    assert.equal(clicked, true);
    assert.equal(metadata?.pixelsPerMeterX, 5906);
  } finally {
    globalThis.document = originalDocument;
    globalThis.URL = originalUrl;
  }
});
