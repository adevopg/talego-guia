import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  crimes, npc, npcLoot, npcPlaces, supply, supplyArticles,
} from "@/lib/queries";
import { crimeOfNpc, levelBand, number, pesetas } from "@/lib/model";
import {
  Badge, Empty, ItemIcon, Level, PageHead, Panel, Row,
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
  { params }: PageProps<"/npcs/[id]">,
): Promise<Metadata> {
  const { id } = await params;
  const found = npc(Number(id));
  return { title: found ? found.name || `NPC ${found.id}` : "NPC" };
}

/**
 * One NPC: its numbers, what it carries, where it stands, and what it sells.
 */
export default async function NpcPage({ params }: PageProps<"/npcs/[id]">) {
  const { id } = await params;
  const found = npc(Number(id));
  if (!found) notFound();

  const loot = npcLoot(found.id);
  const places = npcPlaces(found.id);
  const crime = crimeOfNpc(found.crime, crimes());
  const sells = found.supply > 0 ? supply(found.supply) : undefined;
  const stock = sells ? supplyArticles(sells.id) : [];

  const lootWorth = loot.reduce((total, row) => total + (row.price ?? 0), 0);

  return (
    <>
      <PageHead
        eyebrow={found.model || "NPC"}
        title={found.name || `NPC ${found.id}`}
      >
        <span className="tnum font-mono">#{found.id}</span>
        {found.name_raw !== found.name && (
          <>
            {" · "}
            <span
              className="text-faint"
              title="La tabla guarda el artículo porque el cliente mete el nombre dentro de frases que compone"
            >
              en la tabla, «{found.name_raw}»
            </span>
          </>
        )}
        {crime && (
          <>
            {" · "}
            <Link href={`/delitos/${crime.id}`} className="hover:underline">
              {crime.male_name}
            </Link>
          </>
        )}
      </PageHead>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Panel title="Lo que es">
            <dl>
              <Row label="Nivel"><Level value={found.level} /></Row>
              <Row label="Salud">{number(found.health)}</Row>
              <Row label="Fuerza">{number(found.strength)}</Row>
              <Row label="Destreza">{number(found.dexterity)}</Row>
              <Row label="Dinero">
                {found.money ? pesetas(found.money) : <span className="text-faint">nada</span>}
              </Row>
              <Row label="Agresividad">{found.aggressiveness}</Row>
              <Row label="Frases de pelea">{found.text_count}</Row>
              <Row
                label={
                  <span title="+0x17 del registro. v7 lo llama el nivel y v8 no pone el nivel ahí, así que viaja sin nombre.">
                    Campo +0x17
                  </span>
                }
                tone="faint"
              >
                {number(found.field17)}
              </Row>
            </dl>
            <p className="border-t border-line-soft px-4 py-2 text-[11px] leading-snug text-faint">
              El nivel es el campo +0x1B, no el +0x17: lo fija el propio vídeo
              del editor, donde el jefe Wild Dog es nivel 75 y la enfermera de
              guardia 150, y es ese campo el que lleva 75 y 150.
            </p>
          </Panel>

          {sells && (
            <Panel title="Vende" note={`puesto ${sells.id}`}>
              <div className="px-4 py-2.5">
                <Link
                  href={`/vendedores/${sells.id}`}
                  className="text-[13px] text-amber hover:underline"
                >
                  {sells.vendor_note ?? sells.name ?? `vendedor ${sells.id}`}
                </Link>
                <p className="tnum mt-0.5 font-mono text-[11px] text-faint">
                  {number(stock.length)} artículo(s)
                </p>
              </div>
            </Panel>
          )}
        </div>

        <div className="space-y-5">
          <Panel
            title="Dónde está"
            note={places.length ? `${places.length} sala(s)` : undefined}
          >
            {places.length === 0 ? (
              <Empty>
                Este NPC no está colocado en ninguna sala de este mapa. Existe
                en el catálogo, pero no se lo encuentra andando por la prisión.
              </Empty>
            ) : (
              <ul className="divide-y divide-line-soft">
                {places.map((place) => (
                  <li key={place.id} className="px-4 py-2 hover:bg-ink-raised">
                    <Link href={`/salas/${place.id}`} className="flex flex-wrap items-baseline gap-2">
                      <span className="text-[13px] text-text">{place.label}</span>
                      <span className="font-mono text-[11px] text-faint">
                        {place.scene}
                      </span>
                      {levelBand(place) && (
                        <Badge tone="red">nivel {levelBand(place)}</Badge>
                      )}
                      {place.is_safe_zone === 1 && (
                        <Badge tone="green">zona segura</Badge>
                      )}
                      {place.route != null && (
                        <span className="ml-auto text-[11px] text-violet">
                          ruta {place.route}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Lo que lleva"
            note={
              loot.length
                ? `${number(loot.length)} objeto(s) · ${pesetas(lootWorth)} si se vendiera todo`
                : undefined
            }
          >
            {loot.length === 0 ? (
              <Empty>No lleva nada.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-line text-left text-[11px] tracking-wide text-faint uppercase">
                      <th className="px-4 py-2 font-medium">Objeto</th>
                      <th className="px-2 py-2 text-right font-medium">Nivel</th>
                      <th className="px-2 py-2 text-right font-medium">Precio</th>
                      <th
                        className="px-4 py-2 text-right font-medium"
                        title="El segundo número de la fila: la tabla no dice si es una probabilidad o una cantidad, así que sale como está"
                      >
                        Valor
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {loot.map((row, index) => (
                      <tr
                        key={`${row.item_id}-${index}`}
                        className="border-b border-line-soft last:border-0 hover:bg-ink-raised"
                      >
                        <td className="px-4 py-1">
                          {row.name ? (
                            <Link
                              href={`/objetos/${row.item_id}`}
                              className="flex items-center gap-2 text-text hover:text-amber"
                            >
                              <ItemIcon icon={row.icon} size={24} />
                              {row.name}
                            </Link>
                          ) : (
                            <span className="text-faint">
                              objeto {row.item_id} — no está en el catálogo
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {row.level != null ? <Level value={row.level} /> : "—"}
                        </td>
                        <td className="tnum px-2 py-1 text-right font-mono text-dim">
                          {row.price ? pesetas(row.price) : "—"}
                        </td>
                        <td className="tnum px-4 py-1 text-right font-mono text-dim">
                          {row.value}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
