import Link from "next/link";
import { Suspense } from "react";
import { all, meta } from "@/lib/db";
import { number } from "@/lib/model";
import { ItemIcon, Level, Panel, RoomView } from "@/components/ui";
import Live from "@/components/Live";

/**
 * The front page.
 *
 * Every figure on it is read out of the database rather than typed into the
 * copy: a guide that gets its own size wrong is the first thing a reader will
 * catch it on.
 */
export default async function Home() {
  const counts = meta();

  const pricey = all<{
    id: number; name: string; icon: string | null; price: number; level: number;
    label: string;
  }>(`select id, name, icon, price, level, label from item
       order by price desc limit 8`);

  const hardest = all<{
    id: number; name: string; level: number; health: number; places: number;
  }>(`select n.id, n.name, n.level, n.health,
             (select count(*) from placed_bot p where p.npc_id = n.id) as places
        from npc n where n.level >= 140
        order by n.health desc limit 8`);

  const biggest = all<{
    id: number; label: string; scene: string; views: number; bots: number;
  }>(`select r.id, r.label, r.scene, r.views,
             (select count(*) from placed_bot p where p.room_id = r.id) as bots
        from room r where r.views > 0
        order by r.views desc, bots desc limit 6`);

  return (
    <>
      <section className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          La guía de La Prisión
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-dim">
          El catálogo entero del juego: lo que hay, quién lo lleva, con qué se
          hace y dónde está. Sale del propio{" "}
          <code className="font-mono text-text">
            {counts.map ?? "*.gamedata"}
          </code>{" "}
          del servidor, leído con los mismos lectores que usa el servidor.
        </p>
      </section>

      {/* MARK: what is in here */}
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Count
          href="/objetos"
          n={counts.items}
          label="objetos"
          sub={`${number(Number(counts.item_mods ?? 0))} modificadores`}
        />
        <Count
          href="/npcs"
          n={counts.npcs}
          label="NPCs"
          sub={`${number(Number(counts.loot ?? 0))} entradas de botín`}
        />
        <Count
          href="/recetas"
          n={counts.recipes}
          label="recetas"
          sub={`en ${number(Number(counts.supplies ?? 0))} vendedores`}
        />
        <Count
          href="/salas"
          n={counts.rooms}
          label="salas"
          sub={`${number(Number(counts.doors ?? 0))} puertas, ${number(Number(counts.room_views ?? 0))} vistas`}
        />
      </div>

      {/* The live side is the one thing here that can be slow or absent, so it
          streams in on its own instead of holding the page. */}
      <Suspense
        fallback={
          <Panel title="En vivo" className="mb-8">
            <p className="px-4 py-3 text-[13px] text-faint">consultando…</p>
          </Panel>
        }
      >
        <Live />
      </Suspense>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Lo más caro" note="por precio del catálogo">
          <ul className="divide-y divide-line-soft">
            {pricey.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/objetos/${row.id}`}
                  className="flex items-center gap-2.5 px-4 py-2 hover:bg-ink-raised"
                >
                  <ItemIcon icon={row.icon} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-text">
                      {row.name}
                    </span>
                    <span className="block text-[11px] text-faint">
                      {row.label} · nivel {row.level}
                    </span>
                  </span>
                  <span className="tnum shrink-0 font-mono text-[12px] text-amber">
                    ${number(row.price)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Lo más duro" note="nivel 140 y más, por salud">
          <ul className="divide-y divide-line-soft">
            {hardest.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/npcs/${row.id}`}
                  className="flex items-baseline gap-2 px-4 py-2 hover:bg-ink-raised"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-text">
                      {row.name}
                    </span>
                    <span className="block text-[11px] text-faint">
                      {number(row.health)} de salud
                      {row.places > 0 && ` · en ${row.places} sala(s)`}
                    </span>
                  </span>
                  <Level value={row.level} />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Las salas más grandes" note="por número de cámaras">
          <ul className="divide-y divide-line-soft">
            {biggest.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/salas/${row.id}`}
                  className="flex items-center gap-3 px-4 py-2 hover:bg-ink-raised"
                >
                  <RoomView
                    scene={row.scene}
                    view={1}
                    thumb
                    alt=""
                    className="h-11 w-16 shrink-0 rounded"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-text">
                      {row.label}
                    </span>
                    <span className="block text-[11px] text-faint">
                      {row.views} vistas
                      {row.bots > 0 && ` · ${row.bots} NPC`}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="De dónde sale todo esto" className="mt-8">
        <div className="space-y-2.5 px-4 py-3 text-[13px] leading-relaxed text-dim">
          <p>
            Un exportador en Swift, dentro del propio servidor, abre el{" "}
            <code className="font-mono text-text">*.gamedata</code> con los
            lectores del servidor y saca las nueve secciones que lleva dentro:
            los objetos, los NPCs con su botín, los vendedores con sus recetas,
            los delitos, las rutas de patrulla y las cajas. Las salas y las
            puertas vienen de MAPINFO, que es la tabla que el cliente recibe.
            Los nombres de tipo, los diálogos de los vendedores y los niveles de
            enemigo por sala salen de los ficheros de configuración del propio
            cliente.
          </p>
          <p>
            Por eso la guía y el servidor no pueden decir cosas distintas: no
            hay dos lectores, hay uno.
          </p>
          <p className="text-faint">
            Exportado el{" "}
            {counts.export_at
              ? new Date(counts.export_at).toLocaleString("es-ES")
              : "—"}
            . Base construida el{" "}
            {counts.built_at
              ? new Date(counts.built_at).toLocaleString("es-ES")
              : "—"}
            .
          </p>
        </div>
      </Panel>
    </>
  );
}

function Count({
  href, n, label, sub,
}: {
  href: string;
  n: string | undefined;
  label: string;
  sub: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-lg border border-line bg-panel/70 p-4 transition-colors hover:border-amber-dim"
    >
      <p className="tnum font-mono text-2xl text-text group-hover:text-amber">
        {number(Number(n ?? 0))}
      </p>
      <p className="mt-0.5 text-[13px] text-dim">{label}</p>
      <p className="mt-1 text-[11px] text-faint">{sub}</p>
    </Link>
  );
}
