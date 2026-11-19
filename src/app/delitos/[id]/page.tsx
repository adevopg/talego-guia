import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { crimeDetail, trainersOf } from "@/lib/queries";
import { number } from "@/lib/model";
import { Badge, Empty, PageHead, Panel, Row } from "@/components/ui";

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
  { params }: PageProps<"/delitos/[id]">,
): Promise<Metadata> {
  const { id } = await params;
  const { crime } = crimeDetail(Number(id));
  return { title: crime ? crime.male_name : "Delito" };
}

/** One crime: where it starts, and what it can learn. */
export default async function Delito({ params }: PageProps<"/delitos/[id]">) {
  const { id } = await params;
  const detail = crimeDetail(Number(id));
  if (!detail.crime) notFound();
  const { crime, characteristics, skills, startingItems } = detail;

  // A skill a crime can never use is noise on this page; the ones it starts
  // with and the ones it can be taught are the page.
  const usable = skills.filter((skill) => skill.initial > 0 || skill.ceiling > 0);
  const fromStart = usable.filter((skill) => skill.initial > 0);
  const learnable = usable.filter((skill) => skill.initial === 0);

  const trainers = new Map(
    learnable.flatMap((skill) =>
      trainersOf(skill.skill_id).map((trainer) => [skill.skill_id, trainer] as const)),
  );

  return (
    <>
      <PageHead eyebrow="delito" title={crime.male_name}>
        {crime.female_name !== crime.male_name && <>en femenino, {crime.female_name} · </>}
        <span className="font-mono">{crime.abbreviation}</span>
        {" · "}
        <Link href={`/objetos?delito=${crime.id}`} className="text-amber hover:underline">
          ver lo que puede usar
        </Link>
      </PageHead>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Panel title="Atributos de salida">
            <dl>
              {characteristics.map((stat) => (
                <Row key={stat.stat_id} label={stat.name}>
                  {stat.initial}
                </Row>
              ))}
            </dl>
          </Panel>

          <Panel
            title="Con lo que entra"
            note={startingItems.length ? undefined : "el cliente no recibe esto"}
          >
            {startingItems.length === 0 ? (
              <Empty>
                No consta. Lo que un delito trae de serie es lo único que el
                CLASSINFO no lleva —el cliente nunca se lo dice— así que solo
                existe si el mapa ya lo guardaba.
              </Empty>
            ) : (
              <ul className="divide-y divide-line-soft">
                {startingItems.map((entry) => (
                  <li key={entry.item_id} className="px-4 py-1.5 text-[13px]">
                    <Link href={`/objetos/${entry.item_id}`} className="text-dim hover:text-amber">
                      {entry.name ?? `objeto ${entry.item_id}`}
                    </Link>
                    {entry.quantity > 1 && (
                      <span className="tnum ml-2 font-mono text-[11px] text-amber">
                        ×{entry.quantity}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel
            title="Habilidades de salida"
            note={`${fromStart.length} de ${number(48)}`}
          >
            {fromStart.length === 0 ? (
              <Empty>Ninguna.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-line text-left text-[11px] tracking-wide text-faint uppercase">
                      <th className="px-4 py-2 font-medium">Habilidad</th>
                      <th className="px-2 py-2 text-right font-medium">Inicial</th>
                      <th className="px-2 py-2 text-right font-medium">Tope</th>
                      <th className="px-4 py-2 text-right font-medium">Nivel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fromStart.map((skill) => (
                      <tr
                        key={skill.skill_id}
                        className="border-b border-line-soft last:border-0 hover:bg-ink-raised"
                      >
                        <td className="px-4 py-1.5 text-text">{skill.name}</td>
                        <td className="tnum px-2 py-1.5 text-right font-mono text-green">
                          {skill.initial}
                        </td>
                        <td className="tnum px-2 py-1.5 text-right font-mono text-dim">
                          {skill.ceiling}
                        </td>
                        <td className="tnum px-4 py-1.5 text-right font-mono text-dim">
                          {skill.level || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel
            title="Habilidades que puede aprender"
            note={`${learnable.length}, con tope pero sin valor inicial`}
          >
            {learnable.length === 0 ? (
              <Empty>Ninguna.</Empty>
            ) : (
              <ul className="grid gap-x-4 gap-y-0.5 p-3 sm:grid-cols-2">
                {learnable.map((skill) => {
                  const trainer = trainers.get(skill.skill_id);
                  return (
                    <li
                      key={skill.skill_id}
                      className="flex items-baseline gap-2 py-0.5 text-[13px]"
                    >
                      <span className="min-w-0 flex-1 truncate text-dim">
                        {skill.name}
                      </span>
                      <span className="tnum font-mono text-[11px] text-faint">
                        tope {skill.ceiling}
                      </span>
                      {trainer && (
                        <Link href={`/salas/${trainer.room_id}`}>
                          <Badge tone="violet" title={trainer.name_es}>
                            {trainer.dept_es}
                          </Badge>
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="border-t border-line-soft px-4 py-2 text-[11px] leading-snug text-faint">
              Las etiquetas en violeta son el departamento donde está el
              entrenador, de{" "}
              <code className="font-mono">skilltrainers.txt</code> del cliente.
            </p>
          </Panel>
        </div>
      </div>
    </>
  );
}
