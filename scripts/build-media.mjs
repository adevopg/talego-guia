#!/usr/bin/env node
// Turns the game's own pictures into what the web serves.
//
// The sources come out of the paks with `plpak extract --set --png --flat`,
// which is what `scripts/export.sh` runs. Nothing is re-encoded from a lossy
// source: the paks hold DDS/BC7 and PLPakKit decodes them with Metal, so the
// PNGs this reads are the first decode.
//
//   node scripts/build-media.mjs --icons <dir> --rooms <dir>
//
// Item icons go to WebP **lossless**, and the magenta is taken out of them on
// the way.
//
// They ship as 180×128 RGB with no alpha channel: the transparency is a colour
// key, `255, 0, 255`, the way a game from 1999 did it. Written straight to WebP
// they come out as pink rectangles. `keyOut` flood-fills that key from the
// borders — from the borders, so an item that is itself pink keeps its paint —
// and writes real alpha.
//
// Lossless because the result has a hard alpha edge and lossy WebP rings around
// those.
//
// Room views are photographs for all practical purposes, so they go to lossy
// WebP at two sizes: 1280 wide for the viewer and 426 for a thumbnail.
//
// A room ships as its **4:3** view. The `*_fullhd` files beside them are not a
// bigger version — they are the 2560×1440 widescreen reframing, a different
// crop. The 4:3 is the one whose 640×480 coordinate system the clickable boxes
// and the door patches are measured in, so it is the one the guide can draw on.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  readdirSync, existsSync, mkdirSync, statSync, rmSync, readFileSync,
  writeFileSync, unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, basename } from "node:path";
import { decode, encode, keyOut } from "./png.mjs";

const run = promisify(execFile);

const argv = process.argv.slice(2);
function flag(name, fallback) {
  const at = argv.indexOf(name);
  return at >= 0 && argv[at + 1] ? argv[at + 1] : fallback;
}
const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const iconsFrom = flag("--icons", null);
const roomsFrom = flag("--rooms", null);
const clean = argv.includes("--clean");
/// How many cwebp processes at once. One per core is the right number: cwebp is
/// single-threaded and the work is pure CPU.
const lanes = Number(flag("--lanes", String(process.availableParallelism?.() ?? 4)));

const iconsTo = resolve(root, "public/iconos");
const roomsTo = resolve(root, "public/salas");
const thumbsTo = resolve(root, "public/salas/mini");

async function have(tool) {
  try {
    await run(tool, ["-version"]);
    return true;
  } catch {
    return false;
  }
}

if (!(await have("cwebp"))) {
  console.error("hace falta cwebp — `brew install webp`");
  process.exit(1);
}

/// Runs a list of jobs with a fixed number in flight, so 3000 files do not
/// become 3000 processes.
async function pool(jobs, lanes, onDone) {
  let next = 0;
  let done = 0;
  const workers = Array.from({ length: Math.min(lanes, jobs.length) }, async () => {
    while (next < jobs.length) {
      const mine = jobs[next++];
      try {
        await mine();
      } catch (error) {
        console.warn(`  ! ${error.message.split("\n")[0]}`);
      }
      done++;
      if (onDone && done % 100 === 0) onDone(done, jobs.length);
    }
  });
  await Promise.all(workers);
}

function sizeOf(dir) {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    total += entry.isDirectory() ? sizeOf(path) : statSync(path).size;
  }
  return total;
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

// MARK: - Item icons

if (iconsFrom) {
  const from = resolve(iconsFrom);
  if (clean) rmSync(iconsTo, { recursive: true, force: true });
  mkdirSync(iconsTo, { recursive: true });

  const sources = readdirSync(from).filter((n) => n.toLowerCase().endsWith(".png"));
  console.log(`iconos · ${sources.length} ficheros`);

  let keyed = 0;
  let plain = 0;
  const scratch = join(tmpdir(), `talego-iconos-${process.pid}`);
  mkdirSync(scratch, { recursive: true });

  const jobs = sources.map((name) => async () => {
    const out = join(iconsTo, basename(name, ".png").toLowerCase() + ".webp");
    if (existsSync(out)) return;

    let source = join(from, name);
    let temporary = null;
    try {
      const image = decode(readFileSync(source));
      if (keyOut(image) > 0) {
        temporary = join(scratch, `${basename(name, ".png")}-${process.pid}.png`);
        writeFileSync(temporary, encode(image));
        source = temporary;
        keyed++;
      } else {
        plain++;
      }
    } catch {
      // A picture this cannot read is still worth shipping as it came: a
      // decoder that does not know one chunk should not cost the reader an
      // icon.
      plain++;
    }

    try {
      // -z 4, not 9. On these pictures 9 costs 482 ms against 7 ms and saves
      // forty bytes on a two-kilobyte file: a 67× slowdown for two per cent,
      // across 2576 files.
      await run("cwebp", ["-quiet", "-lossless", "-z", "4", source, "-o", out]);
    } finally {
      if (temporary) { try { unlinkSync(temporary); } catch {} }
    }
  });
  await pool(jobs, lanes, (done, all) => {
    process.stdout.write(`\r  ${done}/${all}`);
  });
  rmSync(scratch, { recursive: true, force: true });
  console.log(
    `\r  ${sources.length}/${sources.length}  →  ${mb(sizeOf(iconsTo))}`
    + `  ·  ${keyed} con el magenta quitado`
    + (plain ? `, ${plain} sin clave de color` : ""));
}

// MARK: - Room views

if (roomsFrom) {
  const from = resolve(roomsFrom);
  if (clean) {
    rmSync(roomsTo, { recursive: true, force: true });
  }
  mkdirSync(roomsTo, { recursive: true });
  mkdirSync(thumbsTo, { recursive: true });

  // Only the 4:3 views. The widescreen reframings are a different crop and the
  // guide's overlays are measured against the 4:3 one.
  const sources = readdirSync(from).filter(
    (n) => n.toLowerCase().endsWith(".png") && !n.toLowerCase().includes("_fullhd"),
  );
  console.log(`salas · ${sources.length} vistas`);

  const jobs = sources.flatMap((name) => {
    const stem = basename(name, ".png").toLowerCase();
    const source = join(from, name);
    return [
      async () => {
        const out = join(roomsTo, `${stem}.webp`);
        if (existsSync(out)) return;
        await run("cwebp", ["-quiet", "-q", "78", "-resize", "1280", "0", source, "-o", out]);
      },
      async () => {
        const out = join(thumbsTo, `${stem}.webp`);
        if (existsSync(out)) return;
        await run("cwebp", ["-quiet", "-q", "70", "-resize", "426", "0", source, "-o", out]);
      },
    ];
  });
  await pool(jobs, lanes, (done, all) => {
    process.stdout.write(`\r  ${done}/${all}`);
  });
  console.log(
    `\r  ${jobs.length}/${jobs.length}  →  ${mb(sizeOf(roomsTo))} (vistas y miniaturas)`,
  );
}

if (!iconsFrom && !roomsFrom) {
  console.log(`uso: node scripts/build-media.mjs --icons <dir> --rooms <dir> [--clean]

  --icons <dir>   donde se extrajo data/objetos
  --rooms <dir>   donde se extrajo gfx/fondos
  --clean         rehacer desde cero en vez de saltar lo que ya está
  --lanes N       cuántos cwebp a la vez (por omisión, un núcleo cada uno)`);
}
