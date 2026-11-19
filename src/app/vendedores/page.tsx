import Link from "next/link";
import type { Metadata } from "next";
import { all } from "@/lib/db";
import { number } from "@/lib/model";
import { Badge, Empty, PageHead, Panel } from "@/components/ui";

export const metadata: Metadata = { title: "Vendedores" };

interface Row {
  id: number;
  name: string;
  vendor_note: string | null;
  lines: number;
  articles: number;
  recipes: number;
  npcs: number;
  placed: number;
}

/**
 * Every supply in the game.
 *
 * A "supply" is a vendor's whole stock list, and an NPC points at one. The two
 * numbers worth reading are the last ones: how many NPCs carry this stock, and
 * how many of those are actually standing somewhere in this map. A stock list
 * nobody carries is a stock list you cannot reach.
 */
export default async function Vendedores() {
  const rows = all<Row>(`
    select s.id, s.name, s.vendor_note,
           (select count(*) from supply_line l where l.supply_id = s.id) as lines,
           (select count(*) from article a where a.supply_id = s.id) as articles,
           (select count(*) from article a
             where a.supply_id = s.id and a.kind = 'receta') as recipes,
           (select count(*) from npc n where n.supply = s.id) as npcs,
           (select count(*) from npc n
             join placed_bot p on p.npc_id = n.id
            where n.supply = s.id) as placed
      from supply s
     order by placed desc, npcs desc, articles desc`);

  const reachable = rows.filter((row) => row.placed > 0);

  return (
    <>
      <PageHead eyebrow="puestos" title="Vendedores">
        {number(rows.length)} listas de venta, de las que {reachable.length}{" "}
        las lleva algún NPC colocado en el mapa. Las 23 con diálogo son las que
        el cliente trae escritas en{" "}
        <code className="font-mono text-dim">ShopTxt.ini</code>.
      </PageHead>

      <Panel title="Lista">
        {rows.length === 0 ? (
          <Empty>No hay vendedores.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[11px] tracking-wide text-faint uppercase">
                  <th className="px-4 py-2 font-medium">Puesto</th>
                  <th className="px-2 py-2 text-right font-medium">Artículos</th>
                  <th className="px-2 py-2 text-right font-medium">Recetas</th>
                  <th className="px-2 py-2 text-right font-medium">NPCs</th>
                  <th className="px-4 py-2 text-right font-medium">Colocados</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-line-soft last:border-0 hover:bg-ink-raised"
                  >
                    <td className="px-4 py-1.5">
                      <Link href={`/vendedores/${row.id}`} className="block hover:text-amber">
                        <span className="flex items-center gap-2">
                          <span className="text-text">
                            {row.vendor_note ?? row.name
                              ?? <span className="text-faint">sin nombre</span>}
                          </span>
                          {row.lines > 0 && <Badge tone="amber">habla</Badge>}
                        </span>
                        <span className="tnum block font-mono text-[11px] text-faint">
                          #{row.id}
                          {row.vendor_note && row.name ? ` · ${row.name}` : ""}
                        </span>
                      </Link>
                    </td>
                    <td className="tnum px-2 py-1.5 text-right font-mono text-dim">
                      {number(row.articles)}
                    </td>
                    <td className="tnum px-2 py-1.5 text-right font-mono text-violet">
                      {row.recipes || "—"}
                    </td>
                    <td className="tnum px-2 py-1.5 text-right font-mono text-dim">
                      {row.npcs || "—"}
                    </td>
                    <td className="tnum px-4 py-1.5 text-right font-mono">
                      {row.placed > 0 ? (
                        <span className="text-green">{row.placed}</span>
                      ) : (
                        <span className="text-faint">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
