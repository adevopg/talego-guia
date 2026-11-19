import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  supply, supplyArticles, supplyLines, supplyVendors,
} from "@/lib/queries";
import { number } from "@/lib/model";
import {
  Badge, Empty, Level, PageHead, Panel, Row,
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
  { params }: PageProps<"/vendedores/[id]">,
): Promise<Metadata> {
  const { id } = await params;
  const found = supply(Number(id));
  return { title: found ? (found.vendor_note ?? found.name ?? `Vendedor ${id}`) : "Vendedor" };
}

/** One vendor: what it says, what it trades, and who carries it. */
export default async function Vendedor({ params }: PageProps<"/vendedores/[id]">) {
  const { id } = await params;
  const found = supply(Number(id));
  if (!found) notFound();

  const lines = supplyLines(found.id);
  const stock = supplyArticles(found.id);
  const vendors = supplyVendors(found.id);

  const named = stock.filter((a) => !["", "VOID", "<VOID>"].includes(a.name));
  const plumbing = stock.length - named.length;

  return (
    <>
      <PageHead
        eyebrow="puesto"
        title={found.vendor_note ?? found.name ?? `Vendedor ${found.id}`}
      >
        <span className="tnum font-mono">#{found.id}</span>
        {found.vendor_note && found.name && <> · {found.name}</>}
      </PageHead>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <div className="space-y-5">
          {lines.length > 0 && (
            <Panel
              title="Lo que dice al abrir"
              note={`${lines.length} frase(s), el cliente elige una`}
            >
              <ul className="divide-y divide-line-soft">
                {lines.map((line, index) => (
                  <li
                    key={index}
                    className="px-4 py-2.5 text-[13px] leading-relaxed text-dim italic"
                  >
                    «{line}»
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel
            title="Lo que trata"
            note={
              `${number(named.length)} con nombre`
              + (plumbing ? ` · ${number(plumbing)} sin nombre` : "")
            }
          >
            {named.length === 0 ? (
              <Empty>
                {stock.length === 0
                  ? "Este puesto no tiene artículos. El cliente despacha a todo el mundo cuando eso pasa: la comprobación de delito recorre esa lista y sale por la rama de «no quiero tratos con gente como tú»."
                  : `Los ${number(stock.length)} artículos de este puesto no tienen nombre.`}
              </Empty>
            ) : (
              <ul className="divide-y divide-line-soft">
                {named.map((entry) => (
                  <li key={entry.id} className="px-4 py-2.5 hover:bg-ink-raised">
                    <Link href={`/recetas/${entry.id}`} className="block">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-[14px] text-text">{entry.name}</span>
                        <Badge
                          tone={
                            entry.kind === "receta" ? "violet"
                            : entry.kind === "compra" ? "amber"
                            : entry.kind === "venta" ? "green"
                            : "neutral"
                          }
                        >
                          {entry.kind}
                        </Badge>
                        {entry.level > 0 && (
                          <span className="text-[11px] text-faint">
                            nivel <Level value={entry.level} />
                          </span>
                        )}
                        {entry.skill_name && (
                          <Badge tone="violet">{entry.skill_name}</Badge>
                        )}
                      </div>
                      <div className="mt-1 grid gap-x-4 gap-y-0.5 text-[12px] sm:grid-cols-2">
                        <p className="text-dim">
                          <span className="text-faint">pide </span>
                          {entry.wants ?? <span className="text-faint">nada</span>}
                        </p>
                        <p className="text-green">
                          <span className="text-faint">da </span>
                          {entry.makes ?? <span className="text-faint">nada</span>}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="Datos">
            <dl>
              <Row label="Artículos">{number(stock.length)}</Row>
              <Row label="Recetas">
                {number(stock.filter((a) => a.kind === "receta").length)}
              </Row>
              <Row label="Modo">{found.mode}</Row>
              <Row label="Texto de vendedor">
                {found.vendor_text === 0xfff ? (
                  <span className="text-faint" title="0xFFF significa que este puesto no dice nada">
                    no habla
                  </span>
                ) : (
                  found.vendor_text
                )}
              </Row>
            </dl>
          </Panel>

          <Panel
            title="Quién lo lleva"
            note={vendors.length ? `${vendors.length} NPC(s)` : undefined}
          >
            {vendors.length === 0 ? (
              <Empty>Ningún NPC lleva este puesto.</Empty>
            ) : (
              <ul className="divide-y divide-line-soft">
                {vendors.map((vendor) => (
                  <li key={vendor.id} className="px-4 py-2 hover:bg-ink-raised">
                    <Link href={`/npcs/${vendor.id}`} className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate text-[13px] text-text">
                        {vendor.name}
                      </span>
                      <Level value={vendor.level} />
                      <span className="tnum w-14 text-right font-mono text-[11px]">
                        {vendor.places > 0 ? (
                          <span className="text-green">{vendor.places} sala</span>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
