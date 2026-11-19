import Link from "next/link";
import type { Metadata } from "next";
import { plan, planJumps } from "@/lib/queries";
import type { PlanRoom } from "@/lib/queries";
import { number } from "@/lib/model";
import { Badge, PageHead, Panel } from "@/components/ui";

/**
 * Rendered per request.
 *
 * Everything on this page comes out of the URL — the filters, or which record
 * is being shown — so there is no static shell worth splitting out: a reader
 * who asked for level 70 to 90 has nothing to look at until that query has run.
 * The query is SQLite in this same process over a 12 MB file, so "per request"
 * costs well under a millisecond and needs nothing cached in front of it.
 */
export const instant = false;


export const metadata: Metadata = { title: "Mapa" };

/**
 * The prison's floor plan, worked out rather than drawn.
 *
 * **The cardinal doors are a grid.** A room whose `pn` leads to B puts B one
 * cell north of it, and `ps`, `pe` and `po` do the same for the other three; the
 * build walks that from the best-connected room and reconstructs the plan. The
 * numbered doors — `p3`, `p17`, the 64 cell doors of a module — are a room's
 * inside and move nothing on a plan, which is why the cells are not cells here
 * and hang off their module instead.
 *
 * The prison is not one perfect grid, so this comes out in pieces: two large
 * ones and a tail of small ones, which is what stairs and corridors that wrap
 * do to a flat projection. The pieces are shown as pieces instead of being
 * forced into one picture that would be wrong.
 */

const CELL = 96;
const GAP = 4;

const COLOURS = [
  ["nivel", "por nivel de enemigos"],
  ["npcs", "por NPCs colocados"],
  ["celdas", "por salas interiores"],
] as const;

export default async function Mapa({ searchParams }: PageProps<"/mapa">) {
  const sp = await searchParams;
  const raw = sp.color;
  const colour = (Array.isArray(raw) ? raw[0] : raw) ?? "nivel";

  const rooms = plan();
  const jumps = planJumps();
  const byId = new Map(rooms.map((room) => [room.id, room]));

  // Biggest piece first: that is the one worth looking at.
  const clusters = new Map<number, PlanRoom[]>();
  for (const room of rooms) {
    const list = clusters.get(room.grid_cluster);
    if (list) list.push(room);
    else clusters.set(room.grid_cluster, [room]);
  }
  const ordered = [...clusters.entries()].sort((a, b) => b[1].length - a[1].length);

  return (
    <>
      <PageHead eyebrow="plano" title="El mapa de la cárcel">
        {number(rooms.length)} salas colocadas a partir de sus puertas
        cardinales, en {clusters.size} trozos. Las celdas y los calabozos no
        salen aquí: se entra en ellos por puertas numeradas, así que cuelgan de
        su módulo, igual que el mapa 2D del juego los colapsa.
      </PageHead>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-[11px] tracking-wide text-faint uppercase">
          Colorear
        </span>
        {COLOURS.map(([value, label]) => (
          <Link
            key={value}
            href={value === "nivel" ? "/mapa" : `/mapa?color=${value}`}
            className={`rounded border px-2.5 py-1 text-[13px] ${
              colour === value
                ? "border-amber-dim bg-amber/10 text-amber"
                : "border-line text-dim hover:border-amber-dim hover:text-amber"
            }`}
          >
            {label}
          </Link>
        ))}
        <Legend colour={colour} />
      </div>

      <div className="space-y-5">
        {ordered.map(([id, list]) => (
          <Cluster
            key={id}
            id={id}
            rooms={list}
            jumps={jumps.filter(
              (jump) =>
                byId.get(jump.from_room)?.grid_cluster === id &&
                byId.get(jump.to_room)?.grid_cluster === id,
            )}
            byId={byId}
            colour={colour}
          />
        ))}
      </div>

      <Panel title="Lo que este plano no es" className="mt-6">
        <div className="space-y-2 px-4 py-3 text-[13px] leading-relaxed text-dim">
          <p>
            No es el mapa 2D del juego. Ese se compila en el bloque{" "}
            <code className="font-mono text-faint">MGRD</code>, que viaja dentro
            de MAPINFO y está entre los 17 KB de cola que nadie ha descifrado
            todavía. Cuando se descifre, las posiciones saldrán de ahí y este
            plano dejará de ser una deducción.
          </p>
          <p>
            Mientras tanto, lo que se ve aquí se deduce de las puertas: es
            correcto en las vecindades —si dos salas comparten pared, comparten
            pared— y aproximado en la forma general.{" "}
            {jumps.length > 0 && (
              <>
                Las {jumps.length} puertas cardinales que no caben como pared
                compartida (escaleras, pasillos que dan la vuelta) salen como
                línea.
              </>
            )}
          </p>
        </div>
      </Panel>
    </>
  );
}

function Legend({ colour }: { colour: string }) {
  const steps =
    colour === "nivel"
      ? [["sin dato", "var(--line)"], ["1–29", "#2f4a3a"], ["30–69", "#5c4a1f"],
         ["70–119", "#7a3f28"], ["120–150", "#7d2b2b"]]
      : colour === "npcs"
        ? [["ninguno", "var(--line)"], ["1", "#2f4a3a"], ["2–3", "#4a5c2a"],
           ["4+", "#7a5f28"]]
        : [["ninguna", "var(--line)"], ["1–8", "#2b4555"], ["9–32", "#2f5570"],
           ["33+", "#356a8c"]];
  return (
    <span className="ml-auto flex flex-wrap items-center gap-2 text-[11px] text-faint">
      {steps.map(([label, fill]) => (
        <span key={label} className="flex items-center gap-1">
          <span
            className="inline-block h-3 w-3 rounded-sm border border-line"
            style={{ background: fill }}
          />
          {label}
        </span>
      ))}
    </span>
  );
}

/** How a room's box is filled, under whichever colouring is on. */
function fillOf(room: PlanRoom, colour: string): string {
  if (colour === "npcs") {
    if (room.bots >= 4) return "#7a5f28";
    if (room.bots >= 2) return "#4a5c2a";
    if (room.bots >= 1) return "#2f4a3a";
    return "var(--ink-raised)";
  }
  if (colour === "celdas") {
    if (room.interior >= 33) return "#356a8c";
    if (room.interior >= 9) return "#2f5570";
    if (room.interior >= 1) return "#2b4555";
    return "var(--ink-raised)";
  }
  const level = room.level_high;
  if (level == null) return "var(--ink-raised)";
  if (level >= 120) return "#7d2b2b";
  if (level >= 70) return "#7a3f28";
  if (level >= 30) return "#5c4a1f";
  return "#2f4a3a";
}

function Cluster({
  id, rooms, jumps, byId, colour,
}: {
  id: number;
  rooms: PlanRoom[];
  jumps: { from_room: number; to_room: number; cardinal: string; door: string }[];
  byId: Map<number, PlanRoom>;
  colour: string;
}) {
  const width = Math.max(...rooms.map((room) => room.grid_x)) + 1;
  const height = Math.max(...rooms.map((room) => room.grid_y)) + 1;
  const w = width * (CELL + GAP);
  const h = height * (CELL + GAP);

  return (
    <Panel
      title={`Trozo ${id}`}
      note={`${rooms.length} sala(s) · ${width}×${height} celdas`}
    >
      <div className="overflow-x-auto p-3">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          width={w}
          height={h}
          role="img"
          aria-label={`Plano del trozo ${id} con ${rooms.length} salas`}
          className="max-w-full"
          style={{ height: "auto" }}
        >
          {/* The doors the grid could not draw as a shared wall. Drawn first so
              the boxes sit on top of them. */}
          {jumps.map((jump, index) => {
            const from = byId.get(jump.from_room);
            const to = byId.get(jump.to_room);
            if (!from || !to) return null;
            return (
              <line
                key={index}
                x1={from.grid_x * (CELL + GAP) + CELL / 2}
                y1={from.grid_y * (CELL + GAP) + CELL / 2}
                x2={to.grid_x * (CELL + GAP) + CELL / 2}
                y2={to.grid_y * (CELL + GAP) + CELL / 2}
                stroke="var(--amber)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                opacity={0.5}
              />
            );
          })}

          {rooms.map((room) => {
            const x = room.grid_x * (CELL + GAP);
            const y = room.grid_y * (CELL + GAP);
            const words = (room.label || room.scene).split(/\s+/);
            // Three short lines read better in a 96px box than one clipped one.
            const lines: string[] = [];
            let line = "";
            for (const word of words) {
              if ((line + " " + word).trim().length > 13) {
                if (line) lines.push(line);
                line = word;
              } else {
                line = (line + " " + word).trim();
              }
            }
            if (line) lines.push(line);
            const shown = lines.slice(0, 3);

            return (
              <a key={room.id} href={`/salas/${room.id}`}>
                <title>
                  {room.label || room.scene}
                  {room.level_high != null
                    && ` — enemigos ${room.level_low}–${room.level_high}`}
                  {room.bots > 0 && ` — ${room.bots} NPC`}
                  {room.interior > 0 && ` — ${room.interior} salas dentro`}
                </title>
                <rect
                  x={x}
                  y={y}
                  width={CELL}
                  height={CELL}
                  rx={3}
                  fill={fillOf(room, colour)}
                  stroke={room.is_safe_zone === 1 ? "var(--green)" : "var(--line)"}
                  strokeWidth={room.is_safe_zone === 1 ? 1.5 : 1}
                  className="transition-[stroke] hover:stroke-amber"
                />
                {shown.map((text, index) => (
                  <text
                    key={index}
                    x={x + CELL / 2}
                    y={y + CELL / 2 - (shown.length - 1) * 6 + index * 12 - 4}
                    textAnchor="middle"
                    fill="var(--text)"
                    fontSize={10}
                    className="pointer-events-none select-none"
                  >
                    {text}
                  </text>
                ))}
                {room.bots > 0 && (
                  <text
                    x={x + CELL - 5}
                    y={y + CELL - 6}
                    textAnchor="end"
                    fill="var(--amber)"
                    fontSize={9}
                    className="pointer-events-none"
                  >
                    {room.bots} ☻
                  </text>
                )}
                {room.interior > 0 && (
                  <text
                    x={x + 5}
                    y={y + CELL - 6}
                    fill="var(--blue)"
                    fontSize={9}
                    className="pointer-events-none"
                  >
                    {room.interior} ⌂
                  </text>
                )}
              </a>
            );
          })}
        </svg>
      </div>
      {rooms.length <= 6 && (
        <div className="flex flex-wrap gap-1.5 border-t border-line-soft px-4 py-2">
          {rooms.map((room) => (
            <Link key={room.id} href={`/salas/${room.id}`}>
              <Badge>{room.label || room.scene}</Badge>
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
}
