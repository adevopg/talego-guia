import { inflateSync, deflateSync, crc32 as nodeCrc32 } from "node:zlib";

/**
 * Just enough PNG to take the colour key out of the game's icons.
 *
 * The item pictures come out of the paks as 180×128 RGB with **no alpha**: the
 * transparency is a magenta key, the way a game from 1999 did it. Something has
 * to read those pixels, decide which are background and write them back with an
 * alpha channel, and nothing in Node does that out of the box.
 *
 * A library would. `sharp` is a native build, and `pngjs` is another dependency
 * in a tree that currently has none that matter — for one 8-bit decode and one
 * 8-bit encode, both of which are twenty lines over the zlib that Node already
 * ships, that trade is not worth making.
 *
 * Only what the game's files actually are is supported: 8 bits per channel,
 * non-interlaced, colour types 2 (RGB), 6 (RGBA), 3 (palette) and 0 (grey).
 */

/** Node gained `zlib.crc32` in 22.15; this keeps the script working without it. */
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc(buffer) {
  if (typeof nodeCrc32 === "function") return nodeCrc32(buffer) >>> 0;
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    c = crcTable[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

const MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Reads a PNG into straight RGBA.
 *
 * Returns `{ width, height, pixels }` where `pixels` is `width * height * 4`
 * bytes. A file without an alpha channel comes back fully opaque.
 */
export function decode(buffer) {
  if (!buffer.subarray(0, 8).equals(MAGIC)) throw new Error("no es un PNG");

  let at = 8;
  let width = 0, height = 0, depth = 0, colour = 0, interlace = 0;
  let palette = null, transparency = null;
  const parts = [];

  while (at + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(at);
    const kind = buffer.toString("latin1", at + 4, at + 8);
    const body = buffer.subarray(at + 8, at + 8 + length);
    at += 12 + length;

    if (kind === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      colour = body[9];
      interlace = body[12];
    } else if (kind === "PLTE") palette = body;
    else if (kind === "tRNS") transparency = body;
    else if (kind === "IDAT") parts.push(body);
    else if (kind === "IEND") break;
  }

  if (depth !== 8) throw new Error(`profundidad ${depth} no soportada`);
  if (interlace !== 0) throw new Error("PNG entrelazado no soportado");

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colour];
  if (!channels) throw new Error(`tipo de color ${colour} no soportado`);

  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * channels;
  const lines = Buffer.alloc(height * stride);

  // Undo the per-line filters. Each line names its own, and three of the five
  // refer back to the line above, which is why this cannot be done per line in
  // isolation.
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = lines.subarray(y * stride, (y + 1) * stride);
    raw.copy(line, 0, pos, pos + stride);
    pos += stride;
    const above = y > 0 ? lines.subarray((y - 1) * stride, y * stride) : null;

    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = above ? above[i] : 0;
      const c = above && i >= channels ? above[i - channels] : 0;
      switch (filter) {
        case 1: line[i] = (line[i] + a) & 0xff; break;
        case 2: line[i] = (line[i] + b) & 0xff; break;
        case 3: line[i] = (line[i] + ((a + b) >> 1)) & 0xff; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          const pick = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          line[i] = (line[i] + pick) & 0xff;
          break;
        }
        default: break; // 0, no filter
      }
    }
  }

  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0, n = width * height; i < n; i++) {
    const from = i * channels;
    const to = i * 4;
    if (colour === 3) {
      const index = lines[from];
      pixels[to] = palette[index * 3];
      pixels[to + 1] = palette[index * 3 + 1];
      pixels[to + 2] = palette[index * 3 + 2];
      pixels[to + 3] = transparency && index < transparency.length
        ? transparency[index] : 255;
    } else if (colour === 0 || colour === 4) {
      const grey = lines[from];
      pixels[to] = pixels[to + 1] = pixels[to + 2] = grey;
      pixels[to + 3] = colour === 4 ? lines[from + 1] : 255;
    } else {
      pixels[to] = lines[from];
      pixels[to + 1] = lines[from + 1];
      pixels[to + 2] = lines[from + 2];
      pixels[to + 3] = colour === 6 ? lines[from + 3] : 255;
    }
  }

  return { width, height, pixels };
}

function chunk(kind, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(kind, 4, "latin1");
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, tail]);
}

/**
 * Writes straight RGBA back out as a PNG.
 *
 * Every line is written with filter 0. This file exists only to hand something
 * to `cwebp`, which re-encodes it anyway, so a smarter filter would cost
 * compression time for bytes that are deleted a moment later.
 */
export function encode({ width, height, pixels }) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;   // bit depth
  header[9] = 6;   // RGBA
  header[10] = 0;  // deflate
  header[11] = 0;  // adaptive filtering
  header[12] = 0;  // no interlace

  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    MAGIC,
    chunk("IHDR", header),
    // Level 1: this file is read back by cwebp and deleted a second later, so
    // compressing it well is work thrown away.
    chunk("IDAT", deflateSync(raw, { level: 1 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Takes the magenta key out of one of the game's item pictures.
 *
 * **Every key pixel goes, wherever it is — not only the ones touching a
 * border.** The first version of this flood-filled from the edges, on the
 * reasoning that an item is allowed to be pink and only magenta connected to
 * the border can safely be called background. The files say otherwise: a ring
 * has its hole in `255, 0, 255`, a chain 5 568 pixels of it between the links,
 * a crossbow the gap inside the bow. Filling from the edges never reaches any
 * of those, and they came out as pink blobs in the middle of the art.
 *
 * Magenta is the key precisely so that nothing is painted in it, so matching it
 * by colour is what the format means.
 *
 * The key is not one value. It is `255, 0, 255` where the art survived intact
 * and `252, 2, 252` where the pak's BC compression moved it, so "key-like" is a
 * band rather than an equality. For the same reason the pixels where the key
 * bled into the art — a one-pixel magenta halo around every outline — are taken
 * off too: at 180×128 shown at 32 pixels a pixel of erosion cannot be seen, and
 * a pink rim very much can.
 *
 * Returns the number of pixels cleared, or 0 when the picture has no key, in
 * which case it is left exactly as it was.
 */
export function keyOut(image) {
  const { width, height, pixels } = image;
  const count = width * height;

  const isKey = (i) =>
    pixels[i] >= 180 && pixels[i + 2] >= 180 && pixels[i + 1] <= 90;

  // The halo: still clearly magenta-dominant, but blended with the art.
  const isHalo = (i) => {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    return r >= 120 && b >= 120 && r - g >= 55 && b - g >= 55;
  };

  const marked = new Uint8Array(count);
  let keyed = 0;
  for (let at = 0; at < count; at++) {
    if (isKey(at * 4)) { marked[at] = 1; keyed++; }
  }

  // Whether the picture uses a key at all is decided by how much of it is the
  // key, so that a picture which simply has a magenta pixel somewhere is not
  // treated as keyed. A few files genuinely have no key — three sketches on
  // white, some cards on black — and those are handed on untouched.
  if (keyed < count * 0.015) return 0;

  // One pass of growth into the halo, so the outlines do not keep a pink rim.
  const grown = new Uint8Array(marked);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = y * width + x;
      if (marked[at] || !isHalo(at * 4)) continue;
      const touching =
        (x > 0 && marked[at - 1]) ||
        (x < width - 1 && marked[at + 1]) ||
        (y > 0 && marked[at - width]) ||
        (y < height - 1 && marked[at + width]);
      if (touching) grown[at] = 1;
    }
  }

  let cleared = 0;
  for (let at = 0; at < count; at++) {
    if (!grown[at]) continue;
    // The colour is zeroed as well as the alpha. A transparent pixel that keeps
    // its magenta still bleeds into the edges when a browser scales the picture
    // down, which is exactly what these are for.
    pixels[at * 4] = 0;
    pixels[at * 4 + 1] = 0;
    pixels[at * 4 + 2] = 0;
    pixels[at * 4 + 3] = 0;
    cleared++;
  }
  return cleared;
}
