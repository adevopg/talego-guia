import Link from "next/link";
import type { Metadata } from "next";
import { recipes, skills } from "@/lib/queries";
import { number } from "@/lib/model";
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


export const metadata: Metadata = { title: "Recetas" };

const PER_PAGE = 50;

const KINDS = [
  ["receta", "recetas", "violet"],
  ["compra", "compras", "amber"],
  ["venta", "ventas", "green"],
] as const;

/**
 * The recipe book.
 *
 * What the tables call an article is one line of what a vendor will do, and
 * **money is item 1** — which is the whole of the difference between the three
 * kinds here. An article that asks for money alone is a purchase; one that asks
 * for real items is a recipe; one that hands money back is the player selling.
 *
 * Only the articles with a real label are listed: 12 094 of the 15 490 are
 * named `VOID`, the vendors' own plumbing, and nobody can look those up.
 */
export default async function Recetas({ searchParams }: PageProps<"/recetas">) {
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

  const kind = str("tipo") as "receta" | "compra" | "venta" | undefined;
  const filter = {
    q: str("q"),
    kind,
    skill: num("habilidad"),
    nivelMax: num("nivelMax"),
    pagina: num("pagina") ?? 1,
    porPagina: PER_PAGE,
  };

  const { rows, total } = recipes(filter);
  const everySkill = skills();

  const carried: Record<string, string | undefined> = {
    q: filter.q,
    tipo: kind,
    habilidad: filter.skill != null ? String(filter.skill) : undefined,
    nivelMax: filter.nivelMax != null ? String(filter.nivelMax) : undefined,
  };

  const kindHref = (value?: string) => {
    const query = new URLSearchParams();
    for (const [key, carriedValue] of Object.entries(carried)) {
      if (carriedValue && key !== "tipo") query.set(key, carriedValue);
    }
    if (value) query.set("tipo", value);
    const text = query.toString();
    return text ? `/recetas?${text}` : "/recetas";
  };

  return (
    <>
      <PageHead eyebrow="combinaciones" title="Recetas">
        {number(total)} con nombre. El dinero es el objeto 1, así que un
        artículo que solo pide dinero es una compra y uno que pide objetos de
        verdad es una receta.
      </PageHead>

      <nav className="mb-4 flex flex-wrap gap-1.5">
        <Link
          href={kindHref()}
          className={`rounded border px-2.5 py-1 text-[13px] ${
            !kind
              ? "border-amber-dim bg-amber/10 text-amber"
              : "border-line text-dim hover:border-amber-dim hover:text-amber"
          }`}
        >
          Todas
        </Link>
        {KINDS.map(([value, label]) => (
          <Link
            key={value}
            href={kindHref(value)}
            className={`rounded border px-2.5 py-1 text-[13px] ${
              kind === value
                ? "border-amber-dim bg-amber/10 text-amber"
                : "border-line text-dim hover:border-amber-dim hover:text-amber"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      <Panel className="mb-5">
        <form method="get" className="flex flex-wrap items-end gap-3 p-4 text-[13px]">
          {kind && <input type="hidden" name="tipo" value={kind} />}
          <label className="min-w-[200px] flex-1">
            <span className="mb-1 block text-[11px] tracking-wide text-faint uppercase">
              Nombre o lo que produce
            </span>
            <input
              name="q"
              defaultValue={filter.q ?? ""}
              placeholder="huevo duro, cuchillo…"
              className="w-full rounded border border-line bg-ink-sunken px-2 py-1.5 outline-none placeholder:text-faint focus:border-amber-dim"
            />
          </label>
          <label>
            <span className="mb-1 block text-[11px] tracking-wide text-faint uppercase">
              Habilidad
            </span>
            <select
              name="habilidad"
              defaultValue={filter.skill != null ? String(filter.skill) : ""}
              className="rounded border border-line bg-ink-sunken px-2 py-1.5 outline-none focus:border-amber-dim"
            >
              <option value="">cualquiera</option>
              {everySkill.map((skill) => (
                <option key={skill.id} value={skill.id}>{skill.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-[11px] tracking-wide text-faint uppercase">
              Nivel máximo
            </span>
            <input
              name="nivelMax"
              type="number"
              min={0}
              max={250}
              defaultValue={filter.nivelMax ?? ""}
              className="tnum w-24 rounded border border-line bg-ink-sunken px-2 py-1.5 font-mono outline-none focus:border-amber-dim"
            />
          </label>
          <button
            type="submit"
            className="rounded border border-amber-dim bg-amber/10 px-3 py-1.5 text-amber hover:bg-amber/20"
          >
            Aplicar
          </button>
          <Link
            href="/recetas"
            className="rounded border border-line px-3 py-1.5 text-dim hover:border-amber-dim hover:text-amber"
          >
            Limpiar
          </Link>
        </form>
      </Panel>

      <Panel title="Lista" note={`${number(total)} resultado${total === 1 ? "" : "s"}`}>
        {rows.length === 0 ? (
          <Empty>Ninguna receta cumple eso.</Empty>
        ) : (
          <ul className="divide-y divide-line-soft">
            {rows.map((row) => (
              <li key={row.id} className="px-4 py-2.5 hover:bg-ink-raised">
                <Link href={`/recetas/${row.id}`} className="block">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[14px] text-text">{row.name}</span>
                    <Badge
                      tone={
                        row.kind === "receta" ? "violet"
                        : row.kind === "compra" ? "amber"
                        : "green"
                      }
                    >
                      {row.kind}
                    </Badge>
                    {row.level > 0 && (
                      <span className="text-[11px] text-faint">
                        nivel <Level value={row.level} />
                      </span>
                    )}
                    {row.skill_name && (
                      <Badge tone="violet">{row.skill_name}</Badge>
                    )}
                    <span className="ml-auto text-[11px] text-faint">
                      {row.vendor_note ?? `vendedor ${row.supply_id}`}
                    </span>
                  </div>
                  <div className="mt-1 grid gap-x-4 gap-y-0.5 text-[12px] sm:grid-cols-2">
                    <p className="text-dim">
                      <span className="text-faint">pide </span>
                      {row.wants ?? <span className="text-faint">nada</span>}
                    </p>
                    <p className="text-green">
                      <span className="text-faint">da </span>
                      {row.makes ?? <span className="text-faint">nada</span>}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Pager
          page={filter.pagina}
          perPage={PER_PAGE}
          total={total}
          params={carried}
          basePath="/recetas"
        />
      </Panel>
    </>
  );
}
