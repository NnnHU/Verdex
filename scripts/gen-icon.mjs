/**
 * Verdex — generate the source app icon PNG (no external deps).
 *
 * Produces a 1024×1024 RGBA PNG with a blue→purple diagonal gradient and a
 * stylized "V" glyph in the center. This file is then fed to Tauri's
 * `icon` command, which generates the full icon set (ico/icns/png) that
 * tauri-build requires on every platform.
 *
 * Run: node scripts/gen-icon.mjs
 */
import zlib from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SIZE = 1024;

// ---- CRC32 (PNG chunks require it) ----
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// ---- Pixel canvas ----
const bytesPerPixel = 4; // RGBA
const stride = SIZE * bytesPerPixel;
// Each scanline is prefixed with a filter byte (0 = None).
const raw = Buffer.alloc((stride + 1) * SIZE);

// Helper: linear interpolate.
const lerp = (a, b, t) => a + (b - a) * t;

// "V" glyph as a filled polygon (two strokes forming a V), rasterized via a
// distance-to-segment test. Coordinates in a 0..1 normalized box.
// We draw a thick V from top-left & top-right down to a bottom point.
function insideV(nx, ny) {
  // Normalize so the V sits in the central region.
  const cx = 0.5;
  const topY = 0.26;
  const bottomY = 0.74;
  const halfWidth = 0.18; // half span of the V at the top
  const thickness = 0.085;

  // Left edge line: from (cx - halfWidth, topY) to (cx, bottomY)
  // Right edge line: from (cx + halfWidth, topY) to (cx, bottomY)
  const distToSeg = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const xx = ax + t * dx;
    const yy = ay + t * dy;
    return Math.hypot(px - xx, py - yy);
  };

  // Only consider points within the V's vertical band.
  if (ny < topY - thickness || ny > bottomY + thickness) return false;

  const dLeft = distToSeg(nx, ny, cx - halfWidth, topY, cx, bottomY);
  const dRight = distToSeg(nx, ny, cx + halfWidth, topY, cx, bottomY);
  return Math.min(dLeft, dRight) < thickness;
}

for (let y = 0; y < SIZE; y++) {
  const rowStart = y * (stride + 1);
  raw[rowStart] = 0; // filter: None
  for (let x = 0; x < SIZE; x++) {
    const i = rowStart + 1 + x * bytesPerPixel;
    const u = x / (SIZE - 1);
    const v = y / (SIZE - 1);

    // Rounded-rect mask (card look) with corner radius.
    const radius = 220;
    const dx = Math.max(radius - x, x - (SIZE - 1 - radius), 0);
    const dy = Math.max(radius - y, y - (SIZE - 1 - radius), 0);
    const inCorner = Math.hypot(dx, dy) > radius;

    // Background gradient: top-left blue (#3b82f6) → bottom-right purple (#9333ea).
    const t = (u + v) / 2;
    let r = Math.round(lerp(59, 147, t)); // 59 -> 147
    let g = Math.round(lerp(130, 51, t)); // 130 -> 51
    let b = Math.round(lerp(246, 234, t)); // 246 -> 234
    let a = 255;

    if (inCorner) {
      r = 2;
      g = 6;
      b = 23;
      a = 0; // transparent corners
    }

    // V glyph overlay: bright near-white.
    if (insideV(u, v)) {
      r = 255;
      g = 255;
      b = 255;
    }

    raw[i] = r;
    raw[i + 1] = g;
    raw[i + 2] = b;
    raw[i + 3] = a;
  }
}

// ---- Encode PNG ----
const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0); // width
ihdr.writeUInt32BE(SIZE, 4); // height
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type: RGBA
ihdr[10] = 0; // compression
ihdr[11] = 0; // filter
ihdr[12] = 0; // interlace

const idat = zlib.deflateSync(raw, { level: 9 });

const png = Buffer.concat([
  sig,
  chunk("IHDR", ihdr),
  chunk("IDAT", idat),
  chunk("IEND", Buffer.alloc(0)),
]);

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..");
const outPath = join(outDir, "app-icon.png");
mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, png);
console.log(`Wrote ${outPath} (${png.length} bytes, ${SIZE}×${SIZE})`);
