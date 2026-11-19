import Link from "next/link";
import type { Metadata } from "next";
import {
  crimes, itemGroupCounts, items, itemTypes, modsByItem,
} from "@/lib/queries";
import type { ItemMod } from "@/lib/model";
import { GROUPS, number, pesetas } from "@/lib/model";
import {
  Badge, Empty, GROUP_TONE, ItemIcon, Level, PageHead, Pager, Panel,
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

export const metadata: Metadata = { title: "Objetos" };

const PER_PAGE = 60;

const ORDERS = [
  ["nombre", "nombre"],
  ["nivel", "nivel ↓"],
  ["nivel-asc", "nivel ↑"],
  ["precio", "precio ↓"],
  ["precio-asc", "precio ↑"],
  ["peso", "peso ↓"],
  ["id", "id"],
] as const;

/**
 * The catalogue.
 *
 * Every filter lives in the URL and the form is a plain `GET`, so the page
 * needs no JavaScript to work, a filtered list can be linked to, and the back
 * button does what it should. The queries run against SQLite in the same
 * process, so there is no loading state to design around.
 */
export default async function Objetos({
  searchParams,
}: PageProps<"/objetos">) {
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
    grupo: str("grupo"),
    tipo: num("tipo"),
    nivelMin: num("nivelMin"),
    nivelMax: num("nivelMax"),
    delito: num("delito"),
    conMod: str("conMod") === "1",
    orden: str("orden"),
    pagina: num("pagina") ?? 1,
    porPagina: PER_PAGE,
  };

  const { rows, total } = items(filter);
  const mods = modsByItem(rows.map((row) => row.id));
  const groups = itemGroupCounts();
  const types = itemTypes();
  const everyCrime = crimes();

  const byGroup = Object.fromEntries(groups.map((g) => [g.grp, g.n]));
  const shownTypes = filter.grupo
    ? types.filter((t) => t.grp === filter.grupo)
    : types;

  // Everything except the page, so a changed filter goes back to page 1 and
  // the pager can put the rest back.
  const carried: Record<string, string | undefined> = {
    q: filter.q,
    grupo: filter.grupo,
    tipo: filter.tipo != null ? String(filter.tipo) : undefined,
    nivelMin: filter.nivelMin != null ? String(filter.nivelMin) : undefined,
    nivelMax: filter.nivelMax != null ? String(filter.nivelMax) : undefined,
    delito: filter.delito != null ? String(filter.delito) : undefined,
    conMod: filter.conMod ? "1" : undefined,
    orden: filter.orden,
  };

  const withOut = (drop: string[]) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(carried)) {
      if (value && !drop.includes(key)) query.set(key, value);
    }
    const text = query.toString();
    return text ? `/objetos?${text}` : "/objetos";
  };

  const groupHref = (grp?: string) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(carried)) {
      // Changing the tab drops the type: a type belongs to one tab.
      if (value && key !== "grupo" && key !== "tipo") query.set(key, value);
    }
    if (grp) query.set("grupo", grp);
    const text = query.toString();
    return text ? `/objetos?${text}` : "/objetos";
  };

  return (
    <>
      <PageHead eyebrow="catálogo" title="Objetos">
        {number(total)}
        {total === 1 ? " objeto" : " objetos"}
        {total !== 11240 && <> de {number(11240)}</>}
      </PageHead>

      {/* The game's own six inventory tabs. */}
      <nav className="mb-4 flex flex-wrap gap-1.5">
        <Link
          href={groupHref()}
          className={`rounded border px-2.5 py-1 text-[13px] ${
            !filter.grupo
              ? "border-amber-dim bg-amber/10 text-amber"
              : "border-line text-dim hover:border-amber-dim hover:text-amber"
          }`}
        >
          Todos
        </Link>
        {GROUPS.filter((grp) => byGroup[grp]).map((grp) => (
          <Link
            key={grp}
            href={groupHref(grp)}
            className={`rounded border px-2.5 py-1 text-[13px] ${
              filter.grupo === grp
                ? "border-amber-dim bg-amber/10 text-amber"
                : "border-line text-dim hover:border-amber-dim hover:text-amber"
            }`}
          >
            {grp}
            <span className="tnum ml-1.5 font-mono text-[11px] text-faint">
              {number(byGroup[grp])}
            </span>
          </Link>
        ))}
      </nav>

      <div className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
        {/* MARK: the filters */}
        <aside className="space-y-4">
          <Panel title="Filtrar">
            <form method="get" className="space-y-3 p-4">
              {filter.grupo && (
                <input type="hidden" name="grupo" value={filter.grupo} />
              )}
              <label className="block">
                <span className="mb-1 block text-[11px] tracking-wide text-faint uppercase">
                  Nombre
                </span>
                <input
                  name="q"
                  defaultValue={filter.q ?? ""}
                  placeholder="cuchillo, pantalon…"
                  className="w-full rounded border border-line bg-ink-sunken px-2 py-1.5 text-[13px] outline-none placeholder:text-faint focus:border-amber-dim"
                />
              </label>

              <fieldset>
                <legend className="mb-1 text-[11px] tracking-wide text-faint uppercase">
                  Nivel
                </legend>
                <div className="flex items-center gap-2">
                  <input
                    name="nivelMin"
                    type="number"
                    min={1}
                    max={150}
                    defaultValue={filter.nivelMin ?? ""}
                    placeholder="1"
                    className="tnum w-full rounded border border-line bg-ink-sunken px-2 py-1.5 font-mono text-[13px] outline-none placeholder:text-faint focus:border-amber-dim"
                  />
                  <span className="text-faint">–</span>
                  <input
                    name="nivelMax"
                    type="number"
                    min={1}
                    max={150}
                    defaultValue={filter.nivelMax ?? ""}
                    placeholder="150"
                    className="tnum w-full rounded border border-line bg-ink-sunken px-2 py-1.5 font-mono text-[13px] outline-none placeholder:text-faint focus:border-amber-dim"
                  />
                </div>
              </fieldset>

              <label className="block">
                <span className="mb-1 block text-[11px] tracking-wide text-faint uppercase">
                  Lo puede usar
                </span>
                <select
                  name="delito"
                  defaultValue={filter.delito != null ? String(filter.delito) : ""}
                  className="w-full rounded border border-line bg-ink-sunken px-2 py-1.5 text-[13px] outline-none focus:border-amber-dim"
                >
                  <option value="">cualquier delito</option>
                  {everyCrime.map((crime) => (
                    <option key={crime.id} value={crime.id}>
                      {crime.male_name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-[11px] tracking-wide text-faint uppercase">
                  Ordenar por
                </span>
                <select
                  name="orden"
                  defaultValue={filter.orden ?? ""}
                  className="w-full rounded border border-line bg-ink-sunken px-2 py-1.5 text-[13px] outline-none focus:border-amber-dim"
                >
                  <option value="">
                    {filter.q ? "coincidencia" : "nombre"}
                  </option>
                  {ORDERS.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2 text-[13px] text-dim">
                <input
                  type="checkbox"
                  name="conMod"
                  value="1"
                  defaultChecked={filter.conMod}
                  className="accent-amber"
                />
                solo con modificadores
              </label>

              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  className="flex-1 rounded border border-amber-dim bg-amber/10 px-3 py-1.5 text-[13px] text-amber hover:bg-amber/20"
                >
                  Aplicar
                </button>
                <Link
                  href={filter.grupo ? `/objetos?grupo=${filter.grupo}` : "/objetos"}
                  className="rounded border border-line px-3 py-1.5 text-[13px] text-dim hover:border-amber-dim hover:text-amber"
                >
                  Limpiar
                </Link>
              </div>
            </form>
          </Panel>

          <Panel
            title="Tipo"
            note={`${shownTypes.length} en uso`}
          >
            <ul className="max-h-[420px] overflow-y-auto p-2">
              {shownTypes
                .sort((a, b) => b.n - a.n)
                .map((type) => {
                  const query = new URLSearchParams();
                  for (const [key, value] of Object.entries(carried)) {
                    if (value && key !== "tipo") query.set(key, value);
                  }
                  const chosen = filter.tipo === type.type;
                  if (!chosen) query.set("tipo", String(type.type));
                  return (
                    <li key={type.type}>
                      <Link
                        href={`/objetos?${query.toString()}`}
                        className={`flex items-baseline justify-between gap-2 rounded px-2 py-1 text-[13px] ${
                          chosen
                            ? "bg-amber/10 text-amber"
                            : "text-dim hover:bg-ink-raised hover:text-text"
                        }`}
                      >
                        <span className="truncate">
                          {type.label}
                          {type.label_source === "derivada" && (
                            <span
                              title="El cliente no nombra este tipo; la etiqueta es de la guía"
                              className="ml-1 text-faint"
                            >
                              *
                            </span>
                          )}
                        </span>
                        <span className="tnum font-mono text-[11px] text-faint">
                          {number(type.n)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
            </ul>
            <p className="border-t border-line-soft px-4 py-2 text-[11px] leading-snug text-faint">
              * El cliente solo nombra los tipos 1 a 14. Los demás los etiqueta
              la guía a partir de los objetos que caen en cada uno.
            </p>
          </Panel>
        </aside>

        {/* MARK: the list */}
        <Panel
          title={filter.grupo ?? "Todos los grupos"}
          note={`${number(total)} resultado${total === 1 ? "" : "s"}`}
        >
          {/* The chips say what is currently narrowing the list, and each one
              takes itself off. A filter you cannot see is a filter you will
              blame the data for. */}
          {(filter.q || filter.tipo != null || filter.nivelMin != null
            || filter.nivelMax != null || filter.delito != null || filter.conMod) && (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-line-soft px-4 py-2 text-[12px]">
              {filter.q && (
                <Chip href={withOut(["q"])}>«{filter.q}»</Chip>
              )}
              {filter.tipo != null && (
                <Chip href={withOut(["tipo"])}>
                  {types.find((t) => t.type === filter.tipo)?.label
                    ?? `tipo ${filter.tipo}`}
                </Chip>
              )}
              {(filter.nivelMin != null || filter.nivelMax != null) && (
                <Chip href={withOut(["nivelMin", "nivelMax"])}>
                  nivel {filter.nivelMin ?? 1}–{filter.nivelMax ?? 150}
                </Chip>
              )}
              {filter.delito != null && (
                <Chip href={withOut(["delito"])}>
                  {everyCrime.find((c) => c.id === filter.delito)?.male_name}
                </Chip>
              )}
              {filter.conMod && (
                <Chip href={withOut(["conMod"])}>con modificadores</Chip>
              )}
            </div>
          )}

          {rows.length === 0 ? (
            <Empty>Ningún objeto cumple eso.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] tracking-wide text-faint uppercase">
                    <th className="px-4 py-2 font-medium">Objeto</th>
                    <th className="px-2 py-2 font-medium">Tipo</th>
                    <th className="px-2 py-2 text-right font-medium">Nivel</th>
                    <th className="px-2 py-2 text-right font-medium">Precio</th>
                    <th className="px-2 py-2 text-right font-medium">Peso</th>
                    <th className="px-4 py-2 font-medium">Modificadores</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-line-soft last:border-0 hover:bg-ink-raised"
                    >
                      <td className="px-4 py-1.5">
                        <Link
                          href={`/objetos/${row.id}`}
                          className="flex items-center gap-2.5 text-text hover:text-amber"
                        >
                          <ItemIcon icon={row.icon} size={28} />
                          <span className="min-w-0">
                            <span className="block truncate">{row.name}</span>
                            <span className="tnum block font-mono text-[11px] text-faint">
                              #{row.id}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-2 py-1.5">
                        <Badge tone={GROUP_TONE[row.grp]}>{row.label}</Badge>
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <Level value={row.level} />
                      </td>
                      <td className="tnum px-2 py-1.5 text-right font-mono text-dim">
                        {row.price ? pesetas(row.price) : "—"}
                      </td>
                      <td className="tnum px-2 py-1.5 text-right font-mono text-dim">
                        {row.weight}
                      </td>
                      <td className="px-4 py-1.5 text-dim">
                        <Mods mods={mods.get(row.id)} />
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
            basePath="/objetos"
          />
        </Panel>
      </div>
    </>
  );
}

function Chip({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-1 rounded border border-amber-dim bg-amber/10 px-1.5 py-0.5 text-amber hover:bg-amber/20"
    >
      {children}
      <span aria-hidden className="text-amber/60 group-hover:text-amber">×</span>
    </Link>
  );
}

/**
 * The modifiers of one row, out of the one query the page made for all of them.
 *
 * Only the first four are shown: a few items carry ten, and a row that wraps to
 * three lines makes the whole table unreadable to save a number nobody is
 * comparing at this zoom.
 */
function Mods({ mods }: { mods?: ItemMod[] }) {
  if (!mods?.length) return <span className="text-faint">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {mods.slice(0, 4).map((mod, index) => (
        <span
          key={index}
          className={`tnum font-mono text-[11px] ${mod.value < 0 ? "text-red" : "text-green"}`}
        >
          {mod.name ?? `stat ${mod.stat}`} {mod.value > 0 ? "+" : "−"}
          {Math.abs(mod.value)}
        </span>
      ))}
      {mods.length > 4 && (
        <span className="text-[11px] text-faint">+{mods.length - 4}</span>
      )}
    </span>
  );
}
