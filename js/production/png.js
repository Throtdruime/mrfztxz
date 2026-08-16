const PNG_SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
const PHYS_TYPE = Uint8Array.of(112, 72, 89, 115);
const METRES_PER_INCH = 0.0254;
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function toBytes(value) {
  if (value instanceof Uint8Array) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new TypeError("Expected an ArrayBuffer or a typed array containing PNG data.");
}

function readUint32(bytes, offset) {
  return ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
}

function writeUint32(bytes, offset, value) {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunkType(bytes, offset) {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3],);
}

function readPngChunks(value) {
  const bytes = toBytes(value);

  if (bytes.byteLength < PNG_SIGNATURE.byteLength) throw new TypeError("The value is too short to be a PNG image.");
  for (let index = 0; index < PNG_SIGNATURE.byteLength; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) throw new TypeError("The value does not contain a valid PNG signature.");
  }

  const chunks = [];
  let offset = PNG_SIGNATURE.byteLength;
  while (offset < bytes.byteLength) {
    if (bytes.byteLength - offset < 12) {
      throw new TypeError("The PNG contains a truncated chunk header.");
    }
    const length = readUint32(bytes, offset);
    const dataOffset = offset + 8;
    const crcOffset = dataOffset + length;
    const endOffset = crcOffset + 4;
    if (!Number.isSafeInteger(endOffset) || endOffset > bytes.byteLength) throw new TypeError("The PNG contains a truncated chunk.");
    chunks.push({
      crcOffset, dataOffset, endOffset, length, offset, type: chunkType(bytes, offset + 4),
    });
    offset = endOffset;
  }
  if (chunks.length === 0 || chunks[0].type !== "IHDR" || chunks[0].length !== 13) throw new TypeError("The PNG must start with a 13-byte IHDR chunk.");
  if (chunks.at(-1)?.type !== "IEND") throw new TypeError("The PNG must end with an IEND chunk.");
  return {bytes, chunks};
}

function createPhysChunk(pixelsPerMetre) {
  const chunk = new Uint8Array(21);
  writeUint32(chunk, 0, 9);
  chunk.set(PHYS_TYPE, 4);
  writeUint32(chunk, 8, pixelsPerMetre);
  writeUint32(chunk, 12, pixelsPerMetre);
  chunk[16] = 1;
  writeUint32(chunk, 17, crc32(chunk.subarray(4, 17)));
  return chunk;
}

export function canvasToPngBlob(canvas) {
  if (canvas == null || typeof canvas.toBlob !== "function") return Promise.reject(new TypeError("The canvas must provide a toBlob() method."));
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob == null) {
          reject(new Error("The canvas could not be encoded as PNG."));
          return;
        }
        resolve(blob);
      }, "image/png");
    } catch (error) {
      reject(error);
    }
  });
}

export function parsePngPhys(value) {
  const {bytes, chunks} = readPngChunks(value);
  const physChunks = chunks.filter((chunk) => chunk.type === "pHYs");
  if (physChunks.length === 0) return null;
  const first = physChunks[0];
  if (first.length !== 9) throw new TypeError("A PNG pHYs chunk must contain exactly 9 data bytes.");
  const pixelsPerMeterX = readUint32(bytes, first.dataOffset);
  const pixelsPerMeterY = readUint32(bytes, first.dataOffset + 4);
  const unitSpecifier = bytes[first.dataOffset + 8];
  return {
    pixelsPerMeterX,
    pixelsPerMeterY,
    unitSpecifier,
    dpiX: unitSpecifier === 1 ? pixelsPerMeterX * METRES_PER_INCH : null,
    dpiY: unitSpecifier === 1 ? pixelsPerMeterY * METRES_PER_INCH : null,
    count: physChunks.length,
  };
}

export async function setPngDpi(blob, dpi = 300) {
  if (blob == null || typeof blob.arrayBuffer !== "function") throw new TypeError("Expected a Blob containing PNG data.");
  if (typeof dpi !== "number" || !Number.isFinite(dpi) || dpi <= 0) throw new RangeError("DPI must be a finite number greater than zero.");
  const pixelsPerMetre = Math.round(dpi / METRES_PER_INCH);
  if (pixelsPerMetre < 1 || pixelsPerMetre > 0xffffffff) throw new RangeError("DPI is outside the range supported by PNG pHYs metadata.");
  const {bytes, chunks} = readPngChunks(await blob.arrayBuffer());
  const physChunk = createPhysChunk(pixelsPerMetre);
  const keptChunks = chunks.filter((chunk) => chunk.type !== "pHYs");
  const outputLength = PNG_SIGNATURE.byteLength + physChunk.byteLength + keptChunks.reduce((total, chunk) => total + (chunk.endOffset - chunk.offset), 0);
  const output = new Uint8Array(outputLength);
  let outputOffset = 0;
  output.set(PNG_SIGNATURE, outputOffset);
  outputOffset += PNG_SIGNATURE.byteLength;
  for (const chunk of keptChunks) {
    const chunkBytes = bytes.subarray(chunk.offset, chunk.endOffset);
    output.set(chunkBytes, outputOffset);
    outputOffset += chunkBytes.byteLength;
    if (chunk.type === "IHDR") {
      output.set(physChunk, outputOffset);
      outputOffset += physChunk.byteLength;
    }
  }
  return new Blob([output], {type: "image/png"});
}

export function downloadBlob(blob, filename) {
  if (typeof document === "undefined" || document.body == null) throw new Error("Blob downloads require a browser document with a body.");
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function" || typeof URL.revokeObjectURL !== "function") throw new Error("Blob downloads require URL.createObjectURL().");
  if (typeof filename !== "string" || filename.trim() === "") throw new TypeError("A non-empty download filename is required.");
  const urlApi = URL;
  const objectUrl = urlApi.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    if (typeof anchor.remove === "function") {
      anchor.remove();
    } else if (anchor.parentNode != null) {
      anchor.parentNode.removeChild(anchor);
    }
    globalThis.setTimeout(() => urlApi.revokeObjectURL(objectUrl), 1000);
  }
}

export async function downloadCanvasPng(canvas, filename, dpi = 300) {
  const source = await canvasToPngBlob(canvas);
  const output = await setPngDpi(source, dpi);
  downloadBlob(output, filename);
  return output;
}
