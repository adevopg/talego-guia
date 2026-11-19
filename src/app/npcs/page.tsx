import Link from "next/link";
import type { Metadata } from "next";
import { npcs } from "@/lib/queries";
import { number, pesetas } from "@/lib/model";
import { Badge, Empty, Level, PageHead, Pager, Panel } from "@/components/ui";

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


export const metadata: Metadata = { title: "NPCs" };

const PER_PAGE = 60;

const ORDERS = [
  ["nivel", "nivel ↓"],
  ["nivel-asc", "nivel ↑"],
  ["nombre", "nombre"],
  ["salud", "salud ↓"],
  ["botin", "botín ↓"],
  ["id", "id"],
] as const;

/**
 * The bestiary.
 *
 * Two of the columns are the ones that matter and neither is obvious from the
 * table alone: **salas** is how many rooms the NPC actually stands in, and
 * **botín** is how many different things it carries. An NPC with a long loot
 * list and no room is in the catalogue but not in the prison, which is most of
 * them — only 267 of the 2874 are placed in this map.
 */
export default async function Npcs({ searchParams }: PageProps<"/npcs">) {
  const sp = await searchParams;
  const str = (key: string) => {
    const value = sp[key];
    const text = Array.isArray(value) ? value[0] : value;
    return text && text.length ? text : undefined;
  };
  const num = (key: string) => {
    const text = str(key);
    const value = text == null ? NaN : Number(text);
    return Number.isFinite(value) ? value : undefined;
  };

  const filter = {
    q: str("q"),
    nivelMin: num("nivelMin"),
    nivelMax: num("nivelMax"),
    soloColocados: str("colocados") === "1",
    soloVendedores: str("vendedores") === "1",
    orden: str("orden"),
    pagina: num("pagina") ?? 1,
    porPagina: PER_PAGE,
  };

  const { rows, total } = npcs(filter);

  const carried: Record<string, string | undefined> = {
    q: filter.q,
    nivelMin: filter.nivelMin != null ? String(filter.nivelMin) : undefined,
    nivelMax: filter.nivelMax != null ? String(filter.nivelMax) : undefined,
    colocados: filter.soloColocados ? "1" : undefined,
    vendedores: filter.soloVendedores ? "1" : undefined,
    orden: filter.orden,
  };

  return (
    <>
      <PageHead eyebrow="bestiario" title="NPCs">
        {number(total)} de {number(2874)}. Solo 267 están colocados en alguna
        sala de este mapa; el resto existe en el catálogo pero no en la prisión.
      </PageHead>

      <Panel className="mb-5">
        <form
          method="get"
          className="flex flex-wrap items-end gap-3 p-4 text-[13px]"
        >
          <label className="min-w-[180px] flex-1">
            <span className="mb-1 block text-[11px] tracking-wide text-faint uppercase">
              Nombre o modelo
            </span>
            <input
              name="q"
              defaultValue={filter.q ?? ""}
              placeholder="Wild Dog, enfermera…"
              className="w-full rounded border border-line bg-ink-sunken px-2 py-1.5 outline-none placeholder:text-faint focus:border-amber-dim"
            />
          </label>
          <label>
            <span className="mb-1 block text-[11px] tracking-wide text-faint uppercase">
              Nivel desde
            </span>
            <input
              name="nivelMin"
              type="number"
              min={1}
              max={150}
              defaultValue={filter.nivelMin ?? ""}
              className="tnum w-24 rounded border border-line bg-ink-sunken px-2 py-1.5 font-mono outline-none focus:border-amber-dim"
            />
          </label>
          <label>
            <span className="mb-1 block text-[11px] tracking-wide text-faint uppercase">
              hasta
            </span>
            <input
              name="nivelMax"
              type="number"
              min={1}
              max={150}
              defaultValue={filter.nivelMax ?? ""}
              className="tnum w-24 rounded border border-line bg-ink-sunken px-2 py-1.5 font-mono outline-none focus:border-amber-dim"
            />
          </label>
          <label>
            <span className="mb-1 block text-[11px] tracking-wide text-faint uppercase">
              Ordenar
            </span>
            <select
              name="orden"
              defaultValue={filter.orden ?? ""}
              className="rounded border border-line bg-ink-sunken px-2 py-1.5 outline-none focus:border-amber-dim"
            >
              <option value="">{filter.q ? "coincidencia" : "nivel ↓"}</option>
              {ORDERS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 pb-1.5 text-dim">
            <input
              type="checkbox"
              name="colocados"
              value="1"
              defaultChecked={filter.soloColocados}
              className="accent-amber"
            />
            solo los que están en el mapa
          </label>
          <label className="flex items-center gap-2 pb-1.5 text-dim">
            <input
              type="checkbox"
              name="vendedores"
              value="1"
              defaultChecked={filter.soloVendedores}
              className="accent-amber"
            />
            solo vendedores
          </label>
          <button
            type="submit"
            className="rounded border border-amber-dim bg-amber/10 px-3 py-1.5 text-amber hover:bg-amber/20"
          >
            Aplicar
          </button>
          <Link
            href="/npcs"
            className="rounded border border-line px-3 py-1.5 text-dim hover:border-amber-dim hover:text-amber"
          >
            Limpiar
          </Link>
        </form>
      </Panel>

      <Panel note={`${number(total)} resultado${total === 1 ? "" : "s"}`} title="Lista">
        {rows.length === 0 ? (
          <Empty>Ningún NPC cumple eso.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[11px] tracking-wide text-faint uppercase">
                  <th className="px-4 py-2 font-medium">NPC</th>
                  <th className="px-2 py-2 text-right font-medium">Nivel</th>
                  <th className="px-2 py-2 text-right font-medium">Salud</th>
                  <th className="px-2 py-2 text-right font-medium">Fuerza</th>
                  <th className="px-2 py-2 text-right font-medium">Destreza</th>
                  <th className="px-2 py-2 text-right font-medium">Dinero</th>
                  <th className="px-2 py-2 text-right font-medium">Botín</th>
                  <th className="px-4 py-2 text-right font-medium">Salas</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-line-soft last:border-0 hover:bg-ink-raised"
                  >
                    <td className="px-4 py-1.5">
                      <Link href={`/npcs/${row.id}`} className="block text-text hover:text-amber">
                        <span className="flex items-center gap-2">
                          {row.name || <span className="text-faint">sin nombre</span>}
                          {row.supply > 0 && <Badge tone="amber">vende</Badge>}
                        </span>
                        <span className="block truncate text-[11px] text-faint">
                          {row.model}
                        </span>
                      </Link>
                    </td>
                    <td className="px-2 py-1.5 text-right"><Level value={row.level} /></td>
                    <td className="tnum px-2 py-1.5 text-right font-mono text-dim">
                      {number(row.health)}
                    </td>
                    <td className="tnum px-2 py-1.5 text-right font-mono text-dim">
                      {number(row.strength)}
                    </td>
                    <td className="tnum px-2 py-1.5 text-right font-mono text-dim">
                      {number(row.dexterity)}
                    </td>
                    <td className="tnum px-2 py-1.5 text-right font-mono text-dim">
                      {row.money ? pesetas(row.money) : "—"}
                    </td>
                    <td className="tnum px-2 py-1.5 text-right font-mono text-dim">
                      {row.loot_count || "—"}
                    </td>
                    <td className="tnum px-4 py-1.5 text-right font-mono">
                      {row.places > 0 ? (
                        <span className="text-green">{row.places}</span>
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
        <Pager
          page={filter.pagina}
          perPage={PER_PAGE}
          total={total}
          params={carried}
          basePath="/npcs"
        />
      </Panel>
    </>
  );
}
