import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  breakage, crimes, droppedBy, item, itemMods, madeBy, startsWith, usedIn,
} from "@/lib/queries";
import {
  allCrimes, crimesOf, number, pesetas, signed,
} from "@/lib/model";
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
  { params }: PageProps<"/objetos/[id]">,
): Promise<Metadata> {
  const { id } = await params;
  const found = item(Number(id));
  return { title: found ? found.name : "Objeto" };
}

const KIND_LABEL: Record<string, string> = {
  receta: "receta",
  compra: "compra",
  venta: "venta",
  servicio: "servicio",
  charla: "charla",
};

/**
 * One object, and everything the tables say about it.
 *
 * The order is the reader's order, not the table's: what it is and what it does
 * first, then **how to get one**, then what it is good for, and the raw record
 * last for whoever is editing the map rather than playing.
 */
export default async function Objeto({ params }: PageProps<"/objetos/[id]">) {
  const { id } = await params;
  const found = item(Number(id));
  if (!found) notFound();

  const mods = itemMods(found.id);
  const everyCrime = crimes();
  const allowed = crimesOf(found.crime_mask, everyCrime);
  const anybody = allCrimes(found.crime_mask, everyCrime);
  const drops = droppedBy(found.id);
  const made = madeBy(found.id);
  const uses = usedIn(found.id);
  const starts = startsWith(found.id);
  const breaks = breakage(found);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start gap-4">
        <ItemIcon icon={found.icon} size={64} alt={found.name} />
        <div className="min-w-0 flex-1">
          <PageHead
            eyebrow={
              <>
                <Link href={`/objetos?grupo=${found.grp}`} className="hover:underline">
                  {found.grp}
                </Link>
                {" · "}
                <Link href={`/objetos?tipo=${found.type}`} className="hover:underline">
                  {found.label}
                </Link>
              </>
            }
            title={found.name}
          >
            {found.plural !== found.name && (
              <>en plural, «{found.plural}» · </>
            )}
            <span className="tnum font-mono">#{found.id}</span>
            {/* The table stores the article, because the client drops the name
                straight into sentences it builds. The guide shows the label,
                so it says here what the string really is. */}
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
          </PageHead>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        {/* MARK: what it is */}
        <div className="space-y-5">
          <Panel title="Lo que es">
            <dl>
              <Row label="Nivel"><Level value={found.level} /></Row>
              <Row label="Precio">
                {found.price ? pesetas(found.price) : <span className="text-faint">no tiene</span>}
              </Row>
              <Row label="Peso">{found.weight}</Row>
              <Row label="Manejo">{found.handling}</Row>
              <Row label="Efecto">{found.effect}</Row>
              <Row label="Modificador">{signed(found.modifier)}</Row>
              {found.weapon_skill > 0 && (
                <Row label="Habilidad de arma">{found.weapon_skill}</Row>
              )}
              <Row label="Sonido">{found.sound_type}</Row>
              <Row label="Banderas">
                0x{found.flags.toString(16).toUpperCase().padStart(2, "0")}
              </Row>
            </dl>
          </Panel>

          {mods.length > 0 && (
            <Panel
              title="Modificadores"
              note={`${mods.length} de los 10 que caben`}
            >
              <dl>
                {mods.map((mod, index) => (
                  <Row
                    key={index}
                    label={
                      <span className="flex items-center gap-1.5">
                        {mod.name ?? <span className="text-faint">stat {mod.stat}</span>}
                        {mod.kind === "habilidad" && (
                          <Badge tone="violet" title="Es una habilidad del CLASSINFO">
                            hab.
                          </Badge>
                        )}
                        {mod.kind === "desconocido" && (
                          <Badge
                            tone="neutral"
                            title="El número no corresponde ni a un atributo ni a una habilidad conocidos"
                          >
                            ?
                          </Badge>
                        )}
                      </span>
                    }
                    tone={mod.value < 0 ? "red" : "green"}
                  >
                    {signed(mod.value)}
                  </Row>
                ))}
              </dl>
              <p className="border-t border-line-soft px-4 py-2 text-[11px] leading-snug text-faint">
                Los números 1 a 9 son los atributos que el cliente abrevia SAL,
                FUE, DES, EXP, AGI, CON, INT, CAR y PRO. Del 20 al 48 son ids de
                habilidad del CLASSINFO. Del 100 en adelante no se sabe qué son,
                y aquí salen como el número que son.
              </p>
            </Panel>
          )}

          <Panel title="Quién lo puede usar">
            {anybody ? (
              <p className="px-4 py-3 text-[13px] text-dim">
                Cualquier delito.
                <span className="tnum ml-1 font-mono text-[11px] text-faint">
                  máscara 0x{found.crime_mask.toString(16).toUpperCase()}
                </span>
              </p>
            ) : allowed.length === 0 ? (
              <p className="px-4 py-3 text-[13px] text-red">
                Ningún delito. La máscara es 0x
                {found.crime_mask.toString(16).toUpperCase()}.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5 px-4 py-3">
                {allowed.map((crime) => (
                  <Link key={crime.id} href={`/delitos/${crime.id}`}>
                    <Badge tone="amber">{crime.male_name}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </Panel>

          {(breaks.into || breaks.from.length > 0 || found.contains > 0
            || found.related_item > 0) && (
            <Panel title="Lo que lleva detrás">
              <dl>
                {found.break_chance > 0 && (
                  <Row label="Probabilidad de rotura">{found.break_chance}</Row>
                )}
                {breaks.into && (
                  <Row label="Se rompe en" mono={false}>
                    <Link href={`/objetos/${breaks.into.id}`} className="text-amber hover:underline">
                      {breaks.into.name}
                    </Link>
                  </Row>
                )}
                {found.contains > 0 && (
                  <Row label="Contiene" mono={false}>
                    <Link href={`/objetos/${found.contains}`} className="text-amber hover:underline">
                      objeto {found.contains}
                    </Link>
                  </Row>
                )}
                {found.related_item > 0 && (
                  <Row label="Objeto ligado" mono={false}>
                    <Link href={`/objetos/${found.related_item}`} className="text-amber hover:underline">
                      objeto {found.related_item}
                    </Link>
                  </Row>
                )}
              </dl>
              {breaks.from.length > 0 && (
                <div className="border-t border-line-soft px-4 py-2.5">
                  <p className="mb-1.5 text-[11px] tracking-wide text-faint uppercase">
                    Sale de romper
                  </p>
                  <ul className="space-y-0.5 text-[13px]">
                    {breaks.from.map((other) => (
                      <li key={other.id}>
                        <Link href={`/objetos/${other.id}`} className="text-dim hover:text-amber">
                          {other.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Panel>
          )}
        </div>

        {/* MARK: how to get one */}
        <div className="space-y-5">
          <Panel
            title="De dónde sale"
            note={
              drops.length || made.length || starts.length
                ? `${drops.length} NPC(s), ${made.length} receta(s)`
                : undefined
            }
          >
            {starts.length > 0 && (
              <div className="border-b border-line-soft px-4 py-2.5">
                <p className="mb-1.5 text-[11px] tracking-wide text-faint uppercase">
                  Se empieza con él
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {starts.map((crime) => (
                    <Link key={crime.id} href={`/delitos/${crime.id}`}>
                      <Badge tone="green">
                        {crime.male_name}
                        {crime.quantity > 1 && ` ×${crime.quantity}`}
                      </Badge>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {made.length > 0 && (
              <div className="border-b border-line-soft">
                <p className="px-4 pt-2.5 text-[11px] tracking-wide text-faint uppercase">
                  Se consigue de
                </p>
                <ul className="divide-y divide-line-soft">
                  {made.map((row) => (
                    <li key={row.id} className="px-4 py-2 hover:bg-ink-raised">
                      <Link href={`/recetas/${row.id}`} className="block">
                        <span className="flex flex-wrap items-baseline gap-2">
                          <span className="text-[13px] text-text">
                            {row.name && !["VOID", "<VOID>"].includes(row.name)
                              ? row.name
                              : <span className="text-faint">sin nombre</span>}
                          </span>
                          <Badge tone={row.kind === "receta" ? "violet" : "amber"}>
                            {KIND_LABEL[row.kind]}
                          </Badge>
                          {row.quantity > 1 && (
                            <span className="tnum font-mono text-[11px] text-green">
                              ×{row.quantity}
                            </span>
                          )}
                          {row.level > 0 && (
                            <span className="text-[11px] text-faint">
                              nivel {row.level}
                            </span>
                          )}
                          {row.skill_name && (
                            <span className="text-[11px] text-violet">
                              {row.skill_name}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-faint">
                          {row.vendor_note ?? `vendedor ${row.supply_id}`}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {drops.length > 0 && (
              <div>
                <p className="px-4 pt-2.5 text-[11px] tracking-wide text-faint uppercase">
                  Lo llevan {number(drops.length)} NPC(s)
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="text-left text-[11px] tracking-wide text-faint uppercase">
                        <th className="px-4 py-1.5 font-medium">NPC</th>
                        <th className="px-2 py-1.5 text-right font-medium">Nivel</th>
                        <th className="px-2 py-1.5 text-right font-medium" title="El segundo número de la fila de botín: la tabla no dice si es probabilidad o cantidad">
                          Valor
                        </th>
                        <th className="px-4 py-1.5 text-right font-medium">Salas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drops.slice(0, 40).map((drop) => (
                        <tr key={drop.id} className="border-t border-line-soft hover:bg-ink-raised">
                          <td className="px-4 py-1">
                            <Link href={`/npcs/${drop.id}`} className="text-text hover:text-amber">
                              {drop.name}
                            </Link>
                          </td>
                          <td className="px-2 py-1 text-right">
                            <Level value={drop.level} />
                          </td>
                          <td className="tnum px-2 py-1 text-right font-mono text-dim">
                            {drop.value}
                          </td>
                          <td className="tnum px-4 py-1 text-right font-mono">
                            {drop.places > 0 ? (
                              <span className="text-green">{drop.places}</span>
                            ) : (
                              <span className="text-faint" title="Este NPC no está colocado en ninguna sala de este mapa">
                                0
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {drops.length > 40 && (
                  <p className="px-4 py-2 text-[11px] text-faint">
                    y {number(drops.length - 40)} NPC(s) más.
                  </p>
                )}
              </div>
            )}

            {!drops.length && !made.length && !starts.length && (
              <Empty>
                Nada en las tablas lo entrega: ningún NPC lo lleva, ninguna
                receta lo produce y ningún delito empieza con él.
              </Empty>
            )}
          </Panel>

          <Panel
            title="Para qué sirve"
            note={uses.length ? `${number(uses.length)} receta(s)` : undefined}
          >
            {uses.length === 0 ? (
              <Empty>Ninguna receta lo pide.</Empty>
            ) : (
              <ul className="divide-y divide-line-soft">
                {uses.slice(0, 60).map((row) => (
                  <li key={row.id} className="px-4 py-2 hover:bg-ink-raised">
                    <Link href={`/recetas/${row.id}`} className="flex flex-wrap items-baseline gap-2">
                      <span className="tnum font-mono text-[11px] text-dim">
                        ×{row.quantity}
                      </span>
                      <span className="text-[13px] text-text">
                        {row.name && !["VOID", "<VOID>"].includes(row.name)
                          ? row.name
                          : <span className="text-faint">sin nombre</span>}
                      </span>
                      <Badge tone={row.kind === "receta" ? "violet" : "amber"}>
                        {KIND_LABEL[row.kind]}
                      </Badge>
                      {row.level > 0 && (
                        <span className="text-[11px] text-faint">nivel {row.level}</span>
                      )}
                      <span className="ml-auto text-[11px] text-faint">
                        {row.vendor_note ?? `vendedor ${row.supply_id}`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {uses.length > 60 && (
              <p className="border-t border-line-soft px-4 py-2 text-[11px] text-faint">
                y {number(uses.length - 60)} más.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
