import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  article, crimes, ingredients, results, supplyVendors,
} from "@/lib/queries";
import {
  MONEY_ITEM, allCrimes, crimesOf, number, pesetas,
} from "@/lib/model";
import {
  Badge, Empty, ItemIcon, Level, PageHead, Panel, Row,
} from "@/components/ui";
import type { Part } from "@/lib/queries";

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
  { params }: PageProps<"/recetas/[id]">,
): Promise<Metadata> {
  const { id } = await params;
  const found = article(Number(id));
  return {
    title: found && !["", "VOID", "<VOID>"].includes(found.name)
      ? found.name
      : "Receta",
  };
}

/**
 * One line of what a vendor will do.
 *
 * Shown as what it is: a trade. What you hand over on the left, what you get
 * back on the right, and the conditions — level, skill, crime — between them.
 */
export default async function Receta({ params }: PageProps<"/recetas/[id]">) {
  const { id } = await params;
  const found = article(Number(id));
  if (!found) notFound();

  const wants = ingredients(found.id);
  const gives = results(found.id);
  const vendors = supplyVendors(found.supply_id);
  const everyCrime = crimes();
  const allowed = crimesOf(found.crime_mask, everyCrime);
  const anybody = allCrimes(found.crime_mask, everyCrime);

  const named = !["", "VOID", "<VOID>"].includes(found.name);

  return (
    <>
      <PageHead
        eyebrow={
          <>
            {found.kind}
            {" · "}
            <Link href={`/vendedores/${found.supply_id}`} className="hover:underline">
              {found.vendor_note ?? found.supply_name ?? `vendedor ${found.supply_id}`}
            </Link>
          </>
        }
        title={named ? found.name : `Artículo ${found.id}`}
      >
        {!named && (
          <>
            El artículo no tiene nombre en la tabla: es el número{" "}
            {found.idx + 1} del vendedor.{" "}
          </>
        )}
        <span className="tnum font-mono">#{found.id}</span>
      </PageHead>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <div className="space-y-5">
          {/* MARK: the trade itself */}
          <div className="grid gap-5 md:grid-cols-2">
            <Panel title="Lo que pides que acepte" note={`${wants.length} entrada(s)`}>
              <Parts parts={wants} tone="dim" />
            </Panel>
            <Panel title="Lo que te da" note={`${gives.length} salida(s)`}>
              <Parts parts={gives} tone="green" />
            </Panel>
          </div>

          {(found.text_es || found.text_en) && (
            <Panel title="Lo que te contesta">
              {found.text_es && (
                <p className="px-4 py-2.5 text-[14px] leading-relaxed text-text italic">
                  «{found.text_es}»
                </p>
              )}
              {found.text_en && found.text_en !== found.text_es && (
                <p className="border-t border-line-soft px-4 py-2.5 text-[13px] leading-relaxed text-dim italic">
                  «{found.text_en}»
                </p>
              )}
              <p className="border-t border-line-soft px-4 py-1.5 text-[11px] text-faint">
                Mensaje {found.text} de la tabla de textos del cliente.
              </p>
            </Panel>
          )}

          <Panel
            title="Quién lo hace"
            note={vendors.length ? `${vendors.length} NPC(s)` : undefined}
          >
            {vendors.length === 0 ? (
              <Empty>
                Ningún NPC del catálogo lleva este puesto, así que no hay con
                quién hablar para esto en este mapa.
              </Empty>
            ) : (
              <ul className="divide-y divide-line-soft">
                {vendors.map((vendor) => (
                  <li key={vendor.id} className="px-4 py-2 hover:bg-ink-raised">
                    <Link href={`/npcs/${vendor.id}`} className="flex items-baseline gap-2">
                      <span className="text-[13px] text-text">{vendor.name}</span>
                      <Level value={vendor.level} />
                      <span className="ml-auto tnum font-mono text-[11px]">
                        {vendor.places > 0 ? (
                          <span className="text-green">{vendor.places} sala(s)</span>
                        ) : (
                          <span className="text-faint">sin colocar</span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="Condiciones">
            <dl>
              <Row label="Nivel que pide">
                {found.level > 0 ? <Level value={found.level} /> : <span className="text-faint">ninguno</span>}
              </Row>
              <Row label="Habilidad" mono={false}>
                {found.skill_name
                  ? <span className="text-violet">{found.skill_name}</span>
                  : <span className="text-faint">ninguna</span>}
              </Row>
              <Row label="Da experiencia" tone={found.gives_experience ? "green" : undefined}>
                {found.gives_experience ? "sí" : "no"}
              </Row>
              {found.service > 0 && (
                <Row
                  label={
                    <span title="Un código de servicio del cliente: curar, quitar un estado… no un objeto que te llevas">
                      Servicio
                    </span>
                  }
                >
                  {found.service}
                </Row>
              )}
              <Row
                label={
                  <span title="El +0x00 de la cabecera del artículo. No es un id global de objeto: los números son pequeños y propios de cada vendedor, así que viaja en crudo.">
                    Campo +0x00
                  </span>
                }
                tone="faint"
              >
                {found.item_raw}
              </Row>
            </dl>
          </Panel>

          <Panel title="Quién puede pedirlo">
            {anybody ? (
              <p className="px-4 py-3 text-[13px] text-dim">Cualquier delito.</p>
            ) : allowed.length === 0 ? (
              <p className="px-4 py-3 text-[13px] text-red">
                Ningún delito, según la máscara 0x
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
        </div>
      </div>
    </>
  );
}

/**
 * One side of the trade.
 *
 * Money is item 1, so it is shown as an amount and not as a link to an object
 * called "un dinero" — which is what the catalogue literally calls it, and what
 * would make a 2000-money price read as two thousand copies of a thing.
 */
function Parts({ parts, tone }: { parts: Part[]; tone: "dim" | "green" }) {
  if (!parts.length) return <Empty>Nada.</Empty>;
  const colour = tone === "green" ? "text-green" : "text-text";
  return (
    <ul className="divide-y divide-line-soft">
      {parts.map((part, index) => (
        <li key={`${part.item_id}-${index}`} className="px-4 py-2">
          {part.item_id === MONEY_ITEM ? (
            <span className="flex items-baseline gap-2">
              <span className={`tnum font-mono text-[14px] ${colour}`}>
                {pesetas(part.quantity)}
              </span>
              <span className="text-[11px] text-faint">en dinero</span>
            </span>
          ) : part.name ? (
            <Link
              href={`/objetos/${part.item_id}`}
              className="flex items-center gap-2.5 hover:text-amber"
            >
              <ItemIcon icon={part.icon} size={28} />
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-[13px] ${colour}`}>
                  {part.name}
                </span>
                <span className="block text-[11px] text-faint">
                  {part.level != null && `nivel ${part.level}`}
                  {part.price ? ` · ${pesetas(part.price)}` : ""}
                </span>
              </span>
              {part.quantity > 1 && (
                <span className="tnum font-mono text-[13px] text-amber">
                  ×{number(part.quantity)}
                </span>
              )}
            </Link>
          ) : (
            <span className="text-[13px] text-faint">
              objeto {part.item_id} — no está en el catálogo
              {part.quantity > 1 && ` ×${number(part.quantity)}`}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
