import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  botsIn, boxesIn, doorsInto, doorsOf, interiorOf, room, routesOf, shopsIn,
} from "@/lib/queries";
import { exitsOf, levelBand, number } from "@/lib/model";
import {
  Badge, Empty, Level, PageHead, Panel, RoomView, Row,
} from "@/components/ui";

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

export async function generateMetadata(
  { params }: PageProps<"/salas/[id]">,
): Promise<Metadata> {
  const { id } = await params;
  const found = room(Number(id));
  return { title: found ? found.label || `Sala ${found.id}` : "Sala" };
}

/**
 * One room.
 *
 * The pictures come first because that is what the room is: the game does not
 * draw these in 3D, it paints them. A room is one background per camera with a
 * per-pixel depth map behind it, the way *Alone in the Dark* did it — so "sala"
 * means several pictures, not one, and the game's own "vista 7 de 9" is exactly
 * this list.
 */
export default async function Sala({ params }: PageProps<"/salas/[id]">) {
  const { id } = await params;
  const found = room(Number(id));
  if (!found) notFound();

  const doors = doorsOf(found.id);
  const backDoors = doorsInto(found.id);
  const bots = botsIn(found.id);
  const boxes = boxesIn(found.id);
  const shops = shopsIn(found.id);
  const interior = interiorOf(found.id);
  const routes = routesOf(found.id);
  const parent = found.parent_room ? room(found.parent_room) : undefined;

  const exits = exitsOf(found.access_mask);
  const cardinals = doors.filter((door) => door.cardinal);
  const numbered = doors.filter((door) => !door.cardinal);
  const views = Array.from({ length: found.views }, (_, index) => index + 1);

  return (
    <>
      <PageHead
        eyebrow={
          <>
            sala {found.id}
            {parent && (
              <>
                {" · dentro de "}
                <Link href={`/salas/${parent.id}`} className="hover:underline">
                  {parent.label}
                </Link>
              </>
            )}
          </>
        }
        title={found.label || `Sala ${found.id}`}
      >
        <span className="font-mono">{found.scene}</span>
        {found.game_name && found.game_name !== found.label && (
          <> · en la v7, «{found.game_name}»</>
        )}
      </PageHead>

      <div className="mb-5 flex flex-wrap gap-1.5">
        {levelBand(found) && (
          <Badge tone="red">enemigos de nivel {levelBand(found)}</Badge>
        )}
        {found.is_safe_zone === 1 && <Badge tone="green">zona segura</Badge>}
        {exits.length > 0 && (
          <Badge tone="blue">salidas: {exits.join(", ")}</Badge>
        )}
        {exits.length === 0 && (
          <Badge
            tone="neutral"
            title="Ninguna puerta cardinal abierta: el cliente pone precinto sobre las que no están en la máscara"
          >
            sin salida cardinal
          </Badge>
        )}
        {routes.length > 0 && (
          <Badge tone="violet">{routes.length} ruta(s) de patrulla</Badge>
        )}
      </div>

      {views.length > 0 && (
        <Panel
          title="Las vistas"
          note={`${views.length} cámara${views.length === 1 ? "" : "s"}`}
          className="mb-5"
        >
          <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
            {views.map((view) => (
              <figure key={view} className="overflow-hidden rounded border border-line-soft">
                <RoomView
                  scene={found.scene}
                  view={view}
                  alt={`${found.label}, vista ${view}`}
                  className="aspect-[4/3] w-full"
                />
                <figcaption className="border-t border-line-soft bg-ink-raised px-2 py-1 text-[11px] text-faint">
                  vista {view} de {views.length}
                  {boxes.some((box) => box.view === view) && (
                    <span className="ml-2 text-amber">
                      {boxes.filter((box) => box.view === view).length} caja(s)
                    </span>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
        </Panel>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <div className="space-y-5">
          <Panel title="Por dónde se sale" note={`${doors.length} puerta(s)`}>
            {doors.length === 0 ? (
              <Empty>Esta sala no tiene puertas en MAPINFO.</Empty>
            ) : (
              <>
                {cardinals.length > 0 && (
                  <ul className="divide-y divide-line-soft">
                    {cardinals.map((door, index) => (
                      <li key={index} className="px-4 py-2">
                        <Doorway door={door} />
                      </li>
                    ))}
                  </ul>
                )}
                {numbered.length > 0 && (
                  <details className="border-t border-line-soft">
                    <summary className="cursor-pointer px-4 py-2 text-[13px] text-dim hover:text-amber">
                      {numbered.length} puerta(s) numerada(s) — las de dentro
                    </summary>
                    <ul className="divide-y divide-line-soft border-t border-line-soft">
                      {numbered.map((door, index) => (
                        <li key={index} className="px-4 py-1.5">
                          <Doorway door={door} />
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}
          </Panel>

          {bots.length > 0 && (
            <Panel title="Quién anda por aquí" note={`${bots.length} NPC(s)`}>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-line text-left text-[11px] tracking-wide text-faint uppercase">
                      <th className="px-4 py-2 font-medium">NPC</th>
                      <th className="px-2 py-2 text-right font-medium">Nivel</th>
                      <th className="px-2 py-2 text-right font-medium">Salud</th>
                      <th className="px-4 py-2 text-right font-medium">Ruta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bots.map((bot, index) => (
                      <tr
                        key={`${bot.id}-${index}`}
                        className="border-b border-line-soft last:border-0 hover:bg-ink-raised"
                      >
                        <td className="px-4 py-1">
                          <Link href={`/npcs/${bot.id}`} className="text-text hover:text-amber">
                            {bot.name || `NPC ${bot.id}`}
                          </Link>
                          {bot.supply > 0 && (
                            <Badge tone="amber">vende</Badge>
                          )}
                        </td>
                        <td className="px-2 py-1 text-right"><Level value={bot.level} /></td>
                        <td className="tnum px-2 py-1 text-right font-mono text-dim">
                          {number(bot.health)}
                        </td>
                        <td className="tnum px-4 py-1 text-right font-mono text-violet">
                          {bot.route ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          {(shops.length > 0 || boxes.length > 0) && (
            <Panel
              title="Qué se puede tocar"
              note="así es como un objeto llega a una sala: el juego no tiene objetos por el suelo"
            >
              {shops.map((shop) => (
                <div key={shop.shop_id} className="border-b border-line-soft px-4 py-2 last:border-0">
                  <p className="text-[13px] text-text">{shop.name}</p>
                  <p className="text-[11px] text-faint">
                    {shop.npc_name && (
                      <Link href={`/npcs/${shop.npc_id}`} className="hover:text-amber">
                        {shop.npc_name}
                      </Link>
                    )}
                    {shop.supply_id > 0 && (
                      <>
                        {shop.npc_name && " · "}
                        <Link href={`/vendedores/${shop.supply_id}`} className="hover:text-amber">
                          puesto {shop.supply_id}
                        </Link>
                      </>
                    )}
                  </p>
                </div>
              ))}
              {boxes.map((box, index) => (
                <div key={index} className="border-b border-line-soft px-4 py-2 last:border-0">
                  <p className="text-[13px] text-text">
                    {box.name_es || "caja sin nombre"}
                  </p>
                  <p className="tnum font-mono text-[11px] text-faint">
                    vista {box.view} · {box.width}×{box.height} en ({box.x}, {box.y})
                    {box.supply_id > 0 && (
                      <>
                        {" · "}
                        <Link
                          href={`/vendedores/${box.supply_id}`}
                          className="hover:text-amber"
                        >
                          puesto {box.supply_id}
                        </Link>
                      </>
                    )}
                  </p>
                </div>
              ))}
            </Panel>
          )}
        </div>

        <div className="space-y-5">
          <Panel title="Datos">
            <dl>
              <Row label="Id">{found.id}</Row>
              <Row label="Escena" mono={false}>
                <span className="font-mono">{found.scene}</span>
              </Row>
              <Row label="Tipo de sala">{found.room_type}</Row>
              <Row label="Máscara de acceso">
                {found.access_mask} ({exits.join(", ") || "ninguna"})
              </Row>
              {found.zone_type != null && (
                <Row label="Tipo de zona (v7)">{found.zone_type}</Row>
              )}
              <Row label="Cámaras">{found.views}</Row>
              {found.grid_cluster != null && (
                <Row label="En el plano" mono={false}>
                  <Link href="/mapa" className="text-amber hover:underline">
                    trozo {found.grid_cluster}, celda ({found.grid_x}, {found.grid_y})
                  </Link>
                </Row>
              )}
            </dl>
          </Panel>

          {interior.length > 0 && (
            <Panel title="Lo que hay dentro" note={`${interior.length} sala(s)`}>
              <ul className="max-h-80 divide-y divide-line-soft overflow-y-auto">
                {interior.map((child) => (
                  <li key={child.id}>
                    <Link
                      href={`/salas/${child.id}`}
                      className="block px-4 py-1.5 text-[13px] text-dim hover:bg-ink-raised hover:text-amber"
                    >
                      {child.label || `sala ${child.id}`}
                      <span className="ml-2 font-mono text-[11px] text-faint">
                        {child.scene}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {backDoors.length > 0 && (
            <Panel title="Se llega desde" note={`${backDoors.length} sala(s)`}>
              <ul className="max-h-72 divide-y divide-line-soft overflow-y-auto">
                {backDoors.map((door, index) => (
                  <li key={index}>
                    <Link
                      href={`/salas/${door.room_id}`}
                      className="flex items-baseline gap-2 px-4 py-1.5 text-[13px] text-dim hover:bg-ink-raised hover:text-amber"
                    >
                      <span className="min-w-0 flex-1 truncate">{door.to_label}</span>
                      <span className="font-mono text-[11px] text-faint">
                        {door.cardinal ?? door.name}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {routes.length > 0 && (
            <Panel title="Rutas de patrulla">
              <dl>
                {routes.map((route) => (
                  <Row key={route.idx} label={route.name || `ruta ${route.idx}`}>
                    {route.nodes} nodo(s)
                  </Row>
                ))}
              </dl>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

function Doorway({
  door,
}: {
  door: {
    name: string;
    cardinal: string | null;
    to_room: number;
    to_label: string | null;
    pick_lock_item: number;
    key_name: string | null;
  };
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="w-14 shrink-0 font-mono text-[11px] text-faint">
        {door.cardinal ?? door.name}
      </span>
      {door.to_room === 0 ? (
        <span
          className="text-[13px] text-faint"
          title="La tabla no dice a dónde lleva, así que desde aquí no se puede cruzar"
        >
          no lleva a ningún sitio
        </span>
      ) : (
        <Link
          href={`/salas/${door.to_room}`}
          className="text-[13px] text-text hover:text-amber"
        >
          {door.to_label ?? `sala ${door.to_room}`}
        </Link>
      )}
      {door.pick_lock_item > 0 && (
        <span className="ml-auto text-[11px]">
          <span className="text-faint">se fuerza con </span>
          <Link
            href={`/objetos/${door.pick_lock_item}`}
            className="text-amber hover:underline"
          >
            {door.key_name ?? `objeto ${door.pick_lock_item}`}
          </Link>
        </span>
      )}
    </div>
  );
}
